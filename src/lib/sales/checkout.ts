import "server-only";
// The public side of the shop: carts, checkout, live shipping quotes, free
// orders, quote requests, and recording what Stripe says was paid. Requests
// arrive without a session, so each one resolves the company from its address
// with a narrow lookup, then works inside that company's RLS context. Prices
// always come from the database, never from the browser.
import { sql } from "kysely";
import { can, loadAccess } from "@/lib/access/entitlements";
import { type Database, db, isUuid, type Tx, withTenant } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { startSeries } from "@/lib/marketing/people";
import { tenantInfo } from "@/lib/marketing/store";
import { type Carrier, CarrierError, type Rate } from "./carriers";
import { checkCode, type CodeResult, holdCode, releaseHeldCode, spendHeldCode } from "./discount-codes";
import { inquiryAlertEmail, salesSender, sendOne } from "./emails";
import { afterOrderPaid, createOrder, nextEstimateNumber, upsertBuyer } from "./orders";
import { pack, PackingError, type PackResult } from "./packing";
import { type CheckoutState, PaymentsError, type PaymentsProvider, paymentsProvider } from "./payments";
import { cleanItems, type CartItem, MAX_LINE_QTY, type PricedCart, priceCart } from "./pricing";
import { variantsForPricing } from "./products";
import { addressComplete, type Address, addressSchema, type SalesSettings } from "./settings";
import { type ShippingOption, shippingOptions } from "./shipping";
import { connectedCarrier, getSalesSettings, readPayments } from "./store";
import { tradeBuyer } from "./trade";
import type { OrderItem } from "./types";

export const CHECKOUT_MINUTES = 60;

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** The company behind a shop address, only while it has Sales. */
export async function shopTenant(slug: string, database: Database = db()): Promise<string | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) return null;
  const r = await sql<{ id: string | null }>`select resolve_sales_tenant(${slug}) as id`.execute(database);
  return r.rows[0]?.id ?? null;
}

export type Buyer = { tradeAccountId: string | null };

/** What the shopper's browser gets back: prices and totals, nothing internal. */
export type PublicCart = {
  cartId: string;
  status: string;
  email: string;
  code: string;
  lines: { variantId: string; name: string; variant: string; slug: string; photo: string | null; qty: number; unitCents: number; listUnitCents: number; compareAtCents: number | null; lineCents: number }[];
  itemCount: number;
  subtotalCents: number;
  discount: { code: string; amountCents: number; label: string } | null;
  discountError: string | null;
  merchandiseCents: number;
  trade: { name: string; percentOff: number } | null;
  inquiry: boolean;
  notices: string[];
  currency: string;
  freeShipping: boolean;
};

function toPublic(cartId: string, status: string, email: string | null, code: string, p: PricedCart, settings: SalesSettings): PublicCart {
  return {
    cartId,
    status,
    email: email ?? "",
    code,
    lines: p.lines.map(({ variantId, name, variant, slug, photo, qty, unitCents, listUnitCents, compareAtCents, lineCents }) => ({ variantId, name, variant, slug, photo, qty, unitCents, listUnitCents, compareAtCents, lineCents })),
    itemCount: p.itemCount,
    subtotalCents: p.subtotalCents,
    discount: p.discount,
    discountError: p.discountError,
    merchandiseCents: p.merchandiseCents,
    trade: p.trade,
    inquiry: Boolean(p.inquiry),
    notices: p.notices,
    currency: p.currency,
    freeShipping: p.freeShipping || (settings.shipping.freeOverCents !== null && p.merchandiseCents >= settings.shipping.freeOverCents) || settings.shipping.source === "free",
  };
}

type CartRow = { id: string; status: string; items: unknown; email: string | null; name: string; discount_code: string; trade_account_id: string | null; checkout_session_id: string | null; priced: unknown };

async function loadCart(tx: Tx, cartId: string | null): Promise<CartRow | null> {
  if (!cartId || !isUuid(cartId)) return null;
  return (await tx.selectFrom("carts").select(["id", "status", "items", "email", "name", "discount_code", "trade_account_id", "checkout_session_id", "priced"]).where("id", "=", cartId).executeTakeFirst()) ?? null;
}

