// Fit Funnels in Sales: the club sample catalog and data, promo code
// sentences, setup steps, status words, the demo store and Sales email, all in
// club words, with Bison Ops words left exactly as they were.
import { describe, expect, it } from "vitest";
import { salesLabels } from "@/components/sales/labels";
import { CART_STATUS, FULFILLMENT, SOURCE } from "@/components/sales/labels";
import { editionFor } from "@/config/editions";
import { defaultBrandKit } from "@/lib/email/schema";
import { parseProduct } from "@/lib/sales/catalog";
import { checkDiscount, checkWelcomeCode, discountSentence, parseDiscount, ruleFromInput } from "@/lib/sales/discounts";
import { estimateEmail, orderAlertEmail, type Sender, tradeLinkEmail } from "@/lib/sales/emails";
import { sendProblems } from "@/lib/sales/estimate-input";
import { buildSalesSetup, type SalesFacts } from "@/lib/sales/setup-steps";
import { demoCheckoutNote, demoItems, demoShop } from "@/lib/sales/shop-demo";
import { sampleCarts, sampleCatalog, sampleEstimates, sampleOrders, sampleSalesSummary, sampleTrade } from "@/lib/sample/sales";

const summit = { id: "33333333-3333-4333-8333-333333333333", name: "Summit Strength Club", industry: "gym" };
const pulse = { id: "44444444-4444-4444-8444-444444444444", name: "Pulse Cycle Studio", industry: "studio" };
const brightwater = { id: "11111111-1111-4111-8111-111111111111", name: "Brightwater Pools", industry: "pools" };
const now = new Date("2026-10-23T12:00:00Z");

const EM_DASH = "—";
/** Every string in a value, for checking words. */
const text = (v: unknown) => JSON.stringify(v);
const names = (t: typeof summit) => sampleCatalog(t).map((p) => p.name);
const ships = (t: typeof summit, sku: string) => sampleCatalog(t).some((p) => p.variants.some((v) => v.sku === sku && v.weightOz > 0));

describe("club sample catalog", () => {
  it("gives a gym memberships, class packs, personal training, a day pass and a little gear", () => {
    const c = sampleCatalog(summit);
    expect(names(summit)).toEqual(["Club membership", "Class pack", "Personal training", "Day pass", "Family add-on", "Club tee", "Shaker bottle", "Gym towel"]);
    expect(c.find((p) => p.slug === "club-membership")!.options).toEqual([{ name: "Plan", values: ["Monthly", "Annual", "Off-peak monthly"] }]);
    expect(c.find((p) => p.slug === "class-pack")!.options[0].values).toEqual(["5 classes", "10 classes", "20 classes"]);
    expect(c.find((p) => p.slug === "personal-training")!.variants).toHaveLength(4);
    expect(new Set(c.map((p) => p.category))).toEqual(new Set(["Memberships", "Class packs", "Personal training", "Passes", "Gear"]));
  });

  it("gives a cycling studio a first ride, 5, 10 and 20 class packs, unlimited monthly and gear", () => {
    const c = sampleCatalog(pulse);
    expect(names(pulse)).toEqual(["First ride", "Class pack", "Unlimited monthly", "Shoe rental", "Grip socks", "Studio tee"]);
    expect(c.find((p) => p.slug === "class-pack")!.options[0].values).toEqual(["5 classes", "10 classes", "20 classes"]);
  });

  it("only ships gear: memberships, packs and training have a flat shipping charge of 0", () => {
    for (const t of [summit, pulse]) {
      for (const p of sampleCatalog(t)) {
        for (const v of p.variants) {
          if (p.category === "Gear") expect(v.weightOz).toBeGreaterThan(0);
          else expect([v.weightOz, v.flatShipCents]).toEqual([0, 0]);
        }
        // Every one of them passes the editor's own check.
        expect(() => parseProduct({ ...p, status: "active", variants: p.variants }, "fit")).not.toThrow();
      }
    }
  });

  it("is the same every time, and different for each club", () => {
    expect(sampleOrders(summit, now)).toEqual(sampleOrders(summit, now));
    expect(sampleEstimates(pulse, now)).toEqual(sampleEstimates(pulse, now));
    expect(sampleTrade(summit, now)).toEqual(sampleTrade(summit, now));
    expect(sampleCarts(pulse, now)).toEqual(sampleCarts(pulse, now));
    expect(sampleSalesSummary(summit, now)).toEqual(sampleSalesSummary(summit, now));
    expect(text(sampleOrders(summit, now))).not.toEqual(text(sampleOrders(pulse, now)));
  });

  it("leaves Bison Ops samples alone", () => {
    expect(names(brightwater)[0]).toBe("Glow aggregate");
    expect(text(sampleOrders(brightwater, now))).not.toMatch(/membership|class pack/i);
  });
});

