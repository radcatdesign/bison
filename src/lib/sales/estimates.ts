import "server-only";
// Estimates: building and sending them, the client's own page (view, approve
// by typing their name, ask for changes, decline), turning an approval into a
// Stripe invoice with a Pay link, and recording the payment as an order.
// Every step lands in estimate_events, so the history reads like a log.
import { sql } from "kysely";
import { audit } from "@/lib/audit";
import { type Database, db, isUuid, type Tx, withTenant } from "@/lib/db";
import type { EstimateEventKind, EstimateStatus } from "@/lib/db/types";
import { checkLink, linkId, signLink } from "@/lib/email/tokens";
import { appUrl } from "@/lib/env";
import { startSeries } from "@/lib/marketing/people";
import { can, loadAccess } from "@/lib/access/entitlements";
import { estimateEmail, estimatePaidEmail, estimateReplyEmail, salesSender, sendOne } from "./emails";
import { EDITABLE, type EstimateInput, sendProblems } from "./estimate-input";
import { formatMoney } from "./money";
import { afterOrderPaid, createOrder, nextEstimateNumber, upsertBuyer } from "./orders";
import { type PaymentsProvider, paymentsProvider } from "./payments";
import { type EstimateDiscount, type EstimateLine, estimateTotals } from "./pricing";
import { getSalesSettings, readPayments } from "./store";
import type { Delivery, EstimateClient, EstimateDetail, EstimateRow } from "./types";

/** Links keep working this long after they're sent. */
export const ESTIMATE_LINK_DAYS = 180;

export class EstimateError extends Error {}

const OPEN: EstimateStatus[] = ["sent", "viewed", "changes_requested"];

function client(v: unknown): EstimateClient {
  const c = (v ?? {}) as Partial<EstimateClient>;
  return { name: c.name ?? "", email: c.email ?? "", company: c.company ?? "", phone: c.phone ?? "", address: c.address ?? {} };
}

const dateOnly = (d: Date | string | null) => (d ? (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : null);

async function event(tx: Tx, estimateId: string, kind: EstimateEventKind, actor: string, detail = "") {
  await tx.insertInto("estimate_events").values({ estimate_id: estimateId, kind, actor: actor.slice(0, 120), detail: detail.slice(0, 5000) }).execute();
}

export async function listEstimates(tx: Tx, status: EstimateStatus | "open" | "all" = "all"): Promise<EstimateRow[]> {
  let q = tx.selectFrom("estimates").select(["id", "number", "status", "title", "client", "total_cents", "currency", "sent_at", "updated_at", "valid_until", "source"]).orderBy("updated_at", "desc").limit(1000);
  if (status === "open") q = q.where("status", "in", [...OPEN, "approved", "invoiced"]);
  else if (status !== "all") q = q.where("status", "=", status);
  const rows = await q.execute();
  return rows.map((r) => ({ id: r.id, number: r.number, status: r.status, title: r.title, client: client(r.client), totalCents: r.total_cents, currency: r.currency, sentAt: r.sent_at, updatedAt: r.updated_at, validUntil: dateOnly(r.valid_until), source: r.source }));
}

export async function getEstimate(tx: Tx, id: string): Promise<EstimateDetail | null> {
  if (!isUuid(id)) return null;
  const r = await tx.selectFrom("estimates").selectAll().where("id", "=", id).executeTakeFirst();
  if (!r) return null;
  const events = await tx.selectFrom("estimate_events").select(["kind", "actor", "detail", "created_at"]).where("estimate_id", "=", id).orderBy("created_at").execute();
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    title: r.title,
    client: client(r.client),
    totalCents: r.total_cents,
    currency: r.currency,
    sentAt: r.sent_at,
    updatedAt: r.updated_at,
    validUntil: dateOnly(r.valid_until),
    source: r.source,
    items: (r.items ?? []) as EstimateLine[],
    discount: (r.discount ?? {}) as EstimateDiscount,
    shippingCents: r.shipping_cents,
    subtotalCents: r.subtotal_cents,
    discountCents: r.discount_cents,
    notes: r.notes,
    internalNote: r.internal_note,
    approvedName: r.approved_name,
    changeRequest: r.change_request,
    delivery: (r.delivery ?? {}) as Delivery,
    invoiceUrl: r.invoice_url,
    paidAt: r.paid_at,
    viewedAt: r.viewed_at,
    orderId: r.order_id,
    contactId: r.contact_id,
    tradeAccountId: r.trade_account_id,
    events: events.map((e) => ({ kind: e.kind, actor: e.actor, detail: e.detail, at: e.created_at })),
  };
}

