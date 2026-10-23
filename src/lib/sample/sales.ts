// Made-up orders, estimates, carts and trade accounts for sample mode and the
// demo, plus a sample catalog per industry. Same company, same data, every
// time. Never written to the database.
import type { EstimateStatus, FulfillmentStatus, OrderStatus, TradeStatus } from "@/lib/db/types";
import { estimateTotals, type EstimateLine } from "@/lib/sales/pricing";
import type { CartRow, EstimateDetail, EstimateRow, OrderDetail, OrderItem, OrderRow, SalesSummary, TradeRow } from "@/lib/sales/types";
import { FIRST, LAST, MAIL, type SampleTenant } from "./marketing";
import { hashString, seeded } from "./random";

const DAY = 86_400_000;

/** A uuid-shaped id that's the same every time for the same seed. */
export function sampleUuid(seed: string): string {
  const h = (n: number) => hashString(`${seed}:${n}`).toString(16).padStart(8, "0");
  const hex = `${h(1)}${h(2)}${h(3)}${h(4)}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ---- Catalog ------------------------------------------------------------------------

export type SampleVariant = { options: Record<string, string>; priceCents: number; compareAtCents: number | null; sku: string; weightOz: number; box: string; unitsPerBox: number; shipsAlone: boolean; flatShipCents: number | null };
export type SampleProduct = { slug: string; name: string; category: string; description: string; options: { name: string; values: string[] }[]; variants: SampleVariant[]; color: string };

const v = (options: Record<string, string>, priceCents: number, sku: string, weightOz: number, box: string, extra: Partial<SampleVariant> = {}): SampleVariant => ({ options, priceCents, compareAtCents: null, sku, weightOz, box, unitsPerBox: 1, shipsAlone: false, flatShipCents: null, ...extra });

const CATALOGS: Record<string, SampleProduct[]> = {
  pools: [
    {
      slug: "glow-aggregate",
      name: "Glow aggregate",
      category: "Aggregate",
      color: "#22b8cf",
      description: "Glow-in-the-dark stones for pool finishes. Charges in daylight and glows for hours after dark.\n\n- Mix 1 to 2 lb per 10 sq ft of finish\n- UV stable, safe in chlorine and salt pools\n- Ships in sealed bags",
      options: [
        { name: "Color", values: ["Aqua", "Blue", "Green"] },
        { name: "Size", values: ["25 lb", "50 lb"] },
      ],
      variants: ["Aqua", "Blue", "Green"].flatMap((c) => [v({ Color: c, Size: "25 lb" }, 8900, `GA-${c[0]}-25`, 410, "medium", { unitsPerBox: 2 }), v({ Color: c, Size: "50 lb" }, 16500, `GA-${c[0]}-50`, 810, "large", { compareAtCents: c === "Aqua" ? 17900 : null })]),
    },
    {
      slug: "glow-mosaic-tiles",
      name: "Glow mosaic tiles",
      category: "Mosaics",
      color: "#4c6ef5",
      description: "Hand-set glow mosaics for steps, benches and waterlines.\n\nEach sheet covers about 1 sq ft.",
      options: [
        { name: "Pattern", values: ["Stars", "Waves"] },
        { name: "Pack", values: ["10 sheets", "25 sheets"] },
      ],
      variants: ["Stars", "Waves"].flatMap((p) => [v({ Pattern: p, Pack: "10 sheets" }, 4500, `GM-${p[0]}-10`, 96, "small"), v({ Pattern: p, Pack: "25 sheets" }, 9900, `GM-${p[0]}-25`, 240, "medium")]),
    },
    { slug: "sample-board", name: "Sample board", category: "Samples", color: "#12b886", description: "All three colors on one board, with a UV light to see them glow.", options: [], variants: [v({}, 1900, "SB-1", 24, "small", { unitsPerBox: 4 })] },
    { slug: "uv-flashlight", name: "UV charging flashlight", category: "Tools", color: "#7950f2", description: "Charges glow aggregate in seconds for night inspections and demos.", options: [], variants: [v({}, 2400, "UV-1", 8, "small", { unitsPerBox: 6 })] },
    { slug: "glow-pebble-kit", name: "Glow pebble accent kit", category: "Kits", color: "#15aabf", description: "Larger glow pebbles for spa edges and fire features. Enough for one spa.", options: [], variants: [v({}, 12900, "GP-KIT", 320, "medium")] },
    { slug: "pallet-glow-aggregate", name: "Pallet of glow aggregate", category: "Aggregate", color: "#0b7285", description: "Forty 50 lb bags on a pallet, for builders. Ships by freight.", options: [], variants: [v({}, 520000, "GA-PALLET", 32000, "", { flatShipCents: 32500 })] },
  ],
  coffee: [
    {
      slug: "house-blend",
      name: "House blend",
      category: "Coffee",
      color: "#a5673f",
      description: "Chocolate, toasted nuts and a little cherry. Our everyday coffee.\n\n- Medium roast\n- Roasted to order",
      options: [
        { name: "Size", values: ["12 oz", "2 lb", "5 lb"] },
        { name: "Grind", values: ["Whole bean", "Drip", "Espresso"] },
      ],
      variants: ["12 oz", "2 lb", "5 lb"].flatMap((s, i) => ["Whole bean", "Drip", "Espresso"].map((g) => v({ Size: s, Grind: g }, [1600, 3800, 8500][i], `HB-${s.replace(/\s/g, "")}-${g[0]}`, [13, 33, 81][i], i === 2 ? "medium" : "small", { unitsPerBox: [6, 3, 2][i] }))),
    },
    {
      slug: "espresso-roast",
      name: "Espresso roast",
      category: "Coffee",
      color: "#6f4e37",
      description: "Dark caramel and cocoa, built for milk drinks.",
      options: [{ name: "Size", values: ["12 oz", "2 lb", "5 lb"] }],
      variants: ["12 oz", "2 lb", "5 lb"].map((s, i) => v({ Size: s }, [1700, 4000, 8900][i], `ER-${s.replace(/\s/g, "")}`, [13, 33, 81][i], i === 2 ? "medium" : "small", { unitsPerBox: [6, 3, 2][i] })),
    },
    { slug: "ethiopia-guji", name: "Ethiopia Guji", category: "Single origin", color: "#c08552", description: "Blueberry, jasmine and lemon. Light roast.", options: [], variants: [v({}, 2100, "ET-GUJI", 13, "small", { unitsPerBox: 6 })] },
    { slug: "cold-brew-packs", name: "Cold brew packs", category: "Coffee", color: "#8d6e63", description: "Six pour-and-steep packs. Each makes a quart.", options: [], variants: [v({}, 1800, "CB-6", 20, "small", { unitsPerBox: 4, compareAtCents: 2200 })] },
    { slug: "pour-over-kit", name: "Pour-over kit", category: "Gear", color: "#5c4033", description: "Ceramic dripper, filters and a 12 oz bag of house blend.", options: [], variants: [v({}, 4500, "PO-KIT", 40, "small")] },
    { slug: "ceramic-mug", name: "Ceramic mug", category: "Gear", color: "#b08968", description: "12 oz, glazed in the shop's colors.", options: [], variants: [v({}, 2200, "MUG-12", 18, "small", { unitsPerBox: 2 })] },
  ],
  general: [
    { slug: "starter-package", name: "Starter package", category: "Packages", color: "#4263eb", description: "A good first step: the essentials, set up and handed over.", options: [], variants: [v({}, 25000, "PKG-S", 0, "", { flatShipCents: 0 })] },
    { slug: "standard-package", name: "Standard package", category: "Packages", color: "#3b5bdb", description: "Everything in Starter, plus a second round of changes.", options: [], variants: [v({}, 65000, "PKG-M", 0, "", { flatShipCents: 0 })] },
    { slug: "premium-package", name: "Premium package", category: "Packages", color: "#364fc7", description: "The full service, with priority scheduling.", options: [], variants: [v({}, 140000, "PKG-L", 0, "", { flatShipCents: 0 })] },
    { slug: "consultation", name: "Consultation", category: "Services", color: "#5c7cfa", description: "An hour with the team to plan your project.", options: [], variants: [v({}, 15000, "CONSULT", 0, "", { flatShipCents: 0 })] },
    { slug: "gift-card", name: "Gift card", category: "Gift cards", color: "#748ffc", description: "Mailed in a card.", options: [{ name: "Amount", values: ["$50", "$100", "$250"] }], variants: ["$50", "$100", "$250"].map((a) => v({ Amount: a }, Number(a.slice(1)) * 100, `GC-${a.slice(1)}`, 2, "small", { unitsPerBox: 10 })) },
  ],
};

export function sampleCatalog(tenant: SampleTenant): SampleProduct[] {
  return CATALOGS[tenant.industry] ?? CATALOGS.general;
}

// ---- People --------------------------------------------------------------------------

const CITIES = [
  ["Austin", "TX", "78704"],
  ["Phoenix", "AZ", "85016"],
  ["Tampa", "FL", "33606"],
  ["Bend", "OR", "97701"],
  ["Denver", "CO", "80205"],
  ["San Diego", "CA", "92104"],
  ["Charlotte", "NC", "28203"],
  ["Nashville", "TN", "37206"],
  ["Scottsdale", "AZ", "85251"],
  ["Orlando", "FL", "32803"],
  ["Boise", "ID", "83702"],
  ["Sacramento", "CA", "95816"],
] as const;
const STREETS = ["Cedar", "Maple", "Juniper", "Lakeview", "Sunset", "Ridge", "Harbor", "Palm", "Willow", "Canyon"];

const COMPANIES: Record<string, string[]> = {
  pools: ["Blue Lagoon Pools", "Desert Oasis Builders", "Clearwater Pool Co", "Aqua Craft Resurfacing", "Sunbelt Pools", "Northshore Spas", "Coastal Plaster", "Lone Star Pool Works", "Palmetto Pools", "Highline Outdoor"],
  coffee: ["Corner Cafe", "Two Rivers Coffee Bar", "Brightside Bakery", "Fieldhouse Offices", "Juniper Market", "The Daily Grind", "Hilltop Co-op", "Lantern Books and Coffee", "Northside Coworking", "Saltbox Diner"],
  general: ["Hartwell Group", "Oakline Studio", "Pinecrest Partners", "Meridian Health", "Brightpath Schools", "Summit Legal", "Redwood Dental", "Ironside Fitness", "Kestrel Media", "Bluebird Realty"],
};

type Person = { name: string; email: string; city: (typeof CITIES)[number]; street: string };

function person(rand: ReturnType<typeof seeded>): Person {
  const first = rand.pick(FIRST);
  const last = rand.pick(LAST);
  return { name: `${first} ${last}`, email: `${first.toLowerCase()}.${last.toLowerCase()}@${rand.pick(MAIL)}`, city: rand.pick(CITIES), street: `${rand.int(100, 9800)} ${rand.pick(STREETS)} ${rand.chance(0.5) ? "St" : "Ave"}` };
}

function pickItems(rand: ReturnType<typeof seeded>, catalog: SampleProduct[], max: number): OrderItem[] {
  const count = rand.int(1, max);
  const items: OrderItem[] = [];
  for (let i = 0; i < count; i++) {
    const p = rand.chance(0.04) ? catalog[catalog.length - 1] : rand.pick(catalog.slice(0, Math.max(1, catalog.length - 1)));
    const variant = rand.pick(p.variants);
    if (items.some((x) => x.sku === variant.sku)) continue;
    const qty = variant.priceCents > 100_000 ? 1 : rand.int(1, variant.priceCents < 3000 ? 4 : 2);
    items.push({ productId: null, variantId: null, name: p.name, variant: Object.values(variant.options).join(" / "), sku: variant.sku, qty, unitCents: variant.priceCents, lineCents: variant.priceCents * qty });
  }
  return items;
}

// ---- Orders --------------------------------------------------------------------------

export function sampleOrders(tenant: SampleTenant, now = new Date()): OrderDetail[] {
  const rand = seeded(`${tenant.id}:${tenant.name}:orders`);
  const catalog = sampleCatalog(tenant);
  const companies = COMPANIES[tenant.industry] ?? COMPANIES.general;
  const total = rand.int(70, 140);
  const out: OrderDetail[] = [];
  for (let i = 0; i < total; i++) {
    const p = person(rand);
    const ageDays = Math.pow(i / total, 1.2) * 120 + rand.next() * 0.8;
    const paidAt = new Date(now.getTime() - ageDays * DAY - rand.int(0, 8) * 3_600_000);
    const items = pickItems(rand, catalog, 3);
    const subtotal = items.reduce((n, x) => n + x.lineCents, 0);
    const trade = rand.chance(0.18) ? rand.pick(companies) : null;
    const tradeOff = trade ? Math.round(subtotal * 0.12) : 0;
    const code = !trade && rand.chance(0.15) ? rand.pick(["WELCOME10", "SPRING15", "FRIENDS"]) : "";
    const discount = tradeOff + (code ? Math.round(subtotal * 0.1) : 0);
    const flat = items.some((x) => x.sku.includes("PALLET")) ? 32500 : 0;
    const shipping = tenant.industry === "general" ? 0 : flat || Math.round(900 + (subtotal - discount) * 0.04 + rand.int(0, 600));
    const tax = Math.round((subtotal - discount) * 0.078);
    const totalCents = subtotal - discount + shipping + tax;
    const ageHours = ageDays * 24;
    const fulfillment: FulfillmentStatus = tenant.industry === "general" ? "none" : ageHours < 6 ? "pending" : ageHours < 40 ? "sent" : "shipped";
    const refunded = i > 3 && rand.chance(0.04);
    const status: OrderStatus = refunded ? (rand.chance(0.5) ? "refunded" : "partially_refunded") : "paid";
    const refundedCents = status === "refunded" ? totalCents : status === "partially_refunded" ? Math.round(totalCents * 0.3) : 0;
    const number = 1000 + total - i;
    out.push({
      id: sampleUuid(`${tenant.id}:order:${i}`),
      number,
      source: i % 11 === 4 ? "estimate" : "checkout",
      status,
      fulfillment,
      email: trade ? `orders@${trade.toLowerCase().replace(/[^a-z]+/g, "")}.com` : p.email,
      name: p.name,
      itemCount: items.reduce((n, x) => n + x.qty, 0),
      totalCents,
      refundedCents,
      currency: "usd",
      paidAt,
      tradeCompany: trade,
      phone: `(555) 01${rand.int(10, 99)}-${rand.int(1000, 9999)}`,
      shipTo: { name: p.name, company: trade ?? "", line1: p.street, line2: "", city: p.city[0], state: p.city[1], postal: p.city[2], country: "US" },
      items,
      subtotalCents: subtotal,
      discountCents: discount,
      shippingCents: shipping,
      taxCents: tax,
      discountCode: code,
      shippingService: shipping === 0 ? "" : flat ? "Freight" : rand.pick(["UPS Ground", "UPS Ground", "UPS 2nd Day Air", "USPS Priority Mail"]),
      alert: { to: ["owner@example.com"], at: paidAt.toISOString(), providerId: `re_${hashString(`${i}`).toString(16)}` },
      fulfillmentDetail: fulfillment === "none" ? {} : { provider: "shipstation", externalId: `se-${100000 + number}`, attempts: 1, at: paidAt.toISOString(), ...(fulfillment === "shipped" ? { tracking: `1Z${hashString(`t${i}`).toString(36).toUpperCase().padEnd(16, "0").slice(0, 16)}` } : {}) },
      stripe: { accountId: null, paymentIntentId: null, sessionId: null, invoiceId: null },
      estimate: null,
      contactId: null,
      note: "",
    });
  }
  return out;
}

export function orderRows(orders: OrderDetail[]): OrderRow[] {
  return orders.map(({ id, number, source, status, fulfillment, email, name, itemCount, totalCents, refundedCents, currency, paidAt, tradeCompany }) => ({ id, number, source, status, fulfillment, email, name, itemCount, totalCents, refundedCents, currency, paidAt, tradeCompany }));
}

// ---- Estimates ------------------------------------------------------------------------

const ESTIMATE_TITLES: Record<string, string[]> = {
  pools: ["Resurface with glow finish", "Spa glow accents", "Builder order, spring stock", "Glow waterline tiles", "Backyard remodel package"],
  coffee: ["Weekly cafe order", "Office coffee service", "Wedding coffee bar", "Private label bags", "Holiday gift boxes"],
  general: ["Website refresh", "Quarterly retainer", "Launch package", "Team workshop", "Consulting block"],
};

export function sampleEstimates(tenant: SampleTenant, now = new Date()): EstimateDetail[] {
  const rand = seeded(`${tenant.id}:${tenant.name}:estimates`);
  const catalog = sampleCatalog(tenant);
  const companies = COMPANIES[tenant.industry] ?? COMPANIES.general;
  const titles = ESTIMATE_TITLES[tenant.industry] ?? ESTIMATE_TITLES.general;
  const statuses: EstimateStatus[] = ["draft", "sent", "sent", "viewed", "viewed", "changes_requested", "approved", "invoiced", "invoiced", "paid", "paid", "paid", "declined", "void"];
  const out: EstimateDetail[] = [];
  const count = rand.int(14, 22);
  for (let i = 0; i < count; i++) {
    const p = person(rand);
    const company = rand.chance(0.7) ? rand.pick(companies) : "";
    const status = i < statuses.length ? statuses[i] : rand.pick(statuses);
    const items: EstimateLine[] = pickItems(rand, catalog, 4).map((x, n) => ({ id: `l${n}`, productId: null, variantId: null, name: x.variant ? `${x.name}, ${x.variant}` : x.name, detail: "", qty: x.qty * (rand.chance(0.4) ? rand.int(2, 6) : 1), unitCents: x.unitCents }));
    if (rand.chance(0.5)) items.push({ id: "labor", productId: null, variantId: null, name: tenant.industry === "coffee" ? "Delivery and setup" : tenant.industry === "pools" ? "Installation labor" : "Project management", detail: "Hours estimated", qty: rand.int(4, 24), unitCents: rand.pick([7500, 9500, 12500]) });
    const discount = rand.chance(0.3) ? ({ kind: "percent", value: rand.pick([5, 10]) } as const) : ({} as Record<string, never>);
    const shippingCents = tenant.industry === "general" ? 0 : rand.int(0, 4) * 2500;
    const t = estimateTotals(items, discount, shippingCents);
    const createdAgo = rand.int(1, 70) * DAY;
    const sentAt = status === "draft" ? null : new Date(now.getTime() - createdAgo + DAY);
    const updatedAt = new Date(now.getTime() - createdAgo + rand.int(1, 5) * DAY);
    const validUntil = new Date(now.getTime() - createdAgo + 31 * DAY).toISOString().slice(0, 10);
    out.push({
      id: sampleUuid(`${tenant.id}:estimate:${i}`),
      number: 101 + count - i,
      status,
      title: rand.pick(titles),
      client: { name: p.name, email: company ? `${p.name.split(" ")[0].toLowerCase()}@${company.toLowerCase().replace(/[^a-z]+/g, "")}.com` : p.email, company, phone: `(555) 01${rand.int(10, 99)}-${rand.int(1000, 9999)}`, address: { line1: p.street, city: p.city[0], state: p.city[1], postal: p.city[2], country: "US" } },
      totalCents: t.totalCents,
      currency: "usd",
      sentAt,
      updatedAt: updatedAt > now ? now : updatedAt,
      validUntil,
      source: i === 3 ? "inquiry" : "team",
      items,
      discount,
      shippingCents,
      subtotalCents: t.subtotalCents,
      discountCents: t.discountCents,
      notes: "Prices hold for 30 days. Lead time is about two weeks from approval.",
      internalNote: "",
      approvedName: ["approved", "invoiced", "paid"].includes(status) ? p.name : "",
      changeRequest: status === "changes_requested" ? "Can you split the labor into two visits and drop the second color?" : "",
      delivery: sentAt ? { to: [p.email], at: sentAt.toISOString(), providerId: "re_sample" } : {},
      invoiceUrl: ["invoiced", "paid"].includes(status) ? "https://invoice.stripe.com/" : null,
      paidAt: status === "paid" ? updatedAt : null,
      viewedAt: ["viewed", "changes_requested", "approved", "invoiced", "paid", "declined"].includes(status) && sentAt ? new Date(sentAt.getTime() + 5 * 3_600_000) : null,
      orderId: null,
      contactId: null,
      tradeAccountId: null,
      events: [
        { kind: "created", actor: "team", detail: "", at: new Date(now.getTime() - createdAgo) },
        ...(sentAt ? [{ kind: "sent", actor: "team", detail: `Sent to ${p.email}`, at: sentAt }] : []),
      ],
    });
  }
  return out;
}

export function estimateRows(list: EstimateDetail[]): EstimateRow[] {
  return list.map(({ id, number, status, title, client, totalCents, currency, sentAt, updatedAt, validUntil, source }) => ({ id, number, status, title, client, totalCents, currency, sentAt, updatedAt, validUntil, source }));
}

// ---- Carts ----------------------------------------------------------------------------

export function sampleCarts(tenant: SampleTenant, now = new Date()): CartRow[] {
  const rand = seeded(`${tenant.id}:${tenant.name}:carts`);
  const catalog = sampleCatalog(tenant);
  const out: CartRow[] = [];
  const count = rand.int(12, 26);
  for (let i = 0; i < count; i++) {
    const p = person(rand);
    const items = pickItems(rand, catalog, 3);
    const lastActiveAt = new Date(now.getTime() - (i * 1.7 + rand.next()) * DAY - rand.int(1, 20) * 3_600_000);
    const recovered = rand.chance(0.15);
    out.push({
      id: sampleUuid(`${tenant.id}:cart:${i}`),
      status: recovered ? "ordered" : "abandoned",
      email: p.email,
      name: rand.chance(0.6) ? p.name : "",
      itemCount: items.reduce((n, x) => n + x.qty, 0),
      subtotalCents: items.reduce((n, x) => n + x.lineCents, 0),
      currency: "usd",
      lastActiveAt,
      abandonedAt: new Date(lastActiveAt.getTime() + 4 * 3_600_000),
      items: items.map((x) => ({ name: x.name, variant: x.variant, qty: x.qty, lineCents: x.lineCents })),
      orderId: null,
      contactId: null,
    });
  }
  return out;
}

// ---- Trade accounts ---------------------------------------------------------------------

export function sampleTrade(tenant: SampleTenant, now = new Date()): TradeRow[] {
  const rand = seeded(`${tenant.id}:${tenant.name}:trade`);
  const companies = COMPANIES[tenant.industry] ?? COMPANIES.general;
  const statuses: TradeStatus[] = ["applied", "applied", "approved", "approved", "approved", "approved", "approved", "declined", "paused", "approved"];
  return companies.map((company, i) => {
    const p = person(rand);
    const status = statuses[i % statuses.length];
    const spendCents = status === "approved" ? rand.pick([120000, 380000, 640000, 910000, 2450000]) + rand.int(0, 90000) : status === "paused" ? 150000 : 0;
    const appliedAt = new Date(now.getTime() - rand.int(2, 300) * DAY);
    const domain = company.toLowerCase().replace(/[^a-z]+/g, "");
    return {
      id: sampleUuid(`${tenant.id}:trade:${i}`),
      company,
      contactName: p.name,
      email: `${p.name.split(" ")[0].toLowerCase()}@${domain}.com`,
      phone: `(555) 01${rand.int(10, 99)}-${rand.int(1000, 9999)}`,
      website: `https://${domain}.com`,
      status,
      details: { type: tenant.industry === "pools" ? rand.pick(["Pool builder", "Dealer", "Landscaper"]) : tenant.industry === "coffee" ? rand.pick(["Cafe", "Grocery", "Office"]) : rand.pick(["Agency", "Reseller"]), resale: rand.chance(0.7) ? `${p.city[1]}-${rand.int(100000, 999999)}` : "", volume: rand.pick(["About $1,000 a month", "$5,000 to $10,000 a year", "We're just starting out"]), message: status === "applied" ? "We'd like to stock your products for our spring season." : "" },
      note: status === "declined" ? "Retail only, no resale certificate." : "",
      tierOverride: "",
      spendCents,
      orderCount: spendCents ? Math.max(1, Math.round(spendCents / 90000)) : 0,
      appliedAt,
      decidedAt: status === "applied" ? null : new Date(appliedAt.getTime() + rand.int(1, 4) * DAY),
    };
  });
}

