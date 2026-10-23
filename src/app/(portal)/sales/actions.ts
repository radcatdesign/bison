"use server";

// Sales actions: products, discount codes, estimates, orders, trade accounts,
// checkout and shipping settings, and connections. Each one re-reads the
// session, then checks the plan and the person's role on the server. The
// catalog, codes and settings are content and save even with sample data on;
// estimates, orders and trade accounts are data, so sample mode refuses them.
import { refresh } from "next/cache";
import type { FeatureKey } from "@/config/features";
import { type Action, may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { audit } from "@/lib/audit";
import { isUuid, withTenant } from "@/lib/db";
import { DEMO_MESSAGE } from "@/lib/demo";
import { appUrl, demoMode } from "@/lib/env";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";
import { SampleModeError } from "@/lib/repo/types";
import { CarrierError } from "@/lib/sales/carriers";
import { parseProduct, ProductInputError } from "@/lib/sales/catalog";
import { disconnectPayments, refreshPayments } from "@/lib/sales/connect";
import { createShare, revokeShare, ShareError } from "@/lib/sales/contact-share";
import { DiscountError, deleteDiscount, saveDiscount } from "@/lib/sales/discount-codes";
import { DiscountInputError, parseDiscount } from "@/lib/sales/discounts";
import { salesSender, sendOne, tradeLinkEmail } from "@/lib/sales/emails";
import { EstimateInputError, parseEstimate } from "@/lib/sales/estimate-input";
import { createEstimate, deleteEstimate, duplicateEstimate, EstimateError, invoiceEstimate, markEstimatePaid, saveEstimate, sendEstimate, voidEstimate } from "@/lib/sales/estimates";
import { ImportError, importCsv, importFeed, importShopifyJson, type ImportResult, MAX_IMPORT_BYTES, shopifyProductsUrl } from "@/lib/sales/imports";
import { alertTeam, markShipped, OrderError, refundOrder, sendToFulfillment } from "@/lib/sales/orders";
import { deleteProduct, ProductError, saveImported, saveProduct, setProductStatus } from "@/lib/sales/products";
import { fetchPublicText, RemoteError } from "@/lib/sales/remote";
import { parseSales, SalesInputError, shippingSettingsSchema, storeSettingsSchema, tradeSettingsSchema } from "@/lib/sales/settings";
import { carrierFrom, getSalesSettings, removeCarrier, saveSalesPart, writeCarrier } from "@/lib/sales/store";
import { decideTrade, TradeError, tradeLinkUrl } from "@/lib/sales/trade";

export type SalesResult = { ok: boolean; message: string; id?: string; url?: string };

const ROLE_MESSAGES: Partial<Record<Action, string>> = {
  "sales.edit": "Your role can't change estimates, orders or the catalog.",
  "settings.manage": "Only owners and admins can change connections.",
  "refunds.issue": "Your role can't issue refunds.",
  "email.send": "Your role can't send email.",
  "data.delete": "Only owners and admins can delete that.",
};

type Guarded = { ctx: PortalContext; error: null } | { ctx: PortalContext; error: string };

async function guard(action: Action, feature: FeatureKey, opts: { data?: boolean } = {}): Promise<Guarded> {
  const ctx = await getPortalContext();
  if (!can(ctx.tenant, feature)) return { ctx, error: "This is part of Sales. Unlock Sales to use it." };
  if (!may(ctx.member.role, action)) return { ctx, error: ROLE_MESSAGES[action] ?? "Your role can't do that." };
  if (demoMode()) return { ctx, error: DEMO_MESSAGE };
  if (opts.data && ctx.settings.sampleData) return { ctx, error: new SampleModeError().message };
  return { ctx, error: null };
}

const KNOWN = [ShareError, ProductInputError, ProductError, DiscountError, DiscountInputError, EstimateError, EstimateInputError, OrderError, SalesInputError, TradeError, ImportError, RemoteError, CarrierError];

function failed(err: unknown, fallback: string): SalesResult {
  if (KNOWN.some((K) => err instanceof K)) return { ok: false, message: (err as Error).message };
  console.error(fallback, err);
  return { ok: false, message: fallback };
}

const actor = (ctx: PortalContext) => ctx.member.email;

// ---- Products ---------------------------------------------------------------------------

export async function saveProductAction(id: string | null, input: unknown): Promise<SalesResult> {
  const { ctx, error } = await guard("sales.edit", "sales.products");
  if (error) return { ok: false, message: error };
  if (id !== null && !isUuid(id)) return { ok: false, message: "That product isn't here anymore." };
  try {
    const product = parseProduct(input);
    const saved = await withTenant(scopeOf(ctx), async (tx) => {
      const pid = await saveProduct(tx, product, { id });
      await audit(tx, { action: id ? "product.updated" : "product.created", targetType: "product", targetId: pid, detail: { name: product.name, status: product.status } });
      return pid;
    });
    refresh();
    return { ok: true, message: product.status === "active" ? "Saved. It's live in your shop." : "Saved.", id: saved };
  } catch (err) {
    return failed(err, "Couldn't save the product. Try again.");
  }
}

export async function setProductStatusAction(id: string, status: "active" | "draft" | "archived"): Promise<SalesResult> {
  const { ctx, error } = await guard("sales.edit", "sales.products");
  if (error) return { ok: false, message: error };
  if (!isUuid(id) || !["active", "draft", "archived"].includes(status)) return { ok: false, message: "That didn't work." };
  await withTenant(scopeOf(ctx), (tx) => setProductStatus(tx, id, status));
  refresh();
  return { ok: true, message: status === "archived" ? "Archived. It's off the shop and out of the list." : status === "active" ? "It's live in your shop." : "It's a draft now, hidden from the shop." };
}

export async function deleteProductAction(id: string): Promise<SalesResult> {
  const { ctx, error } = await guard("sales.edit", "sales.products");
  if (error) return { ok: false, message: error };
  if (!isUuid(id)) return { ok: false, message: "That product isn't here anymore." };
  await withTenant(scopeOf(ctx), async (tx) => {
    await deleteProduct(tx, id);
    await audit(tx, { action: "product.deleted", targetType: "product", targetId: id });
  });
  refresh();
  return { ok: true, message: "Deleted. Past orders keep what was bought." };
}

/** A file (CSV, Shopify export, feed) or an address (Shopify store, feed URL). */
export async function importProductsAction(formData: FormData): Promise<SalesResult & { skipped?: string[] }> {
  const { ctx, error } = await guard("sales.edit", "sales.products");
  if (error) return { ok: false, message: error };
  const file = formData.get("file");
  const address = String(formData.get("url") ?? "").trim();
  const kind = String(formData.get("kind") ?? "file");
  let result: ImportResult;
  try {
    if (kind === "shopify-store") {
      const pages: Parameters<typeof importShopifyJson>[0] = [];
      for (let page = 1; page <= 4; page++) {
        const url = shopifyProductsUrl(address, page);
        if (!url) return { ok: false, message: "Enter your Shopify store's address, like yourstore.com or yourstore.myshopify.com." };
        const text = await fetchPublicText(url);
        let json: { products?: unknown[] };
        try {
          json = JSON.parse(text) as { products?: unknown[] };
        } catch {
          return { ok: false, message: "That doesn't look like a Shopify store. Check the address, or import a product export file instead." };
        }
        pages.push(json as never);
        if (!json.products?.length || json.products.length < 250) break;
      }
      result = importShopifyJson(pages);
    } else if (kind === "feed-url") {
      result = importFeed(await fetchPublicText(address));
    } else {
      if (!(file instanceof File) || !file.size) return { ok: false, message: "Pick a file to import." };
      if (file.size > MAX_IMPORT_BYTES) return { ok: false, message: "That file is over 5 MB. Split it into smaller files." };
      const text = await file.text();
      result = /\.(xml|tsv|txt)$/i.test(file.name) || text.trimStart().startsWith("<") ? importFeed(text) : importCsv(text);
    }
    if (!result.products.length) return { ok: false, message: result.skipped.length ? `Nothing could be imported. ${result.skipped.slice(0, 3).join(" ")}` : "No products found in that." };
    const source = result.format === "csv" ? "csv" : result.format === "feed" ? "feed" : "shopify";
    const summary = await withTenant(scopeOf(ctx), async (tx) => {
      const s = await saveImported(tx, result.products, source);
      await audit(tx, { action: "product.imported", detail: { source, created: s.created, updated: s.updated, failed: s.failed.length } });
      return s;
    });
    refresh();
    const parts = [summary.created ? `Added ${summary.created}` : "", summary.updated ? `updated ${summary.updated}` : ""].filter(Boolean).join(", ");
    return { ok: summary.created + summary.updated > 0, message: `${parts || "Nothing changed"}${summary.failed.length ? `. ${summary.failed.length} couldn't be saved.` : "."} Check weights and boxes before you turn on live rates.`, skipped: [...result.skipped, ...summary.failed].slice(0, 20) };
  } catch (err) {
    return failed(err, "Couldn't import that. Try again, or try a different file.");
  }
}

// ---- Discount codes ------------------------------------------------------------------------

export async function saveDiscountAction(id: string | null, input: unknown): Promise<SalesResult> {
  const { ctx, error } = await guard("sales.edit", "sales.discounts");
  if (error) return { ok: false, message: error };
  try {
    const d = parseDiscount(input);
    const saved = await withTenant(scopeOf(ctx), async (tx) => {
      const did = await saveDiscount(tx, d, id && isUuid(id) ? id : null, actor(ctx));
      await audit(tx, { action: id ? "discount.updated" : "discount.created", targetType: "discount", targetId: did, detail: { code: d.code } });
      return did;
    });
    refresh();
    return { ok: true, message: `${d.code} is saved.`, id: saved };
  } catch (err) {
    return failed(err, "Couldn't save the code. Try again.");
  }
}

export async function deleteDiscountAction(id: string): Promise<SalesResult> {
  const { ctx, error } = await guard("sales.edit", "sales.discounts");
  if (error) return { ok: false, message: error };
  if (!isUuid(id)) return { ok: false, message: "That code isn't here anymore." };
  await withTenant(scopeOf(ctx), async (tx) => {
    await deleteDiscount(tx, id);
    await audit(tx, { action: "discount.deleted", targetType: "discount", targetId: id });
  });
  refresh();
  return { ok: true, message: "Deleted. Orders that used it keep their discount." };
}

// ---- Estimates -------------------------------------------------------------------------------

export async function createEstimateAction(input: unknown): Promise<SalesResult> {
  const { ctx, error } = await guard("sales.edit", "sales.estimates", { data: true });
  if (error) return { ok: false, message: error };
  try {
    const e = parseEstimate(input);
    const r = await withTenant(scopeOf(ctx), (tx) => createEstimate(tx, e, actor(ctx)));
    return { ok: true, message: `Estimate #${r.number} started.`, id: r.id };
  } catch (err) {
    return failed(err, "Couldn't start the estimate. Try again.");
  }
}

export async function saveEstimateAction(id: string, input: unknown): Promise<SalesResult> {
  const { ctx, error } = await guard("sales.edit", "sales.estimates", { data: true });
  if (error) return { ok: false, message: error };
  if (!isUuid(id)) return { ok: false, message: "That estimate isn't here anymore." };
  try {
    const e = parseEstimate(input);
    await withTenant(scopeOf(ctx), (tx) => saveEstimate(tx, id, e, actor(ctx)));
    return { ok: true, message: "Saved" };
  } catch (err) {
    return failed(err, "Couldn't save. Check your connection and try again.");
  }
}

export async function sendEstimateAction(id: string, message: string): Promise<SalesResult> {
  const { ctx, error } = await guard("email.send", "sales.estimates", { data: true });
  if (error) return { ok: false, message: error };
  if (!may(ctx.member.role, "sales.edit")) return { ok: false, message: ROLE_MESSAGES["sales.edit"]! };
  if (!isUuid(id)) return { ok: false, message: "That estimate isn't here anymore." };
  try {
    const r = await sendEstimate(ctx.tenant.id, id, { message: String(message ?? "").slice(0, 2000), actor: actor(ctx), actorEmail: ctx.member.email });
    refresh();
    return r;
  } catch (err) {
    return failed(err, "Couldn't send it. Try again.");
  }
}

export async function estimateAction(id: string, what: "void" | "duplicate" | "delete" | "invoice" | "paid", note = ""): Promise<SalesResult> {
  const { ctx, error } = await guard(what === "delete" ? "sales.edit" : "sales.edit", "sales.estimates", { data: true });
  if (error) return { ok: false, message: error };
  if (!isUuid(id)) return { ok: false, message: "That estimate isn't here anymore." };
  try {
    if (what === "void") {
      const r = await voidEstimate(ctx.tenant.id, id, actor(ctx));
      refresh();
      return r;
    }
    if (what === "duplicate") {
      const r = await withTenant(scopeOf(ctx), (tx) => duplicateEstimate(tx, id, actor(ctx)));
      return { ok: true, message: `Copied as estimate #${r.number}.`, id: r.id };
    }
    if (what === "delete") {
      await withTenant(scopeOf(ctx), (tx) => deleteEstimate(tx, id));
      return { ok: true, message: "Deleted." };
    }
    if (what === "invoice") {
      const url = await invoiceEstimate(ctx.tenant.id, id);
      refresh();
      return url ? { ok: true, message: "The invoice is ready.", url } : { ok: false, message: "Stripe didn't make the invoice. The history says why. Check Settings, Payments." };
    }
    const r = await markEstimatePaid(ctx.tenant.id, id, actor(ctx), note);
    refresh();
    return r;
  } catch (err) {
    return failed(err, "That didn't work. Try again.");
  }
}

// ---- Orders ------------------------------------------------------------------------------------

export async function refundAction(id: string, amountCents: number): Promise<SalesResult> {
  const { ctx, error } = await guard("refunds.issue", "sales.orders", { data: true });
  if (error) return { ok: false, message: error };
  if (!isUuid(id)) return { ok: false, message: "That order isn't here anymore." };
  const r = await refundOrder(ctx.tenant.id, id, Math.round(Number(amountCents)), actor(ctx));
  refresh();
  return r;
}

export async function orderAction(id: string, what: "alert" | "fulfill" | "shipped", tracking = ""): Promise<SalesResult> {
  const { ctx, error } = await guard("sales.edit", "sales.orders", { data: true });
  if (error) return { ok: false, message: error };
  if (!isUuid(id)) return { ok: false, message: "That order isn't here anymore." };
  try {
    if (what === "alert") {
      const d = await alertTeam(ctx.tenant.id, id);
      refresh();
      return d.error ? { ok: false, message: d.error } : { ok: true, message: `Sent to ${(d.to ?? []).join(", ")}.` };
    }
    if (what === "fulfill") {
      const r = await sendToFulfillment(ctx.tenant.id, id);
      refresh();
      return r;
    }
    await withTenant(scopeOf(ctx), async (tx) => {
      await markShipped(tx, id, tracking);
      await audit(tx, { action: "order.shipped", targetType: "order", targetId: id });
    });
    refresh();
    return { ok: true, message: "Marked as shipped." };
  } catch (err) {
    return failed(err, "That didn't work. Try again.");
  }
}

// ---- Trade accounts -------------------------------------------------------------------------------

export async function decideTradeAction(id: string, status: "approved" | "declined" | "paused"): Promise<SalesResult> {
  const { ctx, error } = await guard("sales.edit", "sales.trade", { data: true });
  if (error) return { ok: false, message: error };
  if (!isUuid(id) || !["approved", "declined", "paused"].includes(status)) return { ok: false, message: "That didn't work." };
  const r = await withTenant(scopeOf(ctx), async (tx) => {
    const d = await decideTrade(tx, id, status, actor(ctx));
    await audit(tx, { action: `trade.${status}`, targetType: "trade_account", targetId: id });
    return d ? { ...d, sender: status === "approved" ? await salesSender(tx) : null } : null;
  });
  if (!r) return { ok: false, message: "That account isn't here anymore." };
  refresh();
  if (status !== "approved") return { ok: true, message: status === "paused" ? "Paused. They're signed out and see regular prices." : "Declined. They see regular prices." };
  const mail = r.sender ? tradeLinkEmail(r.sender, { company: r.company, name: r.name, url: tradeLinkUrl(ctx.tenant.slug, id, r.version), approved: true }) : { subject: "", html: "", text: "" };
  const d = await sendOne(r.sender, { to: r.email, replyTo: ctx.member.email, ...mail, kind: "trade-approved", ref: id }, `bison/trade-approved/${id}/${r.version}`);
  return d.error ? { ok: true, message: `Approved. The welcome email didn't send: ${d.error}` } : { ok: true, message: `Approved. ${r.email} got an email with a link to sign in.` };
}

export async function saveTradeAccountAction(id: string, input: { tierOverride: string; note: string }): Promise<SalesResult> {
  const { ctx, error } = await guard("sales.edit", "sales.trade", { data: true });
  if (error) return { ok: false, message: error };
  if (!isUuid(id)) return { ok: false, message: "That account isn't here anymore." };
  const settings = await withTenant(scopeOf(ctx), (tx) => getSalesSettings(tx));
  const tier = String(input.tierOverride ?? "");
  if (tier && !settings.trade.tiers.some((t) => t.key === tier)) return { ok: false, message: "Pick one of your tiers." };
  await withTenant(scopeOf(ctx), (tx) => tx.updateTable("trade_accounts").set({ tier_override: tier, note: String(input.note ?? "").slice(0, 2000) }).where("id", "=", id).execute());
  refresh();
  return { ok: true, message: "Saved." };
}

export async function sendTradeLinkAction(id: string): Promise<SalesResult> {
  const { ctx, error } = await guard("email.send", "sales.trade", { data: true });
  if (error) return { ok: false, message: error };
  if (!isUuid(id)) return { ok: false, message: "That account isn't here anymore." };
  const r = await withTenant(scopeOf(ctx), async (tx) => ({ a: await tx.selectFrom("trade_accounts").select(["email", "company", "contact_name", "status", "session_version"]).where("id", "=", id).executeTakeFirst(), sender: await salesSender(tx) }));
  if (!r.a) return { ok: false, message: "That account isn't here anymore." };
  if (r.a.status !== "approved") return { ok: false, message: "Approve the account first." };
  const mail = r.sender ? tradeLinkEmail(r.sender, { company: r.a.company, name: r.a.contact_name, url: tradeLinkUrl(ctx.tenant.slug, id, r.a.session_version), approved: false }) : { subject: "", html: "", text: "" };
  const d = await sendOne(r.sender, { to: r.a.email, replyTo: ctx.member.email, ...mail, kind: "trade-link", ref: id }, `bison/trade-link/${id}/${Date.now()}`);
  return d.error ? { ok: false, message: d.error } : { ok: true, message: `Sent a sign-in link to ${r.a.email}.` };
}

// ---- Settings -------------------------------------------------------------------------------------

export async function saveSalesSettingsAction(part: "store" | "shipping" | "trade", input: unknown): Promise<SalesResult> {
  const feature: FeatureKey = part === "trade" ? "sales.trade" : "sales.checkout";
  const { ctx, error } = await guard("sales.edit", feature);
  if (error) return { ok: false, message: error };
  try {
    await withTenant(scopeOf(ctx), async (tx) => {
      if (part === "store") await saveSalesPart(tx, "store", parseSales(storeSettingsSchema, input));
      else if (part === "shipping") await saveSalesPart(tx, "shipping", parseSales(shippingSettingsSchema, input));
      else await saveSalesPart(tx, "trade", parseSales(tradeSettingsSchema, input));
      await audit(tx, { action: `sales.settings.${part}` });
    });
    refresh();
    return { ok: true, message: "Saved." };
  } catch (err) {
    return failed(err, "Couldn't save. Try again.");
  }
}

// ---- Connections ------------------------------------------------------------------------------------

export async function checkPaymentsAction(): Promise<SalesResult> {
  const { ctx, error } = await guard("settings.manage", "sales.checkout");
  if (error) return { ok: false, message: error };
  const p = await refreshPayments(ctx.tenant.id);
  refresh();
  if (p.error) return { ok: false, message: p.error };
  return { ok: true, message: p.chargesEnabled ? (p.tax === "active" ? "Connected, and Stripe Tax is on." : "Connected. Stripe Tax isn't on in your Stripe account yet.") : "Stripe still needs a few details from you." };
}

export async function disconnectPaymentsAction(): Promise<SalesResult> {
  const { ctx, error } = await guard("settings.manage", "sales.checkout");
  if (error) return { ok: false, message: error };
  if (ctx.member.role !== "owner") return { ok: false, message: "Only an owner can disconnect the Stripe account." };
  await disconnectPayments(scopeOf(ctx));
  refresh();
  return { ok: true, message: "Disconnected. Your Stripe account and its history stay yours; checkout is off until you connect again." };
}

export async function connectCarrierAction(key: "shipstation" | "ups", input: { apiKey?: string; clientId?: string; clientSecret?: string; accountNumber?: string; sandbox?: boolean }): Promise<SalesResult> {
  const { ctx, error } = await guard("settings.manage", "sales.checkout");
  if (error) return { ok: false, message: error };
  let secret: string;
  let config: Record<string, unknown>;
  if (key === "shipstation") {
    const apiKey = String(input.apiKey ?? "").trim();
    if (apiKey.length < 10 || apiKey.length > 200 || /\s/.test(apiKey)) return { ok: false, message: "Paste the whole ShipStation API key (v2). It's in ShipStation under Settings, Account, API Settings." };
    secret = apiKey;
    config = { keyHint: apiKey.slice(-4) };
  } else {
    const clientId = String(input.clientId ?? "").trim();
    const clientSecret = String(input.clientSecret ?? "").trim();
    const accountNumber = String(input.accountNumber ?? "").trim().toUpperCase();
    if (!clientId || !clientSecret) return { ok: false, message: "Enter the client ID and client secret from your app at developer.ups.com." };
    if (!/^[A-Z0-9]{6}$/.test(accountNumber)) return { ok: false, message: "Your UPS account number is six letters and numbers." };
    secret = JSON.stringify({ clientId, clientSecret });
    config = { accountNumber, sandbox: Boolean(input.sandbox), keyHint: clientId.slice(-4) };
  }
  const test = await carrierFrom(key, secret, config).test();
  if (!test.ok) {
    await withTenant(scopeOf(ctx), (tx) => writeCarrier(tx, ctx.tenant.id, key, { config, connected: false, error: test.error }));
    refresh();
    return { ok: false, message: test.error };
  }
  await withTenant(scopeOf(ctx), async (tx) => {
    await writeCarrier(tx, ctx.tenant.id, key, { secret, config: { ...config, detail: test.detail, carrierIds: test.carriers?.map((c) => c.id) ?? [] }, connected: true, error: null });
    await audit(tx, { action: "carrier.connected", targetType: "integration", targetId: key });
  });
  refresh();
  return { ok: true, message: test.detail };
}

export async function removeCarrierAction(key: "shipstation" | "ups"): Promise<SalesResult> {
  const { ctx, error } = await guard("settings.manage", "sales.checkout");
  if (error) return { ok: false, message: error };
  if (key !== "shipstation" && key !== "ups") return { ok: false, message: "That didn't work." };
  await withTenant(scopeOf(ctx), async (tx) => {
    await removeCarrier(tx, key);
    await audit(tx, { action: "carrier.removed", targetType: "integration", targetId: key });
  });
  refresh();
  return { ok: true, message: "Removed. Its key was deleted." };
}

export async function shopUrlFor(): Promise<string> {
  const ctx = await getPortalContext();
  return `${appUrl()}/p/${ctx.tenant.slug}/shop`;
}

// ---- Sharing a contact ------------------------------------------------------------------------

export async function shareContactAction(contactId: string, days: number): Promise<SalesResult> {
  const { ctx, error } = await guard("contacts.edit", "contacts.share", { data: true });
  if (error) return { ok: false, message: error };
  try {
    const share = await withTenant(scopeOf(ctx), async (tx) => {
      const sh = await createShare(tx, contactId, days, actor(ctx));
      await audit(tx, { action: "contact.shared", targetType: "contact", targetId: contactId, detail: { days } });
      return sh;
    });
    refresh();
    return { ok: true, message: `Link made. It works until ${share.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: ctx.settings.timezone })}.`, id: share.id, url: share.url };
  } catch (err) {
    return failed(err, "Couldn't make the link. Try again.");
  }
}

export async function revokeShareAction(shareId: string): Promise<SalesResult> {
  const { ctx, error } = await guard("contacts.edit", "contacts.share", { data: true });
  if (error) return { ok: false, message: error };
  const done = await withTenant(scopeOf(ctx), async (tx) => {
    const ok = await revokeShare(tx, shareId);
    if (ok) await audit(tx, { action: "contact.share_revoked", targetType: "contact_share", targetId: shareId });
    return ok;
  });
  refresh();
  return done ? { ok: true, message: "Turned off. That link stops working now." } : { ok: false, message: "That link was already off." };
}
