// Sales in the database, as the real app role, with the offline stand-ins for
// Stripe, ShipStation and email: the catalog, carts and codes, checkout through
// to a paid order and fulfillment, estimates through to a paid invoice, trade
// pricing, refunds and the sales job.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@/lib/db";
import { clearOutbox, readOutbox } from "@/lib/email/provider";
import { NO_SENDING, writeSending } from "@/lib/marketing/sending";
import { getMarketingSettings, saveMarketingPart, tenantInfo } from "@/lib/marketing/store";
import { standInFulfillments } from "@/lib/sales/carriers";
import { parseProduct } from "@/lib/sales/catalog";
import { CheckoutError, placeFreeOrder, quoteCheckout, sendInquiry, shopTenant, startCheckout, updateCart } from "@/lib/sales/checkout";
import { handleConnectEvent, onboardingUrl, refreshPayments } from "@/lib/sales/connect";
import { parseDiscount } from "@/lib/sales/discounts";
import { saveDiscount } from "@/lib/sales/discount-codes";
import { parseEstimate } from "@/lib/sales/estimate-input";
import { clientReply, clientView, createEstimate, getEstimate, markEstimatePaid, resolveEstimateLink, sendEstimate, voidEstimate } from "@/lib/sales/estimates";
import { runSalesWork } from "@/lib/sales/job";
import { getOrder, refundOrder } from "@/lib/sales/orders";
import { paymentsProvider, standInOnboard, standInPay, standInPayInvoice, standInStore } from "@/lib/sales/payments";
import { getProduct, ProductError, saveProduct } from "@/lib/sales/products";
import { DEFAULT_BOXES, shippingSettingsSchema } from "@/lib/sales/settings";
import { getSalesSettings, saveSalesPart, writeCarrier } from "@/lib/sales/store";
import { applyForTrade, checkTradeToken, decideTrade, tradeBuyer, tradeLinkUrl } from "@/lib/sales/trade";
import { createTenant } from "@/lib/tenants";
import { app, B } from "./helpers";

const T = randomUUID();
let SLUG = "";
const scope = { tenantId: T, userId: "test_owner" };
const tx = <R>(fn: Parameters<typeof withTenant<R>>[1]) => withTenant(scope, fn, app());
const ADDRESS = { name: "Mara Quinn", company: "", phone: "", line1: "12 Cove Rd", line2: "", city: "Tampa", state: "FL", postal: "33606", country: "US" };

let bagSmall = "";
let bagLarge = "";
let kit = "";

beforeAll(async () => {
  await createTenant({ id: T, name: `Harbor Supply ${T.slice(0, 6)}`, domain: "harborsupply.com", sampleData: false, owner: { userId: "test_owner", email: "owner@harborsupply.com", name: "Hal Owner" } }, app());
  await tx(async (t) => {
    SLUG = (await t.selectFrom("tenants").select("slug").executeTakeFirstOrThrow()).slug;
    await t.insertInto("entitlements").values({ item_key: "module:sales", source: "grant", stripe_subscription_item_id: null, ends_at: null, note: "test" }).execute();
    const ms = await getMarketingSettings(t, await tenantInfo(t));
    await saveMarketingPart(t, "brand", { ...ms.brand, address: "1 Dock St, Tampa, FL" });
    await writeSending(t, { ...NO_SENDING, domain: "mail.harborsupply.com", domainId: "standin-domain-h", status: "verified", verifiedAt: new Date().toISOString() });
    const s = await getSalesSettings(t);
    await saveSalesPart(t, "shipping", shippingSettingsSchema.parse({ ...s.shipping, from: { ...ADDRESS, name: "Harbor Supply", line1: "1 Dock St", postal: "33602" }, source: "carrier", carrier: "shipstation", boxes: DEFAULT_BOXES, fulfillment: "shipstation", handlingCents: 100 }));
    await writeCarrier(t, T, "shipstation", { secret: "ss-test-key", config: { carrierIds: ["se-standin"], detail: "Stand-in" }, connected: true, error: null });
    const id1 = await saveProduct(
      t,
      parseProduct({
        name: "Glow aggregate",
        status: "active",
        options: [{ name: "Size", values: ["25 lb", "50 lb"] }],
        variants: [
          { options: { Size: "25 lb" }, sku: "GA-25", priceCents: 8900, weightOz: 400, box: "medium" },
          { options: { Size: "50 lb" }, sku: "GA-50", priceCents: 16500, weightOz: 800, box: "large" },
        ],
      }),
    );
    const id2 = await saveProduct(t, parseProduct({ name: "Sample kit", status: "active", variants: [{ sku: "KIT", priceCents: 1900, weightOz: 24, box: "small", unitsPerBox: 4 }] }));
    const p1 = await getProduct(t, id1);
    const p2 = await getProduct(t, id2);
    bagSmall = p1!.variants[0].id;
    bagLarge = p1!.variants[1].id;
    kit = p2!.variants[0].id;
  });
  clearOutbox();
});