describe("club sample data", () => {
  it("sells memberships one at a time, and only ships purchases with gear", () => {
    const orders = sampleOrders(summit, now);
    expect(orders.length).toBeGreaterThan(50);
    for (const o of orders) {
      const gear = o.items.some((i) => ships(summit, i.sku));
      for (const i of o.items) if (!ships(summit, i.sku)) expect(i.qty).toBe(1);
      if (gear) expect(o.shippingCents).toBeGreaterThan(0);
      else expect([o.shippingCents, o.fulfillment, o.shippingService, o.shipTo]).toEqual([0, "none", "", {}]);
    }
    expect(orders.some((o) => o.items.some((i) => i.name === "Club membership"))).toBe(true);
    expect(orders.some((o) => o.tradeCompany)).toBe(true);
  });

  it("quotes corporate memberships, PT bundles and team rides", () => {
    const gym = sampleEstimates(summit, now).map((e) => e.title);
    expect(gym.some((t) => t.startsWith("Corporate memberships for "))).toBe(true);
    expect(gym.some((t) => t.startsWith("Personal training bundle for "))).toBe(true);
    expect(sampleEstimates(pulse, now).some((e) => e.title.startsWith("Team ride for "))).toBe(true);
    for (const e of sampleEstimates(summit, now)) expect(e.shippingCents).toBe(0);
  });

  it("has local companies with staff on corporate pricing, and unfinished joins", () => {
    const trade = sampleTrade(summit, now);
    expect(trade.map((t) => t.company)).toContain("Cascade Medical Group");
    expect(trade.every((t) => /^About \d+ staff$/.test(t.details.resale))).toBe(true);
    expect(trade.some((t) => t.status === "applied")).toBe(true);
    const carts = sampleCarts(pulse, now);
    expect(carts.length).toBeGreaterThan(5);
    expect(carts.some((c) => c.status === "abandoned")).toBe(true);
  });

  it("has no em dashes or pool and coffee words", () => {
    const all = text([sampleCatalog(summit), sampleCatalog(pulse), sampleOrders(summit, now), sampleEstimates(pulse, now), sampleTrade(summit, now)]);
    expect(all).not.toContain(EM_DASH);
    expect(all).not.toMatch(/\b(pool builder|glow|aggregate|resale certificate|roast)\b/i);
  });
});

describe("promo code sentences", () => {
  const rule = (input: Record<string, unknown>) => ruleFromInput(parseDiscount({ code: "summit10", kind: "percent", value: 10, ...input }));
  const ctx = { subtotalCents: 10000, email: "a@x.com", tradeAccountId: null, now, usesTotal: 0, usesByBuyer: 0 };

  it("read in club words for a Fit Funnels company", () => {
    expect(discountSentence(rule({ minOrderCents: 5000, usage: "per_account", expiresAt: "2026-12-31T20:00:00Z", maxUses: 100 }), "usd", "America/Los_Angeles", "fit")).toBe(
      "SUMMIT10 takes 10% off purchases of $50 or more. Each person can use it once. It works until Dec 31, 2026, and stops after 100 uses.",
    );
    expect(discountSentence(rule({ code: "FIRSTMONTH", kind: "amount", value: 2500 }), "usd", "America/Los_Angeles", "fit")).toBe("FIRSTMONTH takes $25 off any purchase. Anyone can use it, any number of times. It never expires.");
    expect(discountSentence(rule({ code: "MAKEGOOD", value: 100, usage: "single_use" }), "usd", "America/Los_Angeles", "fit")).toBe(
      "MAKEGOOD takes 100% off everything in the purchase, including shipping. It works once, for the first person who uses it. It never expires. When it covers a purchase in full, any gear in it ships free.",
    );
    expect(discountSentence({ ...rule({ code: "CASCADE15", value: 15 }), tradeAccountId: "00000000-0000-4000-8000-000000000003", tradeAccountName: null }, "usd", "America/Los_Angeles", "fit")).toMatch(/for one corporate account only\./);
  });

  it("read exactly as before for Bison Ops", () => {
    const r = rule({ code: "welcome10", minOrderCents: 5000, usage: "per_account", expiresAt: "2026-12-31T20:00:00Z", maxUses: 100 });
    const said = "WELCOME10 takes 10% off orders of $50 or more. Each customer can use it once. It works until Dec 31, 2026, and stops after 100 uses.";
    expect(discountSentence(r)).toBe(said);
    expect(discountSentence(r, "usd", "America/Los_Angeles", "bison")).toBe(said);
  });

  it("tells a club's members why a code didn't work", () => {
    expect(checkDiscount(rule({ minOrderCents: 15000 }), ctx, "usd", "America/Los_Angeles", "fit")).toMatchObject({ message: "Add $50.00 more to use that code. It's for purchases of $150 or more." });
    expect(checkDiscount({ ...rule({}), tradeAccountId: "00000000-0000-4000-8000-000000000003" }, ctx, "usd", "America/Los_Angeles", "fit")).toMatchObject({ message: "That code is for a corporate account. Sign in to your corporate account to use it." });
    expect(checkDiscount({ ...rule({}), tradeAccountId: "00000000-0000-4000-8000-000000000003" }, ctx)).toMatchObject({ message: "That code is for a trade account. Sign in to your trade account to use it." });
    const w = { code: "WELCOME-7KQ2FA", email: "a@x.com", kind: "percent" as const, value: 15, expiresAt: null, redeemedAt: null };
    expect(checkWelcomeCode(w, { subtotalCents: 10000, email: "a@x.com", now, paidOrdersForEmail: 1, heldElsewhere: false }, "usd", "fit")).toMatchObject({ message: "Intro offer codes are for a first purchase." });
  });
});