/** Prices a cart for this buyer: their trade tier, the code in the cart, the order limit. */
export async function priceFor(tx: Tx, items: CartItem[], opts: { buyer: Buyer; code: string; email: string | null; cartId: string | null; settings: SalesSettings; now?: Date }): Promise<{ priced: PricedCart; code: CodeResult }> {
  const now = opts.now ?? new Date();
  const info = await tenantInfo(tx);
  const variants = await variantsForPricing(
    tx,
    items.map((i) => i.variantId),
  );
  const trade = opts.buyer.tradeAccountId ? await tradeBuyer(tx, opts.buyer.tradeAccountId, opts.settings.trade.tiers, now) : null;
  const currency = opts.settings.store.currency;
  // Codes are checked against the subtotal after trade pricing, so price once without, then with.
  const first = priceCart({ items, variants, currency, trade: trade ? { name: trade.tier.name, percentOff: trade.tier.percentOff } : null, inquiry: opts.settings.store.inquiry });
  let code: CodeResult = null;
  if (opts.code) code = await checkCode(tx, opts.code, { subtotalCents: first.subtotalCents, email: opts.email, tradeAccountId: trade?.id ?? null, cartId: opts.cartId, now, currency, timeZone: info.timezone });
  const priced = code ? priceCart({ items, variants, currency, trade: first.trade, inquiry: opts.settings.store.inquiry, discount: () => code }) : first;
  return { priced, code };
}

export type CartOp = { op: "add"; variantId: string; qty: number } | { op: "set"; variantId: string; qty: number } | { op: "remove"; variantId: string } | { op: "code"; code: string } | { op: "email"; email: string; name?: string } | { op: "view" };

/** Reads or changes a cart, creating one on the first add. */
export async function updateCart(tenantId: string, cartId: string | null, change: CartOp, buyer: Buyer, database: Database = db()): Promise<PublicCart> {
  return withTenant(
    { tenantId, userId: "public:cart" },
    async (tx) => {
      const settings = await getSalesSettings(tx);
      let cart = await loadCart(tx, cartId);
      // A paid or quoted cart is done; changes start a new one.
      if (cart && (cart.status === "ordered" || cart.status === "inquiry")) cart = null;
      let items = cleanItems(cart?.items ?? []);
      let code = cart?.discount_code ?? "";
      let email = cart?.email ?? null;
      let name = cart?.name ?? "";
      if (change.op === "add" || change.op === "set") {
        if (!isUuid(change.variantId)) throw new CheckoutError("That isn't something we sell.");
        const qty = Math.max(0, Math.min(MAX_LINE_QTY, Math.floor(change.qty)));
        const found = items.find((i) => i.variantId === change.variantId);
        if (change.op === "add") {
          if (qty <= 0) throw new CheckoutError("Choose how many.");
          if (found) found.qty = Math.min(MAX_LINE_QTY, found.qty + qty);
          else items.push({ variantId: change.variantId, qty });
        } else if (found) found.qty = qty;
        items = cleanItems(items);
      } else if (change.op === "remove") items = items.filter((i) => i.variantId !== change.variantId);
      else if (change.op === "code") code = change.code.trim().toUpperCase().replace(/\s+/g, "").slice(0, 40);
      else if (change.op === "email") {
        const e = change.email.trim().toLowerCase();
        if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new CheckoutError("Enter a full email address.");
        email = e || null;
        if (change.name !== undefined) name = change.name.trim().slice(0, 120);
      }

      const { priced } = await priceFor(tx, items, { buyer, code, email, cartId: cart?.id ?? null, settings });
      // Drop what isn't for sale anymore, so the cart matches what's shown.
      items = items.filter((i) => priced.lines.some((l) => l.variantId === i.variantId));
      if (!cart && !items.length && change.op === "view") return { cart: toPublic("", "open", null, "", priced, settings), stale: null };
      // Changing a cart that was at checkout or left behind brings it back to open.
      const status = change.op !== "view" && (cart?.status === "checkout" || cart?.status === "abandoned") ? "open" : (cart?.status ?? "open");
      const values = { items: JSON.stringify(items), discount_code: code, email, name, trade_account_id: priced.trade ? buyer.tradeAccountId : null, priced: JSON.stringify(priced), last_active_at: new Date(), status: status as "open" | "checkout" | "abandoned", abandoned_at: null };
      const saved = cart
        ? await tx.updateTable("carts").set(change.op === "view" ? { priced: values.priced } : values).where("id", "=", cart.id).returning(["id", "status"]).executeTakeFirstOrThrow()
        : await tx.insertInto("carts").values(values).returning(["id", "status"]).executeTakeFirstOrThrow();
      if (cart?.status === "checkout" && change.op !== "view") await releaseHeldCode(tx, cart.id);
      return { cart: toPublic(saved.id, saved.status, email, code, priced, settings), stale: cart?.status === "checkout" && change.op !== "view" ? cart.checkout_session_id : null };
    },
    database,
  ).then(async ({ cart, stale }) => {
    // The cart changed after checkout started, so that checkout can't be paid anymore.
    if (stale) {
      const conn = await withTenant({ tenantId, userId: "public:cart" }, (tx) => readPayments(tx), database);
      if (conn.accountId) await paymentsProvider()?.expireCheckout(conn.accountId, stale);
    }
    return cart;
  });
}

