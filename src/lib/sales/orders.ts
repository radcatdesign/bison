import "server-only";
// Orders: recording a paid order (from checkout, a paid invoice, or a free
// order), telling the team, sending it to fulfillment, refunds, and the list
// and detail the dashboard shows. Network calls (email, ShipStation, Stripe)
// happen outside transactions, and every outcome is written back to the order.
import { sql } from "kysely";
import { can, loadAccess } from "@/lib/access/entitlements";
import { audit } from "@/lib/audit";
import { type Database, db, isUuid, type Tx, withTenant } from "@/lib/db";
import type { FulfillmentStatus, OrderSource, OrderStatus } from "@/lib/db/types";
import { appUrl } from "@/lib/env";
import { CarrierError, type FulfillmentOrder } from "./carriers";
import { orderAlertEmail, salesSender, sendOne } from "./emails";
import { pack, PackingError } from "./packing";
import { type PaymentsProvider, paymentsProvider } from "./payments";
import { addressComplete, type Address, EMPTY_ADDRESS } from "./settings";
import { connectedCarrier, getSalesSettings, readPayments } from "./store";
import type { Delivery, OrderDetail, OrderItem, OrderRow } from "./types";

export const MAX_FULFILLMENT_ATTEMPTS = 5;

export class OrderError extends Error {}