describe("Sales setup steps", () => {
  const facts: SalesFacts = {
    canManageSettings: true,
    payments: { serverReady: true, account: true, live: false, taxActive: false, taxOn: false },
    email: { verified: false },
    products: { total: 6, active: 5, missingWeight: 2, withoutPhotos: 5 },
    shipping: { fromSet: false, saved: false, source: "carrier", carrierConnected: false, fulfillmentOn: false, shipStationConnected: false },
    checkout: { alertsSaved: false, orders: 0 },
    estimates: { termsSet: false, sent: 0 },
    discounts: { count: 0 },
    trade: { saved: false, applications: 0, approved: 0 },
  };
  const bison = buildSalesSetup(facts);
  const fit = buildSalesSetup(facts, "fit");
  const step = (tools: typeof fit, key: string) => tools.flatMap((t) => t.steps).find((s) => s.key === key)!;

  it("name each tool the way the nav does", () => {
    expect(bison.map((t) => t.name)).toEqual(["Payments", "Products", "Shipping", "Checkout", "Estimates", "Discount codes", "Trade accounts"]);
    expect(fit.map((t) => t.name)).toEqual(["Payments", "Memberships", "Shipping", "Checkout", "Quotes", "Promo codes", "Corporate accounts"]);
    const nav = editionFor("fit").pageLabels;
    for (const t of fit) if (nav[t.href]) expect(t.name).toBe(nav[t.href]);
  });

  it("walk a club through Stripe, memberships and packs, checkout and a corporate quote", () => {
    expect(step(fit, "payments.connect").body).toContain("from Fit Funnels");
    expect(step(fit, "products.add")).toMatchObject({ title: "Add your memberships and packs", cta: "Add memberships" });
    expect(step(fit, "products.weights").body).toBe("2 active items have no weight or flat shipping charge. Only gear ships: give gear a weight and a box, and give memberships, packs and training a flat shipping charge of 0.");
    expect(step(fit, "checkout.first").cta).toBe("Open Purchases");
    expect(step(fit, "estimates.first")).toMatchObject({ title: "Send a corporate quote", cta: "New quote" });
    expect(step(fit, "discounts.first").title).toBe("Make a promo code");
    expect(step(fit, "trade.approve").title).toBe("Approve your first corporate account");
    const words = text(fit.flatMap((t) => [t.name, t.summary, ...t.steps.flatMap((x) => [x.title, x.body, x.cta, x.blockedNote ?? ""])]));
    // "ShipStation orders" is ShipStation's own word for what it packs.
    expect(words).not.toMatch(/Bison Ops|trade|estimate|\bshop\b|(?<!ShipStation )\borders?\b|products?\b/i);
    expect(words).not.toContain(EM_DASH);
  });

  it("keep the same steps, links and progress in both editions", () => {
    const shape = (tools: typeof fit) => tools.map((t) => [t.key, t.href, t.optional, t.steps.map((s) => [s.key, s.done, s.href, s.optional, Boolean(s.blockedNote)])]);
    expect(shape(fit)).toEqual(shape(bison));
  });

  it("read exactly as before for Bison Ops", () => {
    expect(step(bison, "products.add")).toMatchObject({ title: "Add or import your products", cta: "Add products" });
    expect(step(bison, "estimates.first").title).toBe("Send your first estimate");
    expect(step(bison, "payments.connect").body).toContain("from Bison Ops");
    expect(buildSalesSetup(facts, "bison")).toEqual(bison);
  });
});