function columns(e: EstimateInput) {
  const t = estimateTotals(e.items, e.discount as EstimateDiscount, e.shippingCents);
  return {
    title: e.title,
    client: JSON.stringify(e.client),
    trade_account_id: e.tradeAccountId,
    items: JSON.stringify(e.items),
    discount: JSON.stringify(e.discount),
    shipping_cents: e.shippingCents,
    subtotal_cents: t.subtotalCents,
    discount_cents: t.discountCents,
    total_cents: t.totalCents,
    notes: e.notes,
    internal_note: e.internalNote,
    valid_until: e.validUntil,
  };
}

export async function createEstimate(tx: Tx, e: EstimateInput, actor: string): Promise<{ id: string; number: number }> {
  const settings = await getSalesSettings(tx);
  const number = await nextEstimateNumber(tx);
  const row = await tx
    .insertInto("estimates")
    .values({ ...columns(e), number, currency: settings.store.currency, valid_until: e.validUntil ?? new Date(Date.now() + settings.store.estimates.validDays * 86_400_000).toISOString().slice(0, 10), notes: e.notes || settings.store.estimates.terms, created_by: actor })
    .returning(["id", "number"])
    .executeTakeFirstOrThrow();
  await event(tx, row.id, "created", actor);
  return row;
}

export async function saveEstimate(tx: Tx, id: string, e: EstimateInput, actor: string): Promise<void> {
  const cur = await tx.selectFrom("estimates").select(["status"]).where("id", "=", id).executeTakeFirst();
  if (!cur) throw new EstimateError("That estimate isn't here anymore.");
  if (!EDITABLE.has(cur.status)) throw new EstimateError("This estimate was approved, so it can't change. Duplicate it to make a new one.");
  await tx.updateTable("estimates").set(columns(e)).where("id", "=", id).execute();
  if (cur.status !== "draft") {
    // One "edited" line per few minutes is plenty; autosave runs often.
    const recent = await tx.selectFrom("estimate_events").select("id").where("estimate_id", "=", id).where("kind", "=", "edited").where("created_at", ">", new Date(Date.now() - 10 * 60_000)).executeTakeFirst();
    if (!recent) await event(tx, id, "edited", actor, "Changed after it was sent");
  }
}

export async function duplicateEstimate(tx: Tx, id: string, actor: string): Promise<{ id: string; number: number }> {
  const src = await getEstimate(tx, id);
  if (!src) throw new EstimateError("That estimate isn't here anymore.");
  const settings = await getSalesSettings(tx);
  return createEstimate(tx, { title: src.title, client: { ...src.client, address: src.client.address }, tradeAccountId: src.tradeAccountId, items: src.items.map((i) => ({ ...i, productId: i.productId ?? null, variantId: i.variantId ?? null })), discount: src.discount as EstimateInput["discount"], shippingCents: src.shippingCents, notes: src.notes, internalNote: "", validUntil: new Date(Date.now() + settings.store.estimates.validDays * 86_400_000).toISOString().slice(0, 10) }, actor);
}

export async function deleteEstimate(tx: Tx, id: string): Promise<void> {
  const cur = await tx.selectFrom("estimates").select("status").where("id", "=", id).executeTakeFirst();
  if (!cur) return;
  if (cur.status !== "draft") throw new EstimateError("Only drafts can be deleted. Void it instead.");
  await tx.deleteFrom("estimates").where("id", "=", id).execute();
}

// ---- Links -------------------------------------------------------------------------------

export function estimateUrl(id: string, version: number, issuedAt = Date.now()): string {
  return `${appUrl()}/e/${signLink(`estimate:v${version}`, id, issuedAt)}`;
}