afterAll(async () => {
  await app().destroy();
});

describe("the catalog", () => {
  it("keeps slugs and SKUs unique", async () => {
    const again = await tx((t) => saveProduct(t, parseProduct({ name: "Glow aggregate", variants: [{ priceCents: 100 }] })));
    expect((await tx((t) => getProduct(t, again)))?.slug).toBe("glow-aggregate-2");
    await expect(tx((t) => saveProduct(t, parseProduct({ name: "Copycat", variants: [{ sku: "ga-25", priceCents: 100 }] })))).rejects.toThrow(ProductError);
  });

  it("only finds shops that have Sales", async () => {
    expect(await shopTenant(SLUG, app())).toBe(T);
    expect(await shopTenant("brightwater-pools", app())).toBeNull();
  });
});

describe("connecting Stripe", () => {
  it("makes an account, sends the company through onboarding and reads its status", async () => {
    const url = await onboardingUrl(scope, { email: "owner@harborsupply.com", businessName: "Harbor Supply", website: null }, app());
    expect(url).toContain("/api/dev/payments/onboard?account=acct_standin_");
    let conn = await refreshPayments(T, app());
    expect(conn).toMatchObject({ chargesEnabled: false, status: "pending" });
    standInOnboard(conn.accountId!, { tax: true });
    conn = await refreshPayments(T, app());
    expect(conn).toMatchObject({ chargesEnabled: true, status: "active", tax: "active" });
    // A second click reuses the same account.
    await onboardingUrl(scope, { email: "owner@harborsupply.com", businessName: "Harbor Supply", website: null }, app());
    expect((await refreshPayments(T, app())).accountId).toBe(conn.accountId);
  });
});