describe("Sales words for a club", () => {
  it("label statuses in club words and leave Bison Ops labels alone", () => {
    expect(salesLabels("bison").CART_STATUS).toBe(CART_STATUS);
    expect(salesLabels("bison").SOURCE).toBe(SOURCE);
    const fit = salesLabels("fit");
    expect(fit.CART_STATUS.abandoned).toEqual({ label: "Didn't finish", tone: "warn" });
    expect(fit.FULFILLMENT.none.label).toBe("Nothing to ship");
    expect(fit.FULFILLMENT.shipped).toEqual(FULFILLMENT.shipped);
    expect(fit.SOURCE).toMatchObject({ checkout: "Online", estimate: "Quote" });
  });

  it("asks for the right email before a quote goes out", () => {
    const blank = { title: "", client: { name: "", email: "", company: "", phone: "", address: {} }, tradeAccountId: null, items: [], discount: {}, shippingCents: 0, notes: "", internalNote: "", validUntil: null };
    expect(sendProblems(blank)[0]).toBe("Add the client's email.");
    expect(sendProblems(blank, "fit")[0]).toBe("Add the email of the person you're quoting.");
  });

  it("gives the demo store the club's own accent and club items", () => {
    const shop = demoShop("summitstrengthclub")!;
    expect(shop).toMatchObject({ edition: "fit", accent: editionFor("fit").defaultAccent });
    expect(demoShop("brightwaterpools")).toMatchObject({ edition: "bison", accent: "#3b5bff" });
    expect(demoItems(shop).map((i) => i.name)).toContain("Club membership");
    expect(demoItems(demoShop("pulsecyclestudio")!).map((i) => i.name)).toContain("Unlimited monthly");
    expect(demoCheckoutNote("fit")).toContain("your club's online store");
    expect(demoCheckoutNote("bison")).toBe("This is a demo, so checkout stops here. In your own shop, this is where Stripe takes the payment.");
  });

  it("writes Sales email in club words", () => {
    const sender = (edition: "bison" | "fit"): Sender => ({ from: "Summit <hi@example.com>", brand: defaultBrandKit("Summit Strength Club", "#f76b15", "summitstrengthclub.com", edition), tenantName: "Summit Strength Club", tenantId: summit.id, edition });
    const est = { number: 104, title: "Corporate memberships for Cascade Medical Group", clientName: "Ruth Ito", totalCents: 1_500_000, currency: "usd", validUntil: "2026-11-30", url: "https://x.example/e/t", message: "", resend: false };
    expect(estimateEmail(sender("fit"), est).subject).toBe("Your quote from Summit Strength Club: Corporate memberships for Cascade Medical Group");
    expect(estimateEmail(sender("fit"), est).text).toContain("View the quote");
    expect(estimateEmail(sender("bison"), est).subject).toBe("Your estimate from Summit Strength Club: Corporate memberships for Cascade Medical Group");
    expect(tradeLinkEmail(sender("fit"), { company: "Cascade Medical Group", name: "Ruth Ito", url: "https://x.example/t", approved: true }).subject).toBe("Your corporate account with Summit Strength Club is approved");
    const order = { number: 1042, name: "Ruth Ito", email: "ruth@example.com", phone: "", items: [{ name: "Club membership", variant: "Monthly", qty: 1, lineCents: 8900 }], subtotalCents: 8900, discountCents: 0, discountCode: "", shippingCents: 0, shippingService: "", taxCents: 0, totalCents: 8900, currency: "usd", shipTo: {}, orderUrl: "https://x.example/o", paymentUrl: null, trade: null };
    const fitAlert = orderAlertEmail(sender("fit"), order);
    expect(fitAlert.subject).toBe("New purchase #1042, $89.00");
    expect(fitAlert.text).toContain("Nothing to ship.");
    expect(orderAlertEmail(sender("bison"), order).subject).toBe("New order #1042, $89.00");
    expect(orderAlertEmail(sender("bison"), order).text).toContain("No address given");
    expect(text([fitAlert, estimateEmail(sender("fit"), est)])).not.toContain(EM_DASH);
  });
});