/** The company and estimate behind a client link, or null if it's forged, retired or too old. */
export async function resolveEstimateLink(token: string, database: Database = db()): Promise<{ tenantId: string; estimateId: string } | null> {
  const id = linkId(token);
  if (!id) return null;
  const r = await sql<{ id: string | null }>`select resolve_estimate(${id}::uuid) as id`.execute(database);
  const tenantId = r.rows[0]?.id;
  if (!tenantId) return null;
  const version = await withTenant({ tenantId, userId: "public:estimate" }, (tx) => tx.selectFrom("estimates").select("link_version").where("id", "=", id).executeTakeFirst(), database);
  if (!version) return null;
  const ok = checkLink(`estimate:v${version.link_version}`, token, ESTIMATE_LINK_DAYS);
  if (!ok || ok.expired || ok.id !== id) return null;
  return { tenantId, estimateId: id };
}

// ---- Sending -------------------------------------------------------------------------------

export async function sendEstimate(tenantId: string, id: string, input: { message: string; actor: string; actorEmail: string }, database: Database = db()): Promise<{ ok: boolean; message: string; url?: string }> {
  const prep = await withTenant(
    { tenantId, userId: input.actor },
    async (tx) => {
      const e = await tx.selectFrom("estimates").selectAll().where("id", "=", id).executeTakeFirst();
      if (!e) throw new EstimateError("That estimate isn't here anymore.");
      if (!EDITABLE.has(e.status)) throw new EstimateError("This estimate was already approved.");
      const c = client(e.client);
      const problems = sendProblems({ title: e.title, client: { ...c, address: c.address }, tradeAccountId: e.trade_account_id, items: (e.items ?? []) as EstimateLine[], discount: {}, shippingCents: e.shipping_cents, notes: e.notes, internalNote: "", validUntil: null });
      if (problems.length) throw new EstimateError(problems.join(" "));
      return { e, c, sender: await salesSender(tx) };
    },
    database,
  );
  const { e, c, sender } = prep;
  const url = estimateUrl(e.id, e.link_version);
  const mail = sender ? estimateEmail(sender, { number: e.number, title: e.title, clientName: c.name, totalCents: e.total_cents, currency: e.currency, validUntil: dateOnly(e.valid_until), url, message: input.message, resend: e.status !== "draft" }) : { subject: "", html: "", text: "" };
  const delivery = await sendOne(sender, { to: c.email, replyTo: input.actorEmail, ...mail, kind: "estimate", ref: e.id }, `bison/estimate/${e.id}/${Date.now()}`);
  await withTenant(
    { tenantId, userId: input.actor },
    async (tx) => {
      const contactId = await upsertBuyer(tx, { email: c.email, name: c.name, phone: c.phone });
      await tx
        .updateTable("estimates")
        .set({ delivery: JSON.stringify(delivery), contact_id: contactId, ...(delivery.error ? {} : { status: e.status === "draft" || e.status === "changes_requested" || e.status === "declined" ? "sent" : e.status, sent_at: new Date() }) })
        .where("id", "=", e.id)
        .execute();
      await event(tx, e.id, delivery.error ? "email_failed" : "sent", input.actor, delivery.error ? delivery.error : `Sent to ${c.email}`);
      if (!delivery.error && can({ access: await loadAccess(tx) }, "marketing.sequences")) await startSeries(tx, "estimate", { email: c.email, name: c.name, subscriberId: null }, e.id);
      await audit(tx, { action: "estimate.sent", targetType: "estimate", targetId: e.id, detail: { to: c.email, ok: !delivery.error } });
    },
    database,
  );
  if (delivery.error) return { ok: false, message: delivery.error, url };
  return { ok: true, message: `Sent to ${c.email}.`, url };
}