// ---- Checkout -----------------------------------------------------------------------------

export type CheckoutStart =
  | { kind: "stripe"; sessionId: string; clientSecret: string; publishableKey: string; accountId: string }
  | { kind: "stand-in"; sessionId: string; clientSecret: string }
  | { kind: "free"; cart: PublicCart }
  | { kind: "inquiry"; cart: PublicCart };

/** Starts paying for a cart: a Stripe checkout on the company's own account, or the free or quote paths. */
export async function startCheckout(tenantId: string, slug: string, cartId: string, input: { email: string; name: string }, buyer: Buyer, database: Database = db(), payments: PaymentsProvider | null = paymentsProvider()): Promise<CheckoutStart> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) throw new CheckoutError("Enter your email so we can send your receipt.");
  const now = new Date();
  const prep = await withTenant(
    { tenantId, userId: "public:checkout" },
    async (tx) => {
      const settings = await getSalesSettings(tx);
      const cart = await loadCart(tx, cartId);
      if (!cart || cart.status === "ordered") throw new CheckoutError("That cart is empty. Add something first.", 404);
      const items = cleanItems(cart.items);
      const { priced, code } = await priceFor(tx, items, { buyer, code: cart.discount_code, email, cartId: cart.id, settings, now });
      if (!priced.lines.length) throw new CheckoutError("That cart is empty. Add something first.");
      await tx.updateTable("carts").set({ email, name: input.name.trim().slice(0, 120), priced: JSON.stringify(priced), last_active_at: now }).where("id", "=", cart.id).execute();
      const conn = await readPayments(tx);
      return { settings, cart, priced, code, conn };
    },
    database,
  );
  const { settings, priced, code, conn } = prep;
  const pub = toPublic(cartId, prep.cart.status, email, prep.cart.discount_code, priced, settings);
  if (priced.inquiry) return { kind: "inquiry", cart: pub };
  if (priced.discountError) throw new CheckoutError(priced.discountError);
  if (priced.merchandiseCents === 0) return { kind: "free", cart: pub };
  if (!payments || !conn.accountId || !conn.chargesEnabled) throw new CheckoutError("This shop isn't taking payments online yet. Contact them to order.", 409);

  const expiresAt = new Date(now.getTime() + CHECKOUT_MINUTES * 60_000);
  const tax = settings.store.checkout.tax && conn.tax === "active";
  let session: { sessionId: string; clientSecret: string };
  try {
    session = await payments.createCheckout(conn.accountId, {
      cartId,
      currency: settings.store.currency,
      email,
      lines: priced.lines.map((l) => ({ name: l.variant ? `${l.name} (${l.variant})` : l.name, qty: l.qty, unitCents: l.unitCents, taxCode: l.taxCode, variantId: l.variantId, image: l.photo?.startsWith("https://") ? l.photo : l.photo ? `${appUrl()}${l.photo}` : null })),
      discount: priced.discount ? { label: priced.discount.label, amountCents: priced.discount.amountCents } : null,
      countries: settings.store.checkout.countries,
      collectPhone: settings.store.checkout.collectPhone,
      tax,
      returnUrl: `${appUrl()}/p/${slug}/order?session_id={CHECKOUT_SESSION_ID}`,
      expiresAt,
    });
  } catch (err) {
    throw new CheckoutError(err instanceof PaymentsError ? "Checkout didn't start. Try again in a minute." : "Checkout didn't start.", 502);
  }
  await withTenant(
    { tenantId, userId: "public:checkout" },
    async (tx) => {
      await tx.updateTable("carts").set({ status: "checkout", checkout_session_id: session.sessionId, last_active_at: now }).where("id", "=", cartId).execute();
      if (code?.ok) await holdCode(tx, code, { cartId, email, tradeAccountId: buyer.tradeAccountId, amountCents: priced.discount?.amountCents ?? 0, until: expiresAt });
    },
    database,
  );
  if (payments.name === "stand-in") return { kind: "stand-in", ...session };
  return { kind: "stripe", ...session, publishableKey: payments.publishableKey ?? "", accountId: conn.accountId };
}

