// The public side of Sales in the database, as the real app role: what the
// shop pages read, trade applications and sign-in links from the shop,
// sharing a contact's page, and marking an invoiced estimate paid by hand.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@/lib/db";
import { clearOutbox, readOutbox } from "@/lib/email/provider";
import { NO_SENDING, writeSending } from "@/lib/marketing/sending";
import { formToken } from "@/lib/pages/form-token";
import { parseProduct } from "@/lib/sales/catalog";
import { onboardingUrl, refreshPayments } from "@/lib/sales/connect";
import { activeShares, createShare, openShare, revokeShare, salesForContact, ShareError } from "@/lib/sales/contact-share";
import { parseEstimate } from "@/lib/sales/estimate-input";
import { clientReply, createEstimate, getEstimate, markEstimatePaid, sendEstimate } from "@/lib/sales/estimates";
import { placeFreeOrder, updateCart } from "@/lib/sales/checkout";
import { saveDiscount } from "@/lib/sales/discount-codes";
import { parseDiscount } from "@/lib/sales/discounts";
import { paymentsProvider, standInOnboard, standInStore } from "@/lib/sales/payments";
import { getProduct, saveProduct } from "@/lib/sales/products";
import { feedProducts, loadShop, shopItem, shopItems } from "@/lib/sales/shop";
import { decideTrade } from "@/lib/sales/trade";
import { enterTrade, LINK_SENT, requestTradeLink, submitTradeApplication, tradeFormKey } from "@/lib/sales/trade-public";
import { createTenant } from "@/lib/tenants";
import { app, B } from "./helpers";

const T = randomUUID();
let SLUG = "";
const scope = { tenantId: T, userId: "test_owner" };
const tx = <R>(fn: Parameters<typeof withTenant<R>>[1]) => withTenant(scope, fn, app());
let kit = "";

beforeAll(async () => {
  await createTenant({ id: T, name: `Tidewater Tile ${T.slice(0, 6)}`, domain: "tidewatertile.com", sampleData: false, owner: { userId: "test_owner", email: "owner@tidewatertile.com", name: "Tia Owner" } }, app());
  await tx(async (t) => {
    SLUG = (await t.selectFrom("tenants").select("slug").executeTakeFirstOrThrow()).slug;
    await t.insertInto("entitlements").values({ item_key: "module:sales", source: "grant", stripe_subscription_item_id: null, ends_at: null, note: "test" }).execute();
    await writeSending(t, { ...NO_SENDING, domain: "mail.tidewatertile.com", domainId: "standin-domain-t", status: "verified", verifiedAt: new Date().toISOString() });
    const id = await saveProduct(t, parseProduct({ name: "Tile sample kit", status: "active", description: "Six tiles.", variants: [{ sku: "TSK", priceCents: 2500, weightOz: 30, box: "small" }] }));
    await saveProduct(t, parseProduct({ name: "Hidden draft", status: "draft", variants: [{ sku: "HD", priceCents: 100 }] }));
    kit = (await getProduct(t, id))!.variants[0].id;
    await saveDiscount(t, parseDiscount({ code: "ALLFREE", kind: "percent", value: 100, usage: "unlimited" }), null, "test_owner");
  });
  clearOutbox();
});

afterAll(async () => {
  await app().destroy();
});

describe("the shop pages", () => {
  it("show the company's active products and nothing else", async () => {
    const shop = await loadShop(SLUG, app());
    expect(shop).toMatchObject({ tenantId: T, shopOn: true, tradeOpen: true, tradeOn: true, payable: false, countries: ["US"] });
    const items = await shopItems(shop!, app());
    expect(items.map((i) => i.name)).toEqual(["Tile sample kit"]);
    expect(await shopItem(shop!, "hidden-draft", app())).toBeNull();
    expect(await shopItem(shop!, "../../etc", app())).toBeNull();
    const feed = await feedProducts(shop!, app());
    expect(feed[0].variants[0].weightOz).toBe(30);
  });

  it("aren't there for a company without Sales", async () => {
    const other = await withTenant({ tenantId: B, userId: "test" }, (t) => t.selectFrom("tenants").select("slug").executeTakeFirstOrThrow(), app());
    expect(await loadShop(other.slug, app())).toBeNull();
  });
});