export async function voidEstimate(tenantId: string, id: string, actor: string, database: Database = db(), payments: PaymentsProvider | null = paymentsProvider()): Promise<{ ok: boolean; message: string }> {
  const e = await withTenant({ tenantId, userId: actor }, (tx) => tx.selectFrom("estimates").select(["status", "stripe_invoice_id"]).where("id", "=", id).executeTakeFirst(), database);
  if (!e) return { ok: false, message: "That estimate isn't here anymore." };
  if (e.status === "paid") return { ok: false, message: "It's paid, so it can't be voided. Refund the order instead." };
  if (e.status === "void") return { ok: true, message: "It's already void." };
  if (e.stripe_invoice_id) {
    const conn = await withTenant({ tenantId, userId: actor }, (tx) => readPayments(tx), database);
    if (conn.accountId && payments) {
      try {
        await payments.voidInvoice(conn.accountId, e.stripe_invoice_id);
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Stripe didn't void the invoice." };
      }
    }
  }
  await withTenant(
    { tenantId, userId: actor },
    async (tx) => {
      await tx.updateTable("estimates").set({ status: "void", link_version: sql`link_version + 1` }).where("id", "=", id).execute();
      await event(tx, id, "void", actor, e.stripe_invoice_id ? "The invoice was voided in Stripe too" : "");
    },
    database,
  );
  return { ok: true, message: "Voided. The client's link stops working." };
}

// ---- The client's page -------------------------------------------------------------------------

export type ClientView = { estimate: EstimateDetail; business: { name: string; accent: string; logo: string | null; address: string; email: string }; expired: boolean; payable: boolean; currency: string };

export async function clientView(tenantId: string, estimateId: string, database: Database = db()): Promise<ClientView | null> {
  return withTenant(
    { tenantId, userId: "public:estimate" },
    async (tx) => {
      const e = await getEstimate(tx, estimateId);
      if (!e || e.status === "draft") return null;
      if (e.status === "sent") {
        await tx.updateTable("estimates").set({ status: "viewed", viewed_at: new Date() }).where("id", "=", e.id).where("status", "=", "sent").execute();
        await event(tx, e.id, "viewed", "client");
        e.status = "viewed";
      } else if (!e.viewedAt) await tx.updateTable("estimates").set({ viewed_at: new Date() }).where("id", "=", e.id).execute();
      const info = await tx.selectFrom("tenants").select(["name"]).executeTakeFirstOrThrow();
      const settings = await tx.selectFrom("settings").select("accent").executeTakeFirstOrThrow();
      const ms = await tx.selectFrom("marketing_settings").select("brand").executeTakeFirst();
      const brand = (ms?.brand ?? {}) as { businessName?: string; logo?: { src?: string } | null; address?: string; colors?: { accent?: string }; replyTo?: string };
      const expired = Boolean(e.validUntil && e.validUntil < new Date().toISOString().slice(0, 10)) && OPEN.includes(e.status);
      return {
        estimate: { ...e, internalNote: "", events: [] },
        business: { name: brand.businessName || info.name, accent: brand.colors?.accent || settings.accent, logo: brand.logo?.src ?? null, address: brand.address ?? "", email: brand.replyTo ?? "" },
        expired,
        payable: e.status === "invoiced" && Boolean(e.invoiceUrl),
        currency: e.currency,
      };
    },
    database,
  );
}

export type ClientReply = { kind: "approve"; name: string; seen: string } | { kind: "changes"; message: string; seen: string } | { kind: "decline"; message: string; seen: string };