// ---- Shipping quotes ------------------------------------------------------------------------

export type Quote = { ok: true; options: ShippingOption[] } | { ok: false; message: string };

function packFor(priced: PricedCart, settings: SalesSettings): PackResult | null {
  try {
    return pack(
      priced.lines.map((l) => ({ variantId: l.variantId, name: l.name, qty: l.qty, ...l.shipping })),
      settings.shipping.boxes,
    );
  } catch (err) {
    if (err instanceof PackingError) return null;
    throw err;
  }
}

/** Shipping options for a priced cart going to an address. */
export async function quote(priced: PricedCart, to: Address, settings: SalesSettings, carrier: Carrier | null): Promise<Quote> {
  const packed = packFor(priced, settings);
  if (!packed) return { ok: false, message: "That's too many items to ship in one order. Contact us and we'll quote it." };
  let rates: Rate[] | null = null;
  if (settings.shipping.source === "carrier" && packed.packages.length && !priced.freeShipping) {
    if (!carrier) return { ok: false, message: "Shipping rates aren't available right now. Please try again shortly." };
    try {
      rates = await carrier.rates({ from: settings.shipping.from, to, residential: settings.shipping.residentialDefault, packages: packed.packages, currency: priced.currency });
    } catch (err) {
      if (!(err instanceof CarrierError)) throw err;
      rates = null;
    }
  }
  return shippingOptions({ settings: settings.shipping, pack: packed, itemCount: priced.itemCount, merchandiseCents: priced.merchandiseCents, codeFreeShipping: priced.freeShipping, rates, currency: priced.currency });
}

/** Rates the address the shopper entered and puts the options on their Stripe checkout. */
export async function quoteCheckout(tenantId: string, sessionId: string, input: unknown, database: Database = db(), payments: PaymentsProvider | null = paymentsProvider()): Promise<Quote> {
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success || !addressComplete(parsed.data)) return { ok: false, message: "Enter a full shipping address." };
  const to = parsed.data;
  const prep = await withTenant(
    { tenantId, userId: "public:checkout" },
    async (tx) => {
      const cart = await tx.selectFrom("carts").select(["id", "status", "priced"]).where("checkout_session_id", "=", sessionId).executeTakeFirst();
      if (!cart || cart.status !== "checkout") return null;
      const settings = await getSalesSettings(tx);
      const carrier = settings.shipping.source === "carrier" ? await connectedCarrier(tx, tenantId, settings.shipping.carrier) : null;
      return { priced: cart.priced as PricedCart, settings, carrier, conn: await readPayments(tx) };
    },
    database,
  );
  if (!prep) return { ok: false, message: "That checkout has ended. Go back to your cart and start again." };
  if (!prep.settings.store.checkout.countries.includes(to.country)) return { ok: false, message: "We don't ship to that country yet." };
  const q = await quote(prep.priced, to, prep.settings, prep.carrier);
  if (!q.ok) return q;
  if (!payments || !prep.conn.accountId) return { ok: false, message: "This shop isn't taking payments right now." };
  try {
    await payments.setCheckoutShipping(prep.conn.accountId, sessionId, { name: to.name, address: to, options: q.options, currency: prep.priced.currency, tax: prep.settings.store.checkout.tax && prep.conn.tax === "active" });
  } catch {
    return { ok: false, message: "We couldn't update your checkout. Try again." };
  }
  return q;
}