describe("trade from the shop", () => {
  const form = (token: string, email = "kai@coastbuild.example.com") => ({ token, company: "Coast Build", name: "Kai Moss", email, phone: "", website: "https://coastbuild.example.com", type: "Builder", resale: "", volume: "", message: "Ten pools a year" });

  it("takes an application once the form has been open a moment, and tells the team", async () => {
    expect(await submitTradeApplication(T, form(formToken(tradeFormKey(T))), app())).toMatchObject({ ok: false, message: expect.stringContaining("That was quick") });
    expect(await submitTradeApplication(T, form(formToken(randomUUID(), Date.now() - 5000)), app())).toMatchObject({ ok: false, message: expect.stringContaining("timed out") });
    clearOutbox();
    expect(await submitTradeApplication(T, form(formToken(tradeFormKey(T), Date.now() - 5000)), app())).toMatchObject({ ok: true });
    expect(readOutbox().map((m) => m.subject)).toContain("Trade application from Coast Build");
    // Bots fill the hidden field; they're told it worked and nothing is saved.
    expect(await submitTradeApplication(T, { ...form(formToken(tradeFormKey(T), Date.now() - 5000), "bot@example.com"), trap: "x" }, app())).toMatchObject({ ok: true });
    expect(await tx((t) => t.selectFrom("trade_accounts").select("email").execute())).toEqual([{ email: "kai@coastbuild.example.com" }]);
  });

  it("sends a sign-in link only to approved accounts, and says the same thing either way", async () => {
    clearOutbox();
    expect(await requestTradeLink(T, SLUG, "kai@coastbuild.example.com", app())).toEqual({ ok: true, message: LINK_SENT });
    expect(await requestTradeLink(T, SLUG, "nobody@example.com", app())).toEqual({ ok: true, message: LINK_SENT });
    expect(readOutbox()).toHaveLength(0);

    const a = await tx((t) => t.selectFrom("trade_accounts").select("id").executeTakeFirstOrThrow());
    await tx((t) => decideTrade(t, a.id, "approved", "test_owner"));
    await requestTradeLink(T, SLUG, "KAI@coastbuild.example.com", app());
    const mail = readOutbox().find((m) => m.to === "kai@coastbuild.example.com")!;
    const link = new URL(/https?:\/\/\S+\/trade\/enter\?t=\S+/.exec(mail.text)![0]);
    expect(link.pathname).toBe(`/p/${SLUG}/trade/enter`);
    const session = await enterTrade(T, link.searchParams.get("t"), app());
    expect(session).toMatch(/^\d+\.[0-9a-f-]{36}\./);
    expect(await enterTrade(T, "1.not-a-token", app())).toBeNull();

    await tx((t) => decideTrade(t, a.id, "paused", "test_owner"));
    expect(await enterTrade(T, link.searchParams.get("t"), app())).toBeNull();
  });
});

describe("sharing a contact", () => {
  it("makes a read-only page that stops when it's turned off", async () => {
    const cart = await updateCart(T, null, { op: "add", variantId: kit, qty: 1 }, { tradeAccountId: null }, app());
    await updateCart(T, cart.cartId, { op: "code", code: "ALLFREE" }, { tradeAccountId: null }, app());
    await placeFreeOrder(T, cart.cartId, { email: "rae@example.com", name: "Rae Lin", phone: "", address: { name: "Rae Lin", company: "", phone: "", line1: "4 Pier Ave", line2: "", city: "Tampa", state: "FL", postal: "33606", country: "US" } }, { tradeAccountId: null }, app());
    const contact = await tx((t) => t.selectFrom("contacts").select("id").where("email", "=", "rae@example.com").executeTakeFirstOrThrow());

    const panel = await tx((t) => salesForContact(t, contact.id));
    expect(panel?.orders).toHaveLength(1);

    const share = await tx((t) => createShare(t, contact.id, 7, "owner@tidewatertile.com"));
    const token = share.url.split("/s/")[1];
    const view = await openShare(token, app());
    expect(view).toMatchObject({ contact: { name: "Rae Lin", email: "rae@example.com" }, orders: [{ number: 1001 }] });
    expect(JSON.stringify(view)).not.toContain("internal");
    expect(await tx((t) => activeShares(t, contact.id))).toHaveLength(1);

    expect(await openShare(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), app())).toBeNull();
    expect(await tx((t) => revokeShare(t, share.id))).toBe(true);
    expect(await openShare(token, app())).toBeNull();
    expect(await tx((t) => activeShares(t, contact.id))).toHaveLength(0);
  });

  it("can't share another company's contact", async () => {
    const theirs = await withTenant({ tenantId: B, userId: "test" }, (t) => t.selectFrom("contacts").select("id").executeTakeFirst(), app());
    if (theirs) await expect(tx((t) => createShare(t, theirs.id, 7, "x"))).rejects.toThrow(ShareError);
  });
});

describe("estimates paid by hand", () => {
  it("void the open Stripe invoice so the client can't pay twice", async () => {
    const pay = paymentsProvider()!;
    await onboardingUrl(scope, { email: "owner@tidewatertile.com", businessName: "Tidewater Tile", website: null }, app());
    standInOnboard((await refreshPayments(T, app())).accountId!);
    expect((await refreshPayments(T, app())).chargesEnabled).toBe(true);

    const e = await tx((t) => createEstimate(t, parseEstimate({ client: { name: "Bo Reyes", email: "bo@example.com" }, items: [{ id: "a", name: "Install", qty: 1, unitCents: 50000 }] }), "test_owner"));
    await sendEstimate(T, e.id, { message: "", actor: "test_owner", actorEmail: "owner@tidewatertile.com" }, app());
    const sent = await tx((t) => getEstimate(t, e.id));
    const approved = await clientReply(T, e.id, { kind: "approve", name: "Bo Reyes", seen: sent!.updatedAt.toISOString() }, app(), pay);
    expect(approved.invoiceUrl).toBeTruthy();
    const invoiceId = (await tx((t) => t.selectFrom("estimates").select("stripe_invoice_id").where("id", "=", e.id).executeTakeFirstOrThrow())).stripe_invoice_id!;

    expect(await markEstimatePaid(T, e.id, "test_owner", "Bank transfer", app(), pay)).toMatchObject({ ok: true });
    expect(standInStore().invoices.get(invoiceId)?.status).toBe("void");
  });
});