/** The client approves, asks for changes or declines. `seen` is when the page they read was last changed. */
export async function clientReply(tenantId: string, estimateId: string, reply: ClientReply, database: Database = db(), payments: PaymentsProvider | null = paymentsProvider()): Promise<{ ok: boolean; message: string; invoiceUrl?: string | null }> {
  const now = new Date();
  const result = await withTenant(
    { tenantId, userId: "public:estimate" },
    async (tx) => {
      const e = await tx.selectFrom("estimates").selectAll().where("id", "=", estimateId).forUpdate().executeTakeFirst();
      if (!e || e.status === "draft" || e.status === "void") return { ok: false, message: "This estimate isn't open anymore." } as const;
      if (!OPEN.includes(e.status)) return { ok: false, message: e.status === "declined" ? "You declined this estimate. Ask them for a new one if you've changed your mind." : "This estimate was already approved." } as const;
      const seen = new Date(reply.seen).getTime();
      if (!Number.isFinite(seen) || seen + 1000 < e.updated_at.getTime()) return { ok: false, message: "This estimate changed while you had it open. Look it over again, then answer.", changed: true } as const;
      if (e.valid_until && dateOnly(e.valid_until)! < now.toISOString().slice(0, 10) && reply.kind === "approve") return { ok: false, message: "This estimate has expired. Ask for an updated one." } as const;
      if (reply.kind === "approve") {
        const name = reply.name.trim();
        if (name.length < 2) return { ok: false, message: "Type your full name to approve." } as const;
        await tx.updateTable("estimates").set({ status: "approved", approved_name: name.slice(0, 120), responded_at: now }).where("id", "=", e.id).execute();
        await event(tx, e.id, "approved", "client", `Signed as ${name}`);
      } else {
        const message = reply.message.trim();
        if (reply.kind === "changes" && message.length < 3) return { ok: false, message: "Say what you'd like changed." } as const;
        await tx.updateTable("estimates").set({ status: reply.kind === "changes" ? "changes_requested" : "declined", change_request: message.slice(0, 5000), responded_at: now }).where("id", "=", e.id).execute();
        await event(tx, e.id, reply.kind === "changes" ? "changes_requested" : "declined", "client", message);
      }
      const settings = await getSalesSettings(tx);
      return { ok: true, e, settings, conn: await readPayments(tx), sender: await salesSender(tx) } as const;
    },
    database,
  );
  if (!result.ok) return result;
  const { e, settings, conn, sender } = result;
  const c = client(e.client);

  let invoiceUrl: string | null = null;
  if (reply.kind === "approve" && payments && conn.accountId && conn.chargesEnabled) invoiceUrl = await invoiceEstimate(tenantId, e.id, database, payments);

  const to = settings.store.alertEmails;
  if (to.length) {
    const kind = reply.kind === "approve" ? "approved" : reply.kind === "changes" ? "changes_requested" : "declined";
    const detail = reply.kind === "approve" ? reply.name.trim() : reply.message.trim();
    const mail = sender ? estimateReplyEmail(sender, { number: e.number, clientName: c.name, kind, detail, totalCents: e.total_cents, currency: e.currency, url: `${appUrl()}/sales/estimates/${e.id}`, invoiced: Boolean(invoiceUrl) }) : { subject: "", html: "", text: "" };
    await sendOne(sender, { to: to.join(","), replyTo: c.email || undefined, ...mail, kind: "estimate-reply", ref: e.id }, `bison/estimate-reply/${e.id}/${reply.kind}/${Date.now()}`);
  }
  if (reply.kind === "approve") return { ok: true, message: invoiceUrl ? "Approved. Your invoice is ready to pay." : `Approved. ${settings.store.alertEmails.length ? "We'll" : "They'll"} send your invoice shortly.`, invoiceUrl };
  return { ok: true, message: reply.kind === "changes" ? "Sent. They'll update the estimate and send it again." : "Declined. Thanks for letting them know." };
}

/** Makes the Stripe invoice for an approved estimate. Returns its Pay link, or null (with the reason in the history). */
export async function invoiceEstimate(tenantId: string, id: string, database: Database = db(), payments: PaymentsProvider | null = paymentsProvider()): Promise<string | null> {
  const prep = await withTenant(
    { tenantId, userId: "system:stripe" },
    async (tx) => ({ e: await tx.selectFrom("estimates").selectAll().where("id", "=", id).executeTakeFirst(), conn: await readPayments(tx), settings: await getSalesSettings(tx), tenant: await tx.selectFrom("tenants").select("name").executeTakeFirstOrThrow() }),
    database,
  );
  const { e, conn, settings } = prep;
  if (!e || e.status !== "approved" || e.stripe_invoice_id) return e?.invoice_url ?? null;
  if (!payments || !conn.accountId || !conn.chargesEnabled) return null;
  const c = client(e.client);
  const items = (e.items ?? []) as EstimateLine[];
  try {
    const inv = await payments.createInvoice(conn.accountId, {
      estimateId: e.id,
      number: e.number,
      currency: e.currency,
      customer: { email: c.email, name: c.company ? `${c.name}, ${c.company}` : c.name, address: c.address },
      lines: items.map((l) => ({ description: `${l.qty === 1 ? "" : `${l.qty} × `}${l.name}${l.detail ? `, ${l.detail}` : ""}`, amountCents: Math.round(l.qty * l.unitCents) })),
      shippingCents: e.shipping_cents,
      discount: e.discount_cents > 0 ? { label: "Discount", amountCents: e.discount_cents } : null,
      tax: settings.store.checkout.tax && conn.tax === "active",
      dueDays: settings.store.estimates.dueDays,
      memo: `Estimate #${e.number}${e.title ? `: ${e.title}` : ""}. Approved by ${e.approved_name}.`,
      footer: e.notes,
    });
    await withTenant(
      { tenantId, userId: "system:stripe" },
      async (tx) => {
        await tx.updateTable("estimates").set({ status: "invoiced", stripe_invoice_id: inv.invoiceId, stripe_customer_id: inv.customerId, invoice_url: inv.hostedUrl, invoiced_at: new Date() }).where("id", "=", e.id).execute();
        await event(tx, e.id, "invoiced", "stripe", `Invoice for ${formatMoney(inv.totalCents, e.currency)}${inv.taxCents ? `, including ${formatMoney(inv.taxCents, e.currency)} tax` : ""}`);
      },
      database,
    );
    return inv.hostedUrl;
  } catch (err) {
    await withTenant({ tenantId, userId: "system:stripe" }, (tx) => event(tx, e.id, "invoice_failed", "stripe", err instanceof Error ? err.message : "Stripe didn't make the invoice."), database);
    return null;
  }
}

