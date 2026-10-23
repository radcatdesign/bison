// Sales rules that don't need a database: money, the catalog, packing,
// shipping options, discount codes and cart pricing.
import { describe, expect, it } from "vitest";
import { expandVariants, parseProduct, ProductInputError, slugify, variantLabel } from "@/lib/sales/catalog";
import { checkDiscount, checkWelcomeCode, discountSentence, parseDiscount, ruleFromInput } from "@/lib/sales/discounts";
import { formatMoney, parseMoney, percentOf } from "@/lib/sales/money";
import { pack, type PackLine } from "@/lib/sales/packing";
import { cleanItems, estimateTotals, priceCart, type VariantForPricing } from "@/lib/sales/pricing";
import { DEFAULT_BOXES, nextTier, shippingSettingsSchema, storeSettingsSchema, tierFor, tradeSettingsSchema } from "@/lib/sales/settings";
import { shippingOptions } from "@/lib/sales/shipping";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("money", () => {
  it("formats and reads amounts", () => {
    expect(formatMoney(124050)).toBe("$1,240.50");
    expect(formatMoney(5000, "usd", { trim: true })).toBe("$50");
    expect(formatMoney(500, "jpy")).toBe("¥500");
    expect(parseMoney("$1,240.50")).toBe(124050);
    expect(parseMoney("12")).toBe(1200);
    expect(parseMoney("-3")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(percentOf(999, 10)).toBe(100);
  });
});

describe("catalog", () => {
  const base = { name: "Glow aggregate", variants: [{ priceCents: 8900 }] };

  it("makes slugs people can read", () => {
    expect(slugify("Glow Aggregate & Mosaics, 50 lb!")).toBe("glow-aggregate-and-mosaics-50-lb");
    expect(slugify("Café crème")).toBe("cafe-creme");
    expect(slugify("!!!")).toBe("product");
  });

  it("expands options into versions and keeps prices already set", () => {
    const options = [
      { name: "Color", values: ["Aqua", "Blue"] },
      { name: "Size", values: ["25 lb", "50 lb"] },
    ];
    const first = expandVariants(options, [], { priceCents: 8900 });
    expect(first).toHaveLength(4);
    first[3].priceCents = 16500;
    const again = expandVariants([...options.slice(0, 1).map((o) => ({ ...o, values: [...o.values, "Green"] })), options[1]], first);
    expect(again).toHaveLength(6);
    expect(again.find((v) => v.options.Color === "Blue" && v.options.Size === "50 lb")?.priceCents).toBe(16500);
    expect(variantLabel({ Color: "Blue", Size: "50 lb" }, options)).toBe("Blue / 50 lb");
  });

  it("refuses products that don't add up", () => {
    expect(() => parseProduct({ ...base, variants: [] })).toThrow(ProductInputError);
    expect(() => parseProduct({ ...base, variants: [{ priceCents: 100 }, { priceCents: 200 }] })).toThrow(/Add an option/);
    expect(() => parseProduct({ ...base, variants: [{ priceCents: 8900, compareAtCents: 8000 }] })).toThrow(/was price/);
    expect(() => parseProduct({ ...base, options: [{ name: "Size", values: ["S", "s"] }], variants: [{ options: { Size: "S" }, priceCents: 1 }] })).toThrow(/once/);
    expect(() => parseProduct({ ...base, photos: [{ src: "javascript:alert(1)" }] })).toThrow(/photo/);
    expect(parseProduct({ ...base, options: [{ name: "Size", values: ["S", "M"] }], variants: [{ options: { Size: "S" }, priceCents: 1 }, { options: { Size: "M" }, priceCents: 2 }] }).variants).toHaveLength(2);
  });
});

describe("packing", () => {
  const line = (p: Partial<PackLine>): PackLine => ({ variantId: id(1), name: "Bag", qty: 1, weightOz: 400, box: "medium", unitsPerBox: 2, shipsAlone: false, flatShipCents: null, ...p });

  it("fills boxes by count and by weight", () => {
    const r = pack([line({ qty: 5, weightOz: 200 })], DEFAULT_BOXES);
    expect(r.packages).toHaveLength(3);
    expect(r.packages[0]).toMatchObject({ boxKey: "medium", weightOz: 412 });
    expect(r.packages[2].items).toEqual([{ variantId: id(1), qty: 1 }]);
  });

  it("starts a new box when the weight limit is reached", () => {
    // Two 25 lb bags would overflow a 30 lb box, so each gets its own.
    expect(pack([line({ qty: 2 })], DEFAULT_BOXES).packages).toHaveLength(2);
    // Medium holds 30 lb; 4 units of 10 lb with 10 per box still need two boxes.
    const r = pack([line({ qty: 4, weightOz: 160, unitsPerBox: 10 })], DEFAULT_BOXES);
    expect(r.packages.map((p) => p.items[0].qty)).toEqual([2, 2]);
  });

  it("ships some items alone and charges flat-rate items on their own", () => {
    const r = pack([line({ variantId: id(1), qty: 2, shipsAlone: true, box: "" }), line({ variantId: id(2), name: "Pallet", qty: 1, flatShipCents: 32500 })], DEFAULT_BOXES);
    expect(r.packages).toHaveLength(2);
    expect(r.packages[0].dims).toBeNull();
    expect(r.flatCents).toBe(32500);
  });

  it("shares mixed items in a box and warns about missing weights", () => {
    const r = pack([line({ variantId: id(1), qty: 1, unitsPerBox: 2 }), line({ variantId: id(2), name: "Tiles", qty: 1, unitsPerBox: 2, weightOz: 0 })], DEFAULT_BOXES);
    expect(r.packages).toHaveLength(1);
    expect(r.packages[0].items).toHaveLength(2);
    expect(r.warnings[0]).toMatch(/Tiles has no weight/);
  });

  it("falls back to the biggest box when a box was deleted", () => {
    const r = pack([line({ box: "gone" })], DEFAULT_BOXES);
    expect(r.packages[0].boxKey).toBe("large");
    expect(r.warnings.join(" ")).toMatch(/no longer exists/);
  });

  it("refuses carts too big to pack one at a time", () => {
    expect(() => pack([line({ qty: 2000 })], DEFAULT_BOXES)).toThrow(/more than 1000/);
  });
});

describe("shipping options", () => {
  const packed = pack([{ variantId: id(1), name: "Bag", qty: 1, weightOz: 400, box: "medium", unitsPerBox: 1, shipsAlone: false, flatShipCents: null }], DEFAULT_BOXES);
  const rates = [
    { code: "03", service: "UPS Ground", carrier: "UPS", amountCents: 1840, days: null },
    { code: "02", service: "UPS 2nd Day Air", carrier: "UPS", amountCents: 3910, days: 2 },
    { code: "01", service: "UPS Next Day Air", carrier: "UPS", amountCents: 7200, days: 1 },
  ];
  const settings = shippingSettingsSchema.parse({ source: "carrier", carrier: "ups", handlingCents: 200, maxOptions: 2 });

  it("offers the cheapest carrier options with handling added", () => {
    const r = shippingOptions({ settings, pack: packed, itemCount: 1, merchandiseCents: 8900, codeFreeShipping: false, rates, currency: "usd" });
    expect(r).toEqual({
      ok: true,
      options: [
        { id: "03", label: "UPS Ground", amountCents: 2040, days: null },
        { id: "02", label: "UPS 2nd Day Air", amountCents: 4110, days: 2 },
      ],
    });
  });

  it("ships free over the threshold or when a code covers everything", () => {
    const over = shippingSettingsSchema.parse({ ...settings, freeOverCents: 5000 });
    expect(shippingOptions({ settings: over, pack: packed, itemCount: 1, merchandiseCents: 8900, codeFreeShipping: false, rates, currency: "usd" })).toMatchObject({ options: [{ id: "free", amountCents: 0 }] });
    expect(shippingOptions({ settings, pack: packed, itemCount: 1, merchandiseCents: 0, codeFreeShipping: true, rates: null, currency: "usd" })).toMatchObject({ options: [{ id: "free" }] });
  });

  it("charges flat rates per order and per item", () => {
    const flat = shippingSettingsSchema.parse({ source: "flat", flat: { perOrderCents: 500, perItemCents: 100, label: "Standard" } });
    expect(shippingOptions({ settings: flat, pack: packed, itemCount: 3, merchandiseCents: 1, codeFreeShipping: false, rates: null, currency: "usd" })).toMatchObject({ options: [{ label: "Standard", amountCents: 800 }] });
  });

  it("says plainly when there's no rate", () => {
    expect(shippingOptions({ settings, pack: packed, itemCount: 1, merchandiseCents: 1, codeFreeShipping: false, rates: null, currency: "usd" })).toMatchObject({ ok: false });
  });
});

describe("discount codes", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const rule = (input: Record<string, unknown>) => ruleFromInput(parseDiscount({ code: "welcome10", kind: "percent", value: 10, ...input }));
  const ctx = { subtotalCents: 10000, email: "a@x.com", tradeAccountId: null, now, usesTotal: 0, usesByBuyer: 0 };

  it("spells out the rule in one plain sentence", () => {
    expect(discountSentence(rule({ minOrderCents: 5000, usage: "per_account", expiresAt: "2026-12-31T20:00:00Z", maxUses: 100 }))).toBe(
      "WELCOME10 takes 10% off orders of $50 or more. Each customer can use it once. It works until Dec 31, 2026, and stops after 100 uses.",
    );
    expect(discountSentence(rule({ code: "SPRING25", kind: "amount", value: 2500 }))).toBe("SPRING25 takes $25 off any order. Anyone can use it, any number of times. It never expires.");
    expect(discountSentence(rule({ code: "FREEBIE", value: 100, usage: "single_use" }))).toMatch(/^FREEBIE takes 100% off everything in the order, including shipping\. It works once, for the first person who uses it\. It never expires\. Orders it covers in full ship free\.$/);
    expect(discountSentence({ ...rule({ code: "ACME15", value: 15 }), tradeAccountId: id(3), tradeAccountName: "Acme Builders" })).toMatch(/for Acme Builders only\. They can use it any number of times/);
  });

  it("checks every limit with a message the shopper understands", () => {
    expect(checkDiscount(rule({}), ctx)).toEqual({ ok: true, amountCents: 1000, freeShipping: false, label: "WELCOME10, 10% off" });
    expect(checkDiscount(rule({ minOrderCents: 15000 }), ctx)).toMatchObject({ ok: false, message: "Add $50.00 more to use that code. It's for orders of $150 or more." });
    expect(checkDiscount(rule({ expiresAt: "2026-10-01T00:00:00Z" }), ctx)).toMatchObject({ message: "That code has expired." });
    expect(checkDiscount(rule({ startsAt: "2026-11-01T08:00:00Z" }), ctx)).toMatchObject({ message: "That code starts on Nov 1, 2026." });
    expect(checkDiscount(rule({ usage: "single_use" }), { ...ctx, usesTotal: 1 })).toMatchObject({ message: "That code has already been used." });
    expect(checkDiscount(rule({ usage: "per_account" }), { ...ctx, usesByBuyer: 1 })).toMatchObject({ message: "You've already used that code." });
    expect(checkDiscount(rule({ maxUses: 5 }), { ...ctx, usesTotal: 5 })).toMatchObject({ ok: false });
    expect(checkDiscount({ ...rule({}), tradeAccountId: id(3) }, ctx)).toMatchObject({ ok: false });
    expect(checkDiscount({ ...rule({}), active: false }, ctx)).toMatchObject({ message: "That code isn't valid." });
    expect(checkDiscount(rule({ kind: "amount", value: 50000 }), ctx)).toMatchObject({ ok: true, amountCents: 10000, freeShipping: true });
  });

  it("only lets welcome codes take a first order, by the person they were sent to", () => {
    const w = { code: "WELCOME-7KQ2FA", email: "a@x.com", kind: "percent" as const, value: 15, expiresAt: null, redeemedAt: null };
    const c = { subtotalCents: 10000, email: "a@x.com", now, paidOrdersForEmail: 0, heldElsewhere: false };
    expect(checkWelcomeCode(w, c)).toMatchObject({ ok: true, amountCents: 1500 });
    expect(checkWelcomeCode(w, { ...c, email: "b@x.com" })).toMatchObject({ ok: false });
    expect(checkWelcomeCode(w, { ...c, paidOrdersForEmail: 1 })).toMatchObject({ message: "Welcome codes are for a first order." });
    expect(checkWelcomeCode({ ...w, kind: "amount", value: 15 }, c)).toMatchObject({ amountCents: 1500, label: "WELCOME-7KQ2FA, $15 off" });
  });

  it("refuses codes that can't work", () => {
    expect(() => parseDiscount({ code: "x", kind: "percent", value: 10 })).toThrow(/3 to 40/);
    expect(() => parseDiscount({ code: "BIG", kind: "percent", value: 120 })).toThrow(/100/);
    expect(() => parseDiscount({ code: "LATE", kind: "percent", value: 5, startsAt: "2026-12-01", expiresAt: "2026-11-01" })).toThrow(/after it starts/);
  });
});