// ---- Recording what was paid ------------------------------------------------------------------

function itemsOf(priced: PricedCart): OrderItem[] {
  return priced.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, name: l.name, variant: l.variant, sku: l.sku, qty: l.qty, unitCents: l.unitCents, lineCents: l.lineCents }));
}

/** Turns a completed, paid checkout into an order. Safe to call more than once. */
export async function recordCheckout(tenantId: string, sessionId: string, database: Database = db(), payments: PaymentsProvider | null = paymentsProvider(), run: "after" | "now" | "skip" = "now"): Promise<{ orderId: string; number: number; created: boolean } | null> {
  if (!payments) return null;
  const conn = await withTenant({ tenantId, userId: "system:stripe" }, (tx) => readPayments(tx), database);
  if (!conn.accountId) return null;
  const state: CheckoutState = await payments.checkout(conn.accountId, sessionId);
  if (state.status !== "complete" || !state.paid) return null;
  const result = await withTenant(
    { tenantId, userId: "system:stripe" },
    async (tx) => {
      // By the checkout it belongs to, or by the cart named on it if the cart has moved on since.
      const cart =
        (await tx.selectFrom("carts").select(["id", "priced", "trade_account_id", "discount_code"]).where("checkout_session_id", "=", sessionId).executeTakeFirst()) ??
        (state.cartId && isUuid(state.cartId) ? await tx.selectFrom("carts").select(["id", "priced", "trade_account_id", "discount_code"]).where("id", "=", state.cartId).executeTakeFirst() : undefined);
      if (!cart) return null;
      const priced = cart.priced as PricedCart;
      const order = await createOrder(tx, {
        source: "checkout",
        email: state.email || "unknown@example.com",
        name: state.name,
        phone: state.phone,
        shipTo: state.shipTo ?? {},
        items: itemsOf(priced),
        subtotalCents: state.subtotalCents,
        discountCents: state.discountCents,
        shippingCents: state.shippingCents,
        taxCents: state.taxCents,
        totalCents: state.totalCents,
        currency: state.currency,
        discountCode: priced.discount?.code ?? "",
        shippingService: state.shippingLabel,
        cartId: cart.id,
        tradeAccountId: priced.trade ? cart.trade_account_id : null,
        stripeAccountId: conn.accountId,
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: state.paymentIntentId,
        needsShipping: true,
      });
      if (order.created) {
        await tx.updateTable("carts").set({ status: "ordered", order_id: order.id }).where("id", "=", cart.id).execute();
        await spendHeldCode(tx, cart.id, order.id);
      }
      return { orderId: order.id, number: order.number, created: order.created };
    },
    database,
  );
  if (result?.created && run === "now") await afterOrderPaid(tenantId, result.orderId, database);
  return result;
}

/** A checkout that ran out of time: the code is free again and the cart can be picked up. */
export async function checkoutExpired(tenantId: string, sessionId: string, database: Database = db()): Promise<void> {
  await withTenant(
    { tenantId, userId: "system:stripe" },
    async (tx) => {
      const cart = await tx.selectFrom("carts").select(["id", "status"]).where("checkout_session_id", "=", sessionId).executeTakeFirst();
      if (!cart || cart.status !== "checkout") return;
      await releaseHeldCode(tx, cart.id);
      await tx.updateTable("carts").set({ status: "open", checkout_session_id: null }).where("id", "=", cart.id).execute();
    },
    database,
  );
}