describe("checkout", () => {
  it("prices a cart, quotes live shipping, takes payment and records the order", async () => {
    let cart = await updateCart(T, null, { op: "add", variantId: bagSmall, qty: 2 }, { tradeAccountId: null }, app());
    cart = await updateCart(T, cart.cartId, { op: "add", variantId: kit, qty: 1 }, { tradeAccountId: null }, app());
    expect(cart).toMatchObject({ itemCount: 3, subtotalCents: 8900 * 2 + 1900 });

    const start = await startCheckout(T, SLUG, cart.cartId, { email: "Mara@Example.com", name: "Mara Quinn" }, { tradeAccountId: null }, app());
    expect(start.kind).toBe("stand-in");
    if (start.kind !== "stand-in") return;

    expect(await quoteCheckout(T, start.sessionId, { ...ADDRESS, postal: "" }, app())).toMatchObject({ ok: false, message: "Enter a full shipping address." });
    const q = await quoteCheckout(T, start.sessionId, ADDRESS, app());
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.options.map((o) => o.label)).toEqual(["Stand-in Post Ground", "Stand-in Post 2-Day", "Stand-in Post Overnight"]);

    const accountId = standInStore().checkouts.get(start.sessionId)!.accountId;
    standInPay(start.sessionId, q.options[1].id, "555-0100");
    clearOutbox();
    const r = await handleConnectEvent({ id: `evt_${randomUUID()}`, type: "checkout.session.completed", account: accountId, objectId: start.sessionId }, app());
    expect(r.followUp?.kind).toBe("order");
    // Delivered twice: still one order.
    const again = await handleConnectEvent({ id: `evt_${randomUUID()}`, type: "checkout.session.completed", account: accountId, objectId: start.sessionId }, app());
    expect(again.followUp).toBeUndefined();

    const { afterOrderPaid } = await import("@/lib/sales/orders");
    await afterOrderPaid(T, r.followUp!.orderId, app());
    const order = await tx((t) => getOrder(t, r.followUp!.orderId));
    expect(order).toMatchObject({ number: 1001, email: "mara@example.com", status: "paid", fulfillment: "sent", subtotalCents: 19700, shippingCents: q.options[1].amountCents, shippingService: q.options[1].label });
    expect(order!.items.map((i) => [i.sku, i.qty])).toEqual([
      ["GA-25", 2],
      ["KIT", 1],
    ]);
    expect(order!.alert).toMatchObject({ to: ["owner@harborsupply.com"] });
    expect(order!.alert.providerId).toBeTruthy();
    expect(readOutbox().find((m) => m.to === "owner@harborsupply.com")?.subject).toMatch(/^New order #1001/);
    expect(standInFulfillments().find((f) => f.orderId === order!.id)).toMatchObject({ number: 1001, shippingService: q.options[1].label });

    const cartRow = await tx((t) => t.selectFrom("carts").select(["status", "order_id"]).where("id", "=", cart.cartId).executeTakeFirstOrThrow());
    expect(cartRow).toEqual({ status: "ordered", order_id: order!.id });
    const contact = await tx((t) => t.selectFrom("contacts").select(["status", "phone"]).where("email", "=", "mara@example.com").executeTakeFirstOrThrow());
    expect(contact.status).toBe("won");
  });

  it("refunds part of an order through Stripe", async () => {
    const id = (await tx((t) => t.selectFrom("orders").select("id").where("number", "=", 1001).executeTakeFirstOrThrow())).id;
    expect(await refundOrder(T, id, 10_000_000, "test_owner", app())).toMatchObject({ ok: false });
    expect(await refundOrder(T, id, 1500, "test_owner", app())).toMatchObject({ ok: true });
    expect(await tx((t) => getOrder(t, id))).toMatchObject({ status: "partially_refunded", refundedCents: 1500 });
  });

  it("holds a single-use code during checkout so two people can't both spend it", async () => {
    await tx((t) => saveDiscount(t, parseDiscount({ code: "ONCE20", kind: "percent", value: 20, usage: "single_use" }), null, "test_owner"));
    const a = await updateCart(T, null, { op: "add", variantId: kit, qty: 2 }, { tradeAccountId: null }, app());
    const withCode = await updateCart(T, a.cartId, { op: "code", code: "once20" }, { tradeAccountId: null }, app());
    expect(withCode.discount).toMatchObject({ code: "ONCE20", amountCents: 760 });
    const startA = await startCheckout(T, SLUG, a.cartId, { email: "a@example.com", name: "" }, { tradeAccountId: null }, app());

    const b = await updateCart(T, null, { op: "add", variantId: kit, qty: 1 }, { tradeAccountId: null }, app());
    const bCode = await updateCart(T, b.cartId, { op: "code", code: "ONCE20" }, { tradeAccountId: null }, app());
    expect(bCode).toMatchObject({ discount: null, discountError: "That code has already been used." });
    await expect(startCheckout(T, SLUG, b.cartId, { email: "b@example.com", name: "" }, { tradeAccountId: null }, app())).rejects.toThrow("That code has already been used.");

    // A's checkout runs out of time: the code is free again.
    const sessionA = startA.kind === "stand-in" ? startA.sessionId : "";
    const accountId = standInStore().checkouts.get(sessionA)!.accountId;
    await handleConnectEvent({ id: `evt_${randomUUID()}`, type: "checkout.session.expired", account: accountId, objectId: sessionA }, app());
    expect((await updateCart(T, b.cartId, { op: "view" }, { tradeAccountId: null }, app())).discount).toMatchObject({ code: "ONCE20" });
  });

  it("ships free and skips payment when a code covers everything", async () => {
    await tx((t) => saveDiscount(t, parseDiscount({ code: "ONTHEHOUSE", kind: "percent", value: 100, usage: "per_account" }), null, "test_owner"));
    const c = await updateCart(T, null, { op: "add", variantId: kit, qty: 1 }, { tradeAccountId: null }, app());
    await updateCart(T, c.cartId, { op: "code", code: "ONTHEHOUSE" }, { tradeAccountId: null }, app());
    const start = await startCheckout(T, SLUG, c.cartId, { email: "free@example.com", name: "Fran" }, { tradeAccountId: null }, app());
    expect(start.kind).toBe("free");
    const r = await placeFreeOrder(T, c.cartId, { email: "free@example.com", name: "Fran", phone: "", address: ADDRESS }, { tradeAccountId: null }, app());
    expect(await tx((t) => getOrder(t, r.orderId))).toMatchObject({ source: "free", totalCents: 0, discountCode: "ONTHEHOUSE", shippingService: "Free shipping" });
    // Once per customer.
    const d = await updateCart(T, null, { op: "add", variantId: kit, qty: 1 }, { tradeAccountId: null }, app());
    await updateCart(T, d.cartId, { op: "code", code: "ONTHEHOUSE" }, { tradeAccountId: null }, app());
    await expect(startCheckout(T, SLUG, d.cartId, { email: "free@example.com", name: "Fran" }, { tradeAccountId: null }, app())).rejects.toThrow("You've already used that code.");
  });

  it("turns a cart over the order limit into a quote request and a draft estimate", async () => {
    await tx(async (t) => {
      const s = await getSalesSettings(t);
      await saveSalesPart(t, "store", { ...s.store, inquiry: { on: true, overCents: 100_000, overQuantity: null, message: "" } });
    });
    const c = await updateCart(T, null, { op: "add", variantId: bagLarge, qty: 8 }, { tradeAccountId: null }, app());
    expect(c.inquiry).toBe(true);
    expect((await startCheckout(T, SLUG, c.cartId, { email: "builder@example.com", name: "Bo" }, { tradeAccountId: null }, app())).kind).toBe("inquiry");
    clearOutbox();
    const r = await sendInquiry(T, c.cartId, { email: "builder@example.com", name: "Bo Builder", phone: "555", message: "Need these by May." }, { tradeAccountId: null }, app());
    const est = await tx((t) => getEstimate(t, r.estimateId));
    expect(est).toMatchObject({ status: "draft", source: "inquiry", totalCents: 132000, client: { email: "builder@example.com", name: "Bo Builder" } });
    expect(readOutbox()[0]).toMatchObject({ to: "owner@harborsupply.com", replyTo: "builder@example.com" });
    await expect(sendInquiry(T, c.cartId, { email: "builder@example.com", name: "Bo", phone: "", message: "" }, { tradeAccountId: null }, app())).rejects.toThrow(CheckoutError);
    await tx(async (t) => {
      const s = await getSalesSettings(t);
      await saveSalesPart(t, "store", { ...s.store, inquiry: { ...s.store.inquiry, on: false } });
    });
  });
});