describe("cart pricing", () => {
  const variant = (n: number, p: Partial<VariantForPricing> = {}): VariantForPricing => ({
    variantId: id(n),
    productId: id(100 + n),
    productName: `Product ${n}`,
    productSlug: `product-${n}`,
    productStatus: "active",
    productOptions: [],
    photo: null,
    taxCode: "",
    options: {},
    sku: `SKU-${n}`,
    priceCents: 5000,
    compareAtCents: null,
    active: true,
    weightOz: 16,
    box: "small",
    unitsPerBox: 1,
    shipsAlone: false,
    flatShipCents: null,
    ...p,
  });
  const variants = new Map([variant(1), variant(2, { priceCents: 1999 }), variant(3, { productStatus: "draft" })].map((v) => [v.variantId, v]));
  const inquiry = storeSettingsSchema.parse({}).inquiry;

  it("cleans what the browser sends", () => {
    expect(cleanItems([{ variantId: id(1), qty: 2 }, { variantId: id(1), qty: 3.7 }, { variantId: "nope", qty: 1 }, { variantId: id(2), qty: -1 }, { variantId: id(2), qty: 5000 }])).toEqual([
      { variantId: id(1), qty: 5 },
      { variantId: id(2), qty: 999 },
    ]);
  });

  it("prices lines with trade pricing and a code, and drops what's gone", () => {
    const r = priceCart({
      items: [
        { variantId: id(1), qty: 2 },
        { variantId: id(2), qty: 1 },
        { variantId: id(3), qty: 1 },
      ],
      variants,
      currency: "usd",
      trade: { name: "Pro", percentOff: 15 },
      discount: (sub) => ({ code: "TEN", ...checkDiscount(ruleFromInput(parseDiscount({ code: "TEN", kind: "percent", value: 10 })), { subtotalCents: sub, email: null, tradeAccountId: null, now: new Date(), usesTotal: 0, usesByBuyer: 0 }) }),
      inquiry,
    });
    expect(r.lines.map((l) => l.unitCents)).toEqual([4250, 1699]);
    expect(r.subtotalCents).toBe(4250 * 2 + 1699);
    expect(r.discount).toMatchObject({ code: "TEN", amountCents: 1020 });
    expect(r.merchandiseCents).toBe(10199 - 1020);
    expect(r.notices).toEqual(["Product 3 isn't available anymore, so it was taken out of your cart."]);
    expect(r.trade).toEqual({ name: "Pro", percentOff: 15 });
  });

  it("turns a big order into a quote request", () => {
    const big = storeSettingsSchema.parse({ inquiry: { on: true, overCents: 50000 } }).inquiry;
    expect(priceCart({ items: [{ variantId: id(1), qty: 11 }], variants, currency: "usd", trade: null, inquiry: big }).inquiry).toEqual({ reason: "amount" });
    expect(priceCart({ items: [{ variantId: id(1), qty: 10 }], variants, currency: "usd", trade: null, inquiry: big }).inquiry).toBeNull();
  });

  it("adds up estimates", () => {
    const items = [
      { id: "a", productId: null, variantId: null, name: "Bags", detail: "", qty: 3, unitCents: 8900 },
      { id: "b", productId: null, variantId: null, name: "Labor", detail: "", qty: 2.5, unitCents: 9500 },
    ];
    expect(estimateTotals(items, { kind: "percent", value: 10 }, 2500)).toEqual({ subtotalCents: 26700 + 23750, discountCents: 5045, totalCents: 50450 - 5045 + 2500 });
    expect(estimateTotals(items, { kind: "amount", value: 999999 }, 0)).toMatchObject({ discountCents: 50450, totalCents: 0 });
  });
});

describe("trade tiers", () => {
  const { tiers } = tradeSettingsSchema.parse({});

  it("pick the tier by 12-month spend, unless the team set one", () => {
    expect(tierFor(tiers, 0).key).toBe("trade");
    expect(tierFor(tiers, 500_000).key).toBe("pro");
    expect(tierFor(tiers, 9_000_000).key).toBe("partner");
    expect(tierFor(tiers, 0, "partner").key).toBe("partner");
    expect(nextTier(tiers, 120_000)).toEqual({ tier: tiers[1], moreCents: 380_000 });
    expect(nextTier(tiers, 2_000_000)).toBeNull();
  });
});