/** The order for a finished checkout, for the thank-you page. */
export async function orderForSession(tenantId: string, sessionId: string, database: Database = db()) {
  return withTenant(
    { tenantId, userId: "public:checkout" },
    (tx) => tx.selectFrom("orders").select(["id", "number", "email", "name", "items", "subtotal_cents", "discount_cents", "shipping_cents", "tax_cents", "total_cents", "currency", "shipping_service", "ship_to"]).where("stripe_checkout_session_id", "=", sessionId).executeTakeFirst(),
    database,
  );
}

// ---- Free orders and quote requests -------------------------------------------------------------

/** A code took the whole order off: no payment, just where to send it. */
export async function placeFreeOrder(tenantId: string, cartId: string, input: { email: string; name: string; phone: string; address: unknown }, buyer: Buyer, database: Database = db()): Promise<{ orderId: string; number: number }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new CheckoutError("Enter your email so we can confirm the order.");
  const parsed = addressSchema.safeParse(input.address);
  if (!parsed.success || !addressComplete(parsed.data)) throw new CheckoutError("Enter a full shipping address.");
  const result = await withTenant(
    { tenantId, userId: "public:checkout" },
    async (tx) => {
      const settings = await getSalesSettings(tx);
      if (!settings.store.checkout.countries.includes(parsed.data.country)) throw new CheckoutError("We don't ship to that country yet.");
      const cart = await loadCart(tx, cartId);
      if (!cart || cart.status === "ordered") throw new CheckoutError("That cart is empty.", 404);
      const items = cleanItems(cart.items);
      const { priced, code } = await priceFor(tx, items, { buyer, code: cart.discount_code, email, cartId: cart.id, settings });
      if (!priced.lines.length) throw new CheckoutError("That cart is empty.");
      if (priced.merchandiseCents !== 0 || !code?.ok) throw new CheckoutError("This order needs payment. Go back and check out.");
      const order = await createOrder(tx, {
        source: "free",
        email,
        name: input.name.trim(),
        phone: input.phone.trim(),
        shipTo: { ...parsed.data, name: parsed.data.name || input.name.trim() },
        items: itemsOf(priced),
        subtotalCents: priced.subtotalCents,
        discountCents: priced.discount?.amountCents ?? 0,
        shippingCents: 0,
        taxCents: 0,
        totalCents: 0,
        currency: priced.currency,
        discountCode: priced.discount?.code ?? "",
        shippingService: "Free shipping",
        cartId: cart.id,
        tradeAccountId: priced.trade ? buyer.tradeAccountId : null,
        needsShipping: true,
      });
      await holdCode(tx, code, { cartId: cart.id, email, tradeAccountId: buyer.tradeAccountId, amountCents: priced.discount?.amountCents ?? 0, until: new Date(Date.now() + 60_000) });
      await spendHeldCode(tx, cart.id, order.id);
      await tx.updateTable("carts").set({ status: "ordered", order_id: order.id, email }).where("id", "=", cart.id).execute();
      return { orderId: order.id, number: order.number };
    },
    database,
  );
  await afterOrderPaid(tenantId, result.orderId, database);
  return result;
}