describe("estimates", () => {
  it("go out, get approved by the client, become an invoice, and become an order when paid", async () => {
    const input = parseEstimate({ title: "Resurface", client: { name: "Dee Client", email: "dee@example.com", company: "Dee Pools", address: { line1: "9 Bay St", city: "Tampa", state: "FL", postal: "33606", country: "US" } }, items: [{ id: "a", name: "Glow aggregate, 50 lb", qty: 4, unitCents: 16500, variantId: bagLarge }, { id: "b", name: "Labor", qty: 6.5, unitCents: 9500 }], discount: { kind: "percent", value: 10 }, shippingCents: 4000 });
    const { id, number } = await tx((t) => createEstimate(t, input, "test_owner"));
    expect(number).toBe(102);
    clearOutbox();
    const sent = await sendEstimate(T, id, { message: "", actor: "test_owner", actorEmail: "owner@harborsupply.com" }, app());
    expect(sent.ok).toBe(true);
    const mail = readOutbox().find((m) => m.to === "dee@example.com")!;
    expect(mail.replyTo).toBe("owner@harborsupply.com");
    const link = /href="(https?:\/\/[^"]+\/e\/[^"]+)"/.exec(mail.html)![1];
    const token = decodeURIComponent(new URL(link).pathname.split("/e/")[1]);

    const resolved = await resolveEstimateLink(token, app());
    expect(resolved).toEqual({ tenantId: T, estimateId: id });
    expect(await resolveEstimateLink(`${token.slice(0, -3)}abc`, app())).toBeNull();
    const view = await clientView(T, id, app());
    expect(view?.estimate).toMatchObject({ status: "viewed", internalNote: "", totalCents: 66000 + 61750 - 12775 + 4000 });

    expect(await clientReply(T, id, { kind: "approve", name: "D", seen: new Date().toISOString() }, app())).toMatchObject({ ok: false, message: "Type your full name to approve." });
    expect(await clientReply(T, id, { kind: "approve", name: "Dee Client", seen: new Date(0).toISOString() }, app())).toMatchObject({ ok: false });
    const approved = await clientReply(T, id, { kind: "approve", name: "Dee Client", seen: new Date().toISOString() }, app());
    expect(approved).toMatchObject({ ok: true });
    expect(approved.invoiceUrl).toContain("/api/dev/payments/invoice?id=");

    const est = await tx((t) => getEstimate(t, id));
    expect(est).toMatchObject({ status: "invoiced", approvedName: "Dee Client" });
    const invoiceId = new URL(approved.invoiceUrl!).searchParams.get("id")!;
    const inv = standInPayInvoice(invoiceId);
    await handleConnectEvent({ id: `evt_${randomUUID()}`, type: "invoice.paid", account: inv.accountId, objectId: invoiceId }, app());
    const paid = await tx((t) => getEstimate(t, id));
    expect(paid?.status).toBe("paid");
    expect(await tx((t) => getOrder(t, paid!.orderId!))).toMatchObject({ source: "estimate", estimate: { id, number: 102 }, totalCents: est!.totalCents });
    expect(paid!.events.map((e) => e.kind)).toEqual(["created", "sent", "viewed", "approved", "invoiced", "paid"]);
  });

  it("can be marked paid by hand, and voiding retires the link", async () => {
    const input = parseEstimate({ client: { name: "Cash Buyer", email: "cash@example.com" }, items: [{ id: "a", name: "Sample kit", qty: 1, unitCents: 1900 }] });
    const e1 = await tx((t) => createEstimate(t, input, "test_owner"));
    await sendEstimate(T, e1.id, { message: "", actor: "test_owner", actorEmail: "owner@harborsupply.com" }, app());
    expect(await markEstimatePaid(T, e1.id, "test_owner", "Check #1042", app())).toMatchObject({ ok: true });
    expect((await tx((t) => getEstimate(t, e1.id)))?.events.at(-1)).toMatchObject({ kind: "paid", detail: "Paid outside Stripe: Check #1042" });

    const e2 = await tx((t) => createEstimate(t, input, "test_owner"));
    clearOutbox();
    await sendEstimate(T, e2.id, { message: "", actor: "test_owner", actorEmail: "owner@harborsupply.com" }, app());
    const token = decodeURIComponent(/\/e\/([^"]+)"/.exec(readOutbox()[0].html)![1]);
    expect(await resolveEstimateLink(token, app())).not.toBeNull();
    expect(await voidEstimate(T, e2.id, "test_owner", app())).toMatchObject({ ok: true });
    expect(await resolveEstimateLink(token, app())).toBeNull();
  });

  it("only drafts can be deleted, even by a direct query", async () => {
    const sentId = (await tx((t) => t.selectFrom("estimates").select("id").where("status", "=", "paid").executeTakeFirstOrThrow())).id;
    await expect(tx((t) => t.deleteFrom("estimates").where("id", "=", sentId).execute())).rejects.toThrow(/Only draft estimates/);
  });
});

describe("trade accounts", () => {
  it("apply, get approved, sign in by link, and buy at tier prices", async () => {
    const a = await tx((t) => applyForTrade(t, { company: "Gulf Pools", name: "Gil", email: "gil@gulfpools.com", phone: "", website: "", details: { type: "Pool builder" } }));
    expect(a).toMatchObject({ created: true, status: "applied" });
    const settings = await tx((t) => getSalesSettings(t));
    expect(await tx((t) => tradeBuyer(t, a.id, settings.trade.tiers))).toBeNull();
    const decided = await tx((t) => decideTrade(t, a.id, "approved", "test_owner"));
    const buyer = await tx((t) => tradeBuyer(t, a.id, settings.trade.tiers));
    expect(buyer?.tier).toMatchObject({ key: "trade", percentOff: 10 });

    const url = tradeLinkUrl(SLUG, a.id, decided!.version);
    const token = new URL(url).searchParams.get("t")!;
    expect(await tx((t) => checkTradeToken(t, "link", token))).toEqual({ id: a.id, version: 1 });
    expect(await tx((t) => checkTradeToken(t, "session", token))).toBeNull();

    const cart = await updateCart(T, null, { op: "add", variantId: bagSmall, qty: 1 }, { tradeAccountId: a.id }, app());
    expect(cart).toMatchObject({ subtotalCents: 8010, trade: { name: "Trade", percentOff: 10 } });

    // Pausing signs them out everywhere.
    await tx((t) => decideTrade(t, a.id, "paused", "test_owner"));
    expect(await tx((t) => checkTradeToken(t, "link", token))).toBeNull();
    expect((await updateCart(T, cart.cartId, { op: "view" }, { tradeAccountId: a.id }, app())).trade).toBeNull();
  });
});

describe("the sales job", () => {
  it("marks quiet carts with an email as left behind", async () => {
    const c = await updateCart(T, null, { op: "add", variantId: kit, qty: 1 }, { tradeAccountId: null }, app());
    await updateCart(T, c.cartId, { op: "email", email: "quiet@example.com" }, { tradeAccountId: null }, app());
    const later = new Date(Date.now() + 5 * 3_600_000);
    const r = await runSalesWork({ tenantId: T, database: app(), now: later });
    expect(r.abandoned).toBeGreaterThanOrEqual(1);
    const row = await tx((t) => t.selectFrom("carts").select("status").where("id", "=", c.cartId).executeTakeFirstOrThrow());
    expect(row.status).toBe("abandoned");
    // Coming back to it opens it again.
    expect((await updateCart(T, c.cartId, { op: "add", variantId: kit, qty: 1 }, { tradeAccountId: null }, app())).status).toBe("open");
  });

  it("keeps other companies out", async () => {
    const theirs = await withTenant({ tenantId: B, userId: "x" }, (t) => t.selectFrom("orders").select("id").where("email", "=", "mara@example.com").execute(), app());
    expect(theirs).toEqual([]);
  });

  it("uses the stand-in provider in tests", () => {
    expect(paymentsProvider()?.name).toBe("stand-in");
  });
});