/** Stripe says an estimate's invoice was paid: mark it paid, record the order, tell the team. */
export async function invoicePaid(tenantId: string, invoiceId: string, database: Database = db(), payments: PaymentsProvider | null = paymentsProvider(), run: "now" | "skip" = "now"): Promise<{ orderId: string } | null> {
  if (!payments) return null;
  const conn = await withTenant({ tenantId, userId: "system:stripe" }, (tx) => readPayments(tx), database);
  if (!conn.accountId) return null;
  const inv = await payments.invoice(conn.accountId, invoiceId);
  if (inv.status !== "paid") return null;
  const result = await withTenant(
    { tenantId, userId: "system:stripe" },
    async (tx) => {
      const e = await tx.selectFrom("estimates").selectAll().where("stripe_invoice_id", "=", invoiceId).executeTakeFirst();
      if (!e) return null;
      return recordEstimatePaid(tx, e.id, { invoiceId, paymentIntentId: inv.paymentIntentId, totalCents: inv.totalCents, taxCents: inv.taxCents, accountId: conn.accountId, actor: "stripe" });
    },
    database,
  );
  if (result?.created && run === "now") {
    await afterOrderPaid(tenantId, result.orderId, database);
    await alertPaid(tenantId, result.estimateId, result.orderNumber, database);
  }
  return result ? { orderId: result.orderId } : null;
}

type PaidInput = { invoiceId: string | null; paymentIntentId: string | null; totalCents: number; taxCents: number; accountId: string | null; actor: string; note?: string };

/** Records payment for an estimate as an order. Shared by Stripe and "Mark as paid". */
export async function recordEstimatePaid(tx: Tx, id: string, p: PaidInput): Promise<{ orderId: string; orderNumber: number; estimateId: string; created: boolean } | null> {
  const e = await tx.selectFrom("estimates").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
  if (!e) return null;
  if (e.status === "paid" && e.order_id) {
    const o = await tx.selectFrom("orders").select(["id", "number"]).where("id", "=", e.order_id).executeTakeFirst();
    return o ? { orderId: o.id, orderNumber: o.number, estimateId: e.id, created: false } : null;
  }
  const c = client(e.client);
  const items = (e.items ?? []) as EstimateLine[];
  const order = await createOrder(tx, {
    source: "estimate",
    email: c.email || "unknown@example.com",
    name: c.name,
    phone: c.phone,
    shipTo: { name: c.name, company: c.company, ...c.address },
    items: items.map((l) => ({ productId: l.productId, variantId: l.variantId, name: l.name, variant: l.detail, sku: "", qty: l.qty, unitCents: l.unitCents, lineCents: Math.round(l.qty * l.unitCents) })),
    subtotalCents: e.subtotal_cents,
    discountCents: e.discount_cents,
    shippingCents: e.shipping_cents,
    taxCents: p.taxCents,
    totalCents: p.totalCents || e.total_cents,
    currency: e.currency,
    discountCode: "",
    shippingService: "",
    estimateId: e.id,
    tradeAccountId: e.trade_account_id,
    stripeAccountId: p.accountId,
    stripeInvoiceId: p.invoiceId,
    stripePaymentIntentId: p.paymentIntentId,
    // Only catalog items ship; an estimate of services doesn't go to fulfillment.
    needsShipping: items.some((l) => l.variantId) && Boolean(c.address.line1),
  });
  await tx.updateTable("estimates").set({ status: "paid", paid_at: new Date(), order_id: order.id }).where("id", "=", e.id).execute();
  await event(tx, e.id, "paid", p.actor, p.note ?? `Order #${order.number}`);
  return { orderId: order.id, orderNumber: order.number, estimateId: e.id, created: order.created };
}