/** A cart over the order limit becomes a quote request: a contact, a draft estimate, and an email to the team. */
export async function sendInquiry(tenantId: string, cartId: string, input: { email: string; name: string; phone: string; message: string }, buyer: Buyer, database: Database = db()): Promise<{ estimateId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new CheckoutError("Enter your email so we can send the quote.");
  const prep = await withTenant(
    { tenantId, userId: "public:inquiry" },
    async (tx) => {
      const settings = await getSalesSettings(tx);
      const cart = await loadCart(tx, cartId);
      if (!cart || cart.status === "ordered") throw new CheckoutError("That cart is empty.", 404);
      if (cart.status === "inquiry") throw new CheckoutError("We already have this request. We'll be in touch.", 409);
      const { priced } = await priceFor(tx, cleanItems(cart.items), { buyer, code: "", email, cartId: cart.id, settings });
      if (!priced.lines.length) throw new CheckoutError("That cart is empty.");
      const name = input.name.trim().slice(0, 120);
      const phone = input.phone.trim().slice(0, 40);
      const contactId = await upsertBuyer(tx, { email, name, phone });
      await tx.updateTable("contacts").set({ is_new: true }).where("id", "=", contactId).execute();
      await tx
        .insertInto("submissions")
        .values({ contact_id: contactId, form_key: "shop:quote", form_type: "Quote request", fields: JSON.stringify({ name, email, phone, message: input.message.trim().slice(0, 2000), cart: priced.lines.map((l) => `${l.qty} × ${l.name}${l.variant ? ` (${l.variant})` : ""}`).join("; ") }), alert: "{}" })
        .execute();
      const number = await nextEstimateNumber(tx);
      const est = await tx
        .insertInto("estimates")
        .values({
          number,
          source: "inquiry",
          title: "Quote request from the shop",
          client: JSON.stringify({ name, email, company: "", phone, address: {} }),
          contact_id: contactId,
          trade_account_id: priced.trade ? buyer.tradeAccountId : null,
          items: JSON.stringify(priced.lines.map((l, i) => ({ id: `l${i}`, productId: l.productId, variantId: l.variantId, name: l.variant ? `${l.name}, ${l.variant}` : l.name, detail: l.sku, qty: l.qty, unitCents: l.unitCents }))),
          subtotal_cents: priced.subtotalCents,
          total_cents: priced.subtotalCents,
          currency: priced.currency,
          notes: settings.store.estimates.terms,
          internal_note: input.message.trim().slice(0, 2000),
          valid_until: new Date(Date.now() + settings.store.estimates.validDays * 86_400_000).toISOString().slice(0, 10),
          created_by: "shop",
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await tx.insertInto("estimate_events").values({ estimate_id: est.id, kind: "created", actor: "shop", detail: "From a quote request in the shop" }).execute();
      await tx.updateTable("carts").set({ status: "inquiry", email, name }).where("id", "=", cart.id).execute();
      return { estimateId: est.id, priced, name, phone, to: settings.store.alertEmails, sender: await salesSender(tx) };
    },
    database,
  );
  if (prep.to.length) {
    const mail = prep.sender ? inquiryAlertEmail(prep.sender, { name: prep.name, email, phone: prep.phone, message: input.message.trim(), items: prep.priced.lines, subtotalCents: prep.priced.subtotalCents, currency: prep.priced.currency, url: `${appUrl()}/sales/estimates/${prep.estimateId}` }) : { subject: "", html: "", text: "" };
    const delivery = await sendOne(prep.sender, { to: prep.to.join(","), replyTo: email, ...mail, kind: "quote-alert", ref: prep.estimateId }, `bison/quote/${prep.estimateId}`);
    await withTenant({ tenantId, userId: "public:inquiry" }, (tx) => tx.updateTable("estimates").set({ delivery: JSON.stringify({ ...delivery, alert: true }) }).where("id", "=", prep.estimateId).execute(), database);
  }
  return { estimateId: prep.estimateId };
}

// ---- Left-behind carts ---------------------------------------------------------------------------

/** Marks quiet carts with an email as left behind and, with Marketing, starts the "left a cart" series. */
export async function markAbandoned(tx: Tx, now = new Date()): Promise<number> {
  const settings = await getSalesSettings(tx);
  const before = new Date(now.getTime() - settings.store.abandonedAfterHours * 3_600_000);
  const rows = await tx
    .updateTable("carts")
    .set({ status: "abandoned", abandoned_at: now })
    .where("status", "in", ["open", "checkout"])
    .where("email", "is not", null)
    .where("last_active_at", "<", before)
    .returning(["id", "email", "name", "items"])
    .execute();
  const active = rows.filter((r) => cleanItems(r.items).length > 0);
  if (active.length && can({ access: await loadAccess(tx, now) }, "marketing.sequences")) {
    for (const r of active) if (r.email) await startSeries(tx, "cart", { email: r.email, name: r.name, subscriberId: null }, r.id);
  }
  for (const r of rows) await releaseHeldCode(tx, r.id);
  return rows.length;
}