export type NewOrder = {
  source: OrderSource;
  email: string;
  name: string;
  phone: string;
  shipTo: Partial<Address>;
  items: OrderItem[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  discountCode: string;
  shippingService: string;
  cartId?: string | null;
  estimateId?: string | null;
  tradeAccountId?: string | null;
  stripeAccountId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeInvoiceId?: string | null;
  /** Ship it: physical items going to an address. */
  needsShipping: boolean;
};

async function nextNumber(tx: Tx, table: "orders" | "estimates", start: number): Promise<number> {
  await sql`select pg_advisory_xact_lock(hashtext(app_tenant_id()::text || ${`:${table}`}))`.execute(tx);
  const row = await tx.selectFrom(table).select((eb) => eb.fn.max("number").as("n")).executeTakeFirst();
  return Math.max(start, Number(row?.n ?? 0) + 1);
}

export const nextOrderNumber = (tx: Tx) => nextNumber(tx, "orders", 1001);
export const nextEstimateNumber = (tx: Tx) => nextNumber(tx, "estimates", 101);

/** The buyer as a contact, filling in blanks but never overwriting what the team has. */
export async function upsertBuyer(tx: Tx, b: { email: string; name: string; phone: string }): Promise<string> {
  const row = await tx
    .insertInto("contacts")
    .values({ email: b.email, name: b.name.slice(0, 120), phone: b.phone.slice(0, 40), status: "won" })
    .onConflict((oc) => oc.columns(["tenant_id", "email"]).doUpdateSet({ last_seen_at: sql`now()`, name: sql`coalesce(nullif(contacts.name, ''), excluded.name)`, phone: sql`coalesce(nullif(contacts.phone, ''), excluded.phone)` }))
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/**
 * Records a paid order. Safe to call twice for the same checkout or invoice:
 * the second call returns the first order. Returns the id and whether it's new.
 */
export async function createOrder(tx: Tx, o: NewOrder): Promise<{ id: string; number: number; created: boolean }> {
  if (o.stripeCheckoutSessionId) {
    const dup = await tx.selectFrom("orders").select(["id", "number"]).where("stripe_checkout_session_id", "=", o.stripeCheckoutSessionId).executeTakeFirst();
    if (dup) return { ...dup, created: false };
  }
  if (o.stripeInvoiceId) {
    const dup = await tx.selectFrom("orders").select(["id", "number"]).where("stripe_invoice_id", "=", o.stripeInvoiceId).executeTakeFirst();
    if (dup) return { ...dup, created: false };
  }
  const contactId = await upsertBuyer(tx, o);
  const number = await nextOrderNumber(tx);
  const settings = await getSalesSettings(tx);
  const fulfillment: FulfillmentStatus = o.needsShipping && settings.shipping.fulfillment === "shipstation" ? "pending" : "none";
  const row = await tx
    .insertInto("orders")
    .values({
      number,
      source: o.source,
      fulfillment,
      email: o.email,
      name: o.name.slice(0, 120),
      phone: o.phone.slice(0, 40),
      ship_to: JSON.stringify(o.shipTo),
      items: JSON.stringify(o.items),
      subtotal_cents: o.subtotalCents,
      discount_cents: o.discountCents,
      shipping_cents: o.shippingCents,
      tax_cents: o.taxCents,
      total_cents: o.totalCents,
      currency: o.currency,
      discount_code: o.discountCode,
      shipping_service: o.shippingService.slice(0, 120),
      cart_id: o.cartId ?? null,
      estimate_id: o.estimateId ?? null,
      contact_id: contactId,
      trade_account_id: o.tradeAccountId ?? null,
      stripe_account_id: o.stripeAccountId ?? null,
      stripe_checkout_session_id: o.stripeCheckoutSessionId ?? null,
      stripe_payment_intent_id: o.stripePaymentIntentId ?? null,
      stripe_invoice_id: o.stripeInvoiceId ?? null,
      fulfillment_detail: JSON.stringify(fulfillment === "pending" ? { provider: "shipstation", attempts: 0 } : {}),
    })
    .returning(["id", "number"])
    .executeTakeFirstOrThrow();
  // Bought, so any "left a cart" series for them stops.
  const runs = await tx
    .selectFrom("sequence_runs as r")
    .innerJoin("sequences as s", (j) => j.onRef("s.id", "=", "r.sequence_id").onRef("s.tenant_id", "=", "r.tenant_id"))
    .select("r.id")
    .where("r.email", "=", o.email)
    .where("r.status", "=", "active")
    .where("s.trigger", "=", "cart")
    .execute();
  if (runs.length) await tx.updateTable("sequence_runs").set({ status: "stopped", stopped_reason: "They bought", next_at: null }).where("id", "in", runs.map((r) => r.id)).execute();
  await audit(tx, { action: "order.paid", targetType: "order", targetId: row.id, detail: { number, source: o.source, total: o.totalCents } });
  return { ...row, created: true };
}

// ---- After an order: tell the team, send it to be packed --------------------------------

export const orderUrl = (id: string) => `${appUrl()}/sales/orders?id=${id}`;

/** Emails the team about a paid order and records exactly what happened. */
export async function alertTeam(tenantId: string, orderId: string, database: Database = db(), payments: PaymentsProvider | null = paymentsProvider()): Promise<Delivery> {
  const prep = await withTenant(
    { tenantId, userId: "system:sales" },
    async (tx) => {
      const o = await tx.selectFrom("orders as o").leftJoin("trade_accounts as t", (j) => j.onRef("t.id", "=", "o.trade_account_id").onRef("t.tenant_id", "=", "o.tenant_id")).selectAll("o").select("t.company").where("o.id", "=", orderId).executeTakeFirst();
      if (!o) return null;
      const settings = await getSalesSettings(tx);
      return { o, to: settings.store.alertEmails, sender: await salesSender(tx) };
    },
    database,
  );
  if (!prep) return { error: "No such order." };
  const { o, to, sender } = prep;
  let delivery: Delivery;
  if (!to.length) delivery = { at: new Date().toISOString(), error: "Nobody is set to get order alerts. Add someone in Sales, Checkout." };
  else if (!sender) delivery = await sendOne(null, { to: to.join(","), subject: "", html: "", text: "", kind: "order-alert", ref: o.id }, "");
  else {
    const items = (o.items as OrderItem[]) ?? [];
    const mail = orderAlertEmail(sender, {
      number: o.number,
      name: o.name,
      email: o.email,
      phone: o.phone,
      items,
      subtotalCents: o.subtotal_cents,
      discountCents: o.discount_cents,
      discountCode: o.discount_code,
      shippingCents: o.shipping_cents,
      shippingService: o.shipping_service,
      taxCents: o.tax_cents,
      totalCents: o.total_cents,
      currency: o.currency,
      shipTo: (o.ship_to ?? {}) as Partial<Address>,
      orderUrl: orderUrl(o.id),
      paymentUrl: payments && o.stripe_account_id && o.stripe_payment_intent_id ? payments.paymentUrl(o.stripe_account_id, o.stripe_payment_intent_id) : null,
      trade: o.company,
    });
    delivery = await sendOne(sender, { to: to.join(","), ...mail, kind: "order-alert", ref: o.id }, `bison/order-alert/${o.id}/${Date.now()}`);
  }
  await withTenant({ tenantId, userId: "system:sales" }, (tx) => tx.updateTable("orders").set({ alert: JSON.stringify(delivery) }).where("id", "=", orderId).execute(), database);
  return delivery;
}

/** Puts a paid order in ShipStation to be packed and labeled. Records the result either way. */
export async function sendToFulfillment(tenantId: string, orderId: string, database: Database = db()): Promise<{ ok: boolean; message: string }> {
  const prep = await withTenant(
    { tenantId, userId: "system:sales" },
    async (tx) => {
      const o = await tx.selectFrom("orders").selectAll().where("id", "=", orderId).executeTakeFirst();
      if (!o) return null;
      const settings = await getSalesSettings(tx);
      const carrier = await connectedCarrier(tx, tenantId, "shipstation");
      const variants = await tx
        .selectFrom("product_variants")
        .select(["id", "weight_oz", "box", "units_per_box", "ships_alone", "flat_ship_cents"])
        .where("id", "in", [...new Set(((o.items as OrderItem[]) ?? []).map((i) => i.variantId).filter(isUuid))].concat(["00000000-0000-4000-8000-000000000000"]))
        .execute();
      return { o, settings, carrier, variants };
    },
    database,
  );
  if (!prep) return { ok: false, message: "No such order." };
  const { o, settings, carrier, variants } = prep;
  const detail = (o.fulfillment_detail ?? {}) as { attempts?: number; externalId?: string };
  if (o.fulfillment === "sent" || o.fulfillment === "shipped") return { ok: true, message: "It's already in ShipStation." };
  const attempts = (detail.attempts ?? 0) + 1;
  const record = (fulfillment: FulfillmentStatus, extra: Record<string, unknown>) =>
    withTenant({ tenantId, userId: "system:sales" }, (tx) => tx.updateTable("orders").set({ fulfillment, fulfillment_detail: JSON.stringify({ ...detail, provider: "shipstation", attempts, at: new Date().toISOString(), ...extra }) }).where("id", "=", orderId).execute(), database);

  if (!carrier?.fulfill) {
    await record("failed", { error: "ShipStation isn't connected. Connect it in Settings, Shipping, then send it again." });
    return { ok: false, message: "ShipStation isn't connected." };
  }
  const items = (o.items as OrderItem[]) ?? [];
  let packages: FulfillmentOrder["packages"] = [];
  try {
    packages = pack(
      items.map((i) => {
        const v = variants.find((x) => x.id === i.variantId);
        return { variantId: i.variantId ?? i.sku, name: i.name, qty: i.qty, weightOz: v ? Number(v.weight_oz) : 0, box: v?.box ?? "", unitsPerBox: v?.units_per_box ?? 1, shipsAlone: v?.ships_alone ?? false, flatShipCents: v?.flat_ship_cents ?? null };
      }),
      settings.shipping.boxes,
    ).packages;
  } catch (err) {
    if (!(err instanceof PackingError)) throw err;
  }
  const shipTo = { ...EMPTY_ADDRESS, ...((o.ship_to ?? {}) as Partial<Address>) };
  try {
    const externalId = await carrier.fulfill({
      orderId: o.id,
      number: o.number,
      shipTo: { ...shipTo, name: shipTo.name || o.name, phone: shipTo.phone || o.phone, email: o.email },
      from: settings.shipping.from,
      items: items.map((i) => ({ name: i.variant ? `${i.name} (${i.variant})` : i.name, sku: i.sku, qty: i.qty, unitCents: i.unitCents })),
      packages,
      totalCents: o.total_cents,
      shippingCents: o.shipping_cents,
      shippingService: o.shipping_service,
      currency: o.currency,
    });
    await record("sent", { externalId, error: undefined });
    return { ok: true, message: "Sent to ShipStation." };
  } catch (err) {
    const message = err instanceof CarrierError ? err.message : "ShipStation didn't answer.";
    await record(attempts >= MAX_FULFILLMENT_ATTEMPTS ? "failed" : (err instanceof CarrierError && err.retry ? "pending" : "failed"), { error: message });
    return { ok: false, message };
  }
}

/** Everything that happens once an order is paid. Runs after the response, and again from the job for anything that failed. */
export async function afterOrderPaid(tenantId: string, orderId: string, database: Database = db()): Promise<void> {
  await alertTeam(tenantId, orderId, database).catch((err) => console.error("Order alert failed", err));
  const needs = await withTenant({ tenantId, userId: "system:sales" }, (tx) => tx.selectFrom("orders").select("fulfillment").where("id", "=", orderId).executeTakeFirst(), database);
  if (needs?.fulfillment === "pending") await sendToFulfillment(tenantId, orderId, database).catch((err) => console.error("Fulfillment failed", err));
}

// ---- Refunds ----------------------------------------------------------------------------

/** Refunds part or all of an order through the company's Stripe account. */
export async function refundOrder(tenantId: string, orderId: string, amountCents: number, actor: string, database: Database = db(), payments: PaymentsProvider | null = paymentsProvider()): Promise<{ ok: boolean; message: string }> {
  if (!payments) return { ok: false, message: "Payments aren't switched on for this server." };
  const o = await withTenant({ tenantId, userId: actor }, (tx) => tx.selectFrom("orders").selectAll().where("id", "=", orderId).executeTakeFirst(), database);
  if (!o) return { ok: false, message: "That order isn't here anymore." };
  if (!o.stripe_account_id || !o.stripe_payment_intent_id) return { ok: false, message: "This order wasn't paid through Stripe, so refund it where it was paid." };
  const left = o.total_cents - o.refunded_cents;
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { ok: false, message: "Enter how much to refund." };
  if (amountCents > left) return { ok: false, message: `You can refund up to ${(left / 100).toFixed(2)} more on this order.` };
  try {
    await payments.refund(o.stripe_account_id, { paymentIntentId: o.stripe_payment_intent_id, amountCents, key: `bison-refund-${o.id}-${o.refunded_cents}-${amountCents}` });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Stripe didn't take the refund." };
  }
  await syncRefunds(tenantId, orderId, database, payments);
  await withTenant({ tenantId, userId: actor }, (tx) => audit(tx, { action: "order.refunded", targetType: "order", targetId: orderId, detail: { amount: amountCents } }), database);
  return { ok: true, message: `Refunded. It usually reaches their card in 5 to 10 days.` };
}

/** Reads how much has been refunded from Stripe and updates the order. */
export async function syncRefunds(tenantId: string, orderId: string, database: Database = db(), payments: PaymentsProvider | null = paymentsProvider()): Promise<void> {
  if (!payments) return;
  const o = await withTenant({ tenantId, userId: "system:stripe" }, (tx) => tx.selectFrom("orders").select(["stripe_account_id", "stripe_payment_intent_id", "total_cents"]).where("id", "=", orderId).executeTakeFirst(), database);
  if (!o?.stripe_account_id || !o.stripe_payment_intent_id) return;
  const refunded = Math.min(o.total_cents, await payments.refunded(o.stripe_account_id, o.stripe_payment_intent_id));
  const status: OrderStatus = refunded <= 0 ? "paid" : refunded >= o.total_cents ? "refunded" : "partially_refunded";
  await withTenant({ tenantId, userId: "system:stripe" }, (tx) => tx.updateTable("orders").set({ refunded_cents: refunded, status }).where("id", "=", orderId).execute(), database);
}

// ---- Reading ----------------------------------------------------------------------------

export type OrderFilter = { status?: "all" | "to_fulfill" | "refunded"; search?: string; limit?: number };

export async function listOrders(tx: Tx, f: OrderFilter = {}): Promise<OrderRow[]> {
  let q = tx
    .selectFrom("orders as o")
    .leftJoin("trade_accounts as t", (j) => j.onRef("t.id", "=", "o.trade_account_id").onRef("t.tenant_id", "=", "o.tenant_id"))
    .select(["o.id", "o.number", "o.source", "o.status", "o.fulfillment", "o.email", "o.name", "o.items", "o.total_cents", "o.refunded_cents", "o.currency", "o.paid_at", "t.company"])
    .orderBy("o.paid_at", "desc")
    .limit(Math.min(f.limit ?? 500, 2000));
  if (f.status === "to_fulfill") q = q.where("o.fulfillment", "in", ["pending", "failed"]);
  if (f.status === "refunded") q = q.where("o.status", "in", ["refunded", "partially_refunded"]);
  const term = f.search?.trim();
  if (term) {
    const n = Number(term.replace(/^#/, ""));
    const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    q = q.where((eb) => eb.or([eb("o.email", "ilike", like), eb("o.name", "ilike", like), ...(Number.isInteger(n) && n > 0 ? [eb("o.number", "=", n)] : [])]));
  }
  const rows = await q.execute();
  return rows.map((r) => ({ id: r.id, number: r.number, source: r.source, status: r.status, fulfillment: r.fulfillment, email: r.email, name: r.name, itemCount: ((r.items as OrderItem[]) ?? []).reduce((n, i) => n + i.qty, 0), totalCents: r.total_cents, refundedCents: r.refunded_cents, currency: r.currency, paidAt: r.paid_at, tradeCompany: r.company }));
}

export async function getOrder(tx: Tx, id: string): Promise<OrderDetail | null> {
  if (!isUuid(id)) return null;
  const r = await tx
    .selectFrom("orders as o")
    .leftJoin("trade_accounts as t", (j) => j.onRef("t.id", "=", "o.trade_account_id").onRef("t.tenant_id", "=", "o.tenant_id"))
    .leftJoin("estimates as e", (j) => j.onRef("e.id", "=", "o.estimate_id").onRef("e.tenant_id", "=", "o.tenant_id"))
    .selectAll("o")
    .select(["t.company", "e.number as estimate_number"])
    .where("o.id", "=", id)
    .executeTakeFirst();
  if (!r) return null;
  const items = (r.items as OrderItem[]) ?? [];
  return {
    id: r.id,
    number: r.number,
    source: r.source,
    status: r.status,
    fulfillment: r.fulfillment,
    email: r.email,
    name: r.name,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    totalCents: r.total_cents,
    refundedCents: r.refunded_cents,
    currency: r.currency,
    paidAt: r.paid_at,
    tradeCompany: r.company,
    phone: r.phone,
    shipTo: (r.ship_to ?? {}) as Partial<Address>,
    items,
    subtotalCents: r.subtotal_cents,
    discountCents: r.discount_cents,
    shippingCents: r.shipping_cents,
    taxCents: r.tax_cents,
    discountCode: r.discount_code,
    shippingService: r.shipping_service,
    alert: (r.alert ?? {}) as Delivery,
    fulfillmentDetail: (r.fulfillment_detail ?? {}) as OrderDetail["fulfillmentDetail"],
    stripe: { accountId: r.stripe_account_id, paymentIntentId: r.stripe_payment_intent_id, sessionId: r.stripe_checkout_session_id, invoiceId: r.stripe_invoice_id },
    estimate: r.estimate_id && r.estimate_number ? { id: r.estimate_id, number: r.estimate_number } : null,
    contactId: r.contact_id,
    note: r.note,
  };
}

/** Orders for one contact, newest first, for the contact panel. */
export async function ordersFor(tx: Tx, email: string): Promise<OrderRow[]> {
  const rows = await tx.selectFrom("orders").select(["id", "number", "source", "status", "fulfillment", "email", "name", "items", "total_cents", "refunded_cents", "currency", "paid_at"]).where("email", "=", email.toLowerCase()).orderBy("paid_at", "desc").limit(20).execute();
  return rows.map((r) => ({ id: r.id, number: r.number, source: r.source, status: r.status, fulfillment: r.fulfillment, email: r.email, name: r.name, itemCount: ((r.items as OrderItem[]) ?? []).reduce((n, i) => n + i.qty, 0), totalCents: r.total_cents, refundedCents: r.refunded_cents, currency: r.currency, paidAt: r.paid_at, tradeCompany: null }));
}

export async function markShipped(tx: Tx, id: string, tracking: string): Promise<void> {
  const o = await tx.selectFrom("orders").select("fulfillment_detail").where("id", "=", id).executeTakeFirst();
  if (!o) throw new OrderError("That order isn't here anymore.");
  await tx.updateTable("orders").set({ fulfillment: "shipped", fulfillment_detail: JSON.stringify({ ...((o.fulfillment_detail ?? {}) as object), tracking: tracking.slice(0, 80), shippedAt: new Date().toISOString() }) }).where("id", "=", id).execute();
}

export async function salesReady(tx: Tx): Promise<{ payments: Awaited<ReturnType<typeof readPayments>>; marketing: boolean }> {
  return { payments: await readPayments(tx), marketing: can({ access: await loadAccess(tx) }, "marketing.sequences") };
}

export { addressComplete };