/** For payments taken outside Stripe: a check, cash, a bank transfer. */
export async function markEstimatePaid(tenantId: string, id: string, actor: string, note: string, database: Database = db(), payments: PaymentsProvider | null = paymentsProvider()): Promise<{ ok: boolean; message: string; orderId?: string }> {
  const r = await withTenant(
    { tenantId, userId: actor },
    async (tx) => {
      const e = await tx.selectFrom("estimates").select(["status", "total_cents", "stripe_invoice_id"]).where("id", "=", id).executeTakeFirst();
      if (!e) return { ok: false, message: "That estimate isn't here anymore." } as const;
      if (!["approved", "invoiced", "sent", "viewed"].includes(e.status)) return { ok: false, message: e.status === "paid" ? "It's already paid." : "Only approved or sent estimates can be marked paid." } as const;
      const paid = await recordEstimatePaid(tx, id, { invoiceId: null, paymentIntentId: null, totalCents: e.total_cents, taxCents: 0, accountId: null, actor, note: note.trim() ? `Paid outside Stripe: ${note.trim()}` : "Paid outside Stripe" });
      return paid ? ({ ok: true, ...paid, invoiceId: e.stripe_invoice_id, conn: await readPayments(tx) } as const) : ({ ok: false, message: "Couldn't record the payment." } as const);
    },
    database,
  );
  if (!r.ok) return r;
  // The Stripe invoice is still open, so the client could pay it twice. Void it.
  if (r.invoiceId && r.conn.accountId && payments) await payments.voidInvoice(r.conn.accountId, r.invoiceId).catch((err) => console.error("Voiding the paid invoice failed", err));
  if (r.created) await afterOrderPaid(tenantId, r.orderId, database);
  return { ok: true, message: `Marked paid. It's order #${r.orderNumber}.`, orderId: r.orderId };
}

async function alertPaid(tenantId: string, estimateId: string, orderNumber: number, database: Database) {
  const prep = await withTenant({ tenantId, userId: "system:stripe" }, async (tx) => ({ e: await tx.selectFrom("estimates").select(["number", "client", "total_cents", "currency"]).where("id", "=", estimateId).executeTakeFirst(), settings: await getSalesSettings(tx), sender: await salesSender(tx) }), database);
  if (!prep.e || !prep.settings.store.alertEmails.length || !prep.sender) return;
  const mail = estimatePaidEmail(prep.sender, { number: prep.e.number, clientName: client(prep.e.client).name, totalCents: prep.e.total_cents, currency: prep.e.currency, url: `${appUrl()}/sales/estimates/${estimateId}`, orderNumber });
  await sendOne(prep.sender, { to: prep.settings.store.alertEmails.join(","), ...mail, kind: "estimate-paid", ref: estimateId }, `bison/estimate-paid/${estimateId}`);
}

/** Estimates for one contact, for the contact panel. */
export async function estimatesFor(tx: Tx, email: string): Promise<EstimateRow[]> {
  const rows = await tx.selectFrom("estimates").select(["id", "number", "status", "title", "client", "total_cents", "currency", "sent_at", "updated_at", "valid_until", "source"]).where(sql<boolean>`lower(client ->> 'email') = ${email.toLowerCase()}`).orderBy("updated_at", "desc").limit(20).execute();
  return rows.map((r) => ({ id: r.id, number: r.number, status: r.status, title: r.title, client: client(r.client), totalCents: r.total_cents, currency: r.currency, sentAt: r.sent_at, updatedAt: r.updated_at, validUntil: dateOnly(r.valid_until), source: r.source }));
}