// ---- Summary ----------------------------------------------------------------------------

export function sampleSalesSummary(tenant: SampleTenant, now = new Date()): SalesSummary {
  const orders = sampleOrders(tenant, now);
  const since = now.getTime() - 30 * DAY;
  const prevSince = now.getTime() - 60 * DAY;
  const net = (o: OrderDetail) => o.totalCents - o.refundedCents;
  const recent = orders.filter((o) => o.paidAt.getTime() >= since);
  const prev = orders.filter((o) => o.paidAt.getTime() >= prevSince && o.paidAt.getTime() < since);
  const estimates = sampleEstimates(tenant, now).filter((e) => ["sent", "viewed", "changes_requested", "approved", "invoiced"].includes(e.status));
  const carts = sampleCarts(tenant, now).filter((c) => c.status === "abandoned" && c.lastActiveAt.getTime() >= since);
  const revenue = recent.reduce((n, o) => n + net(o), 0);
  return {
    revenueCents: revenue,
    revenuePrevCents: prev.reduce((n, o) => n + net(o), 0),
    orders: recent.length,
    averageOrderCents: recent.length ? Math.round(revenue / recent.length) : null,
    openEstimates: estimates.length,
    openEstimatesCents: estimates.reduce((n, e) => n + e.totalCents, 0),
    toFulfill: orders.filter((o) => o.fulfillment === "pending" || o.fulfillment === "failed").length,
    abandoned: carts.length,
    abandonedCents: carts.reduce((n, c) => n + c.subtotalCents, 0),
    tradeWaiting: sampleTrade(tenant, now).filter((t) => t.status === "applied").length,
    currency: "usd",
  };
}
