// Made-up orders, estimates, carts and trade accounts for sample mode and the
// demo, plus a sample catalog per industry. Same company, same data, every
// time. Never written to the database. Fit Funnels clubs (a gym, a studio) get
// their own: memberships and packs, corporate quotes, corporate accounts.
import { editionOfIndustry } from "@/config/editions";
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
  // Fit Funnels: a full gym, and a boutique cycling studio. Memberships, packs
  // and training don't ship (no shipping charge); only gear does.
  gym: [
    {
      slug: "club-membership",
      name: "Club membership",
      category: "Memberships",
      color: "#f76b15",
      description: "The strength floor, group classes, the pool and the sauna, seven days a week.\n\n- Monthly, annual, or off-peak (weekdays before 4 pm and weekends)\n- A fitness assessment in your first week\n- Bring a friend once a month",
      options: [{ name: "Plan", values: ["Monthly", "Annual", "Off-peak monthly"] }],
      variants: [v({ Plan: "Monthly" }, 8900, "MEM-MONTH", 0, "", { flatShipCents: 0 }), v({ Plan: "Annual" }, 89000, "MEM-YEAR", 0, "", { flatShipCents: 0, compareAtCents: 106800 }), v({ Plan: "Off-peak monthly" }, 5900, "MEM-OFFPEAK", 0, "", { flatShipCents: 0 })],
    },
    {
      slug: "class-pack",
      name: "Class pack",
      category: "Class packs",
      color: "#e8590c",
      description: "Group classes on the schedule: spin, HIIT, strength, yoga and aqua. Book in the app. Packs last six months.",
      options: [{ name: "Classes", values: ["5 classes", "10 classes", "20 classes"] }],
      variants: [v({ Classes: "5 classes" }, 9500, "CP-5", 0, "", { flatShipCents: 0 }), v({ Classes: "10 classes" }, 17000, "CP-10", 0, "", { flatShipCents: 0 }), v({ Classes: "20 classes" }, 30000, "CP-20", 0, "", { flatShipCents: 0 })],
    },
    {
      slug: "personal-training",
      name: "Personal training",
      category: "Personal training",
      color: "#d9480f",
      description: "One-on-one sessions with a coach, planned around what you want to work on. Sessions are 50 minutes.\n\n- Start with one session to meet your trainer\n- Packages last 90 days",
      options: [{ name: "Package", values: ["1 session", "4 sessions", "8 sessions", "12 sessions"] }],
      variants: [v({ Package: "1 session" }, 7500, "PT-1", 0, "", { flatShipCents: 0 }), v({ Package: "4 sessions" }, 28000, "PT-4", 0, "", { flatShipCents: 0 }), v({ Package: "8 sessions" }, 52000, "PT-8", 0, "", { flatShipCents: 0 }), v({ Package: "12 sessions" }, 72000, "PT-12", 0, "", { flatShipCents: 0 })],
    },
    { slug: "day-pass", name: "Day pass", category: "Passes", color: "#fd7e14", description: "One day, the whole club. Bring a photo ID to the front desk.", options: [], variants: [v({}, 2500, "DAY-1", 0, "", { flatShipCents: 0 })] },
    {
      slug: "family-add-on",
      name: "Family add-on",
      category: "Memberships",
      color: "#f08c00",
      description: "Add a partner or a teen (14 to 17) to a club membership. Childcare is included for kids under 8 while you train.",
      options: [{ name: "Who", values: ["Partner", "Teen"] }],
      variants: [v({ Who: "Partner" }, 4900, "FAM-PARTNER", 0, "", { flatShipCents: 0 }), v({ Who: "Teen" }, 2900, "FAM-TEEN", 0, "", { flatShipCents: 0 })],
    },
    {
      slug: "club-tee",
      name: "Club tee",
      category: "Gear",
      color: "#495057",
      description: "Soft cotton tee with the club logo on the chest.",
      options: [{ name: "Size", values: ["S", "M", "L", "XL"] }],
      variants: ["S", "M", "L", "XL"].map((sz) => v({ Size: sz }, 2800, `TEE-${sz}`, 6, "small", { unitsPerBox: 4 })),
    },
    { slug: "shaker-bottle", name: "Shaker bottle", category: "Gear", color: "#343a40", description: "24 oz, with a mixing ball and a leakproof lid.", options: [], variants: [v({}, 1400, "SHAKER-24", 8, "small", { unitsPerBox: 4 })] },
    { slug: "gym-towel", name: "Gym towel", category: "Gear", color: "#868e96", description: "Quick-dry microfiber, sized for a bench.", options: [], variants: [v({}, 1800, "TOWEL-1", 10, "small", { unitsPerBox: 3 })] },
  ],
  studio: [
    { slug: "first-ride", name: "First ride", category: "Intro", color: "#f76b15", description: "Your first class, shoes included. Come 15 minutes early and we'll set up your bike.", options: [], variants: [v({}, 1500, "RIDE-FIRST", 0, "", { flatShipCents: 0 })] },
    {
      slug: "class-pack",
      name: "Class pack",
      category: "Class packs",
      color: "#e8590c",
      description: "Rides and HIIT classes, booked in the app. Packs last six months.\n\n- 5, 10 or 20 classes\n- Share a pack with a friend at the front desk",
      options: [{ name: "Classes", values: ["5 classes", "10 classes", "20 classes"] }],
      variants: [v({ Classes: "5 classes" }, 11000, "PACK-5", 0, "", { flatShipCents: 0 }), v({ Classes: "10 classes" }, 20000, "PACK-10", 0, "", { flatShipCents: 0 }), v({ Classes: "20 classes" }, 36000, "PACK-20", 0, "", { flatShipCents: 0, compareAtCents: 40000 })],
    },
    { slug: "unlimited-monthly", name: "Unlimited monthly", category: "Memberships", color: "#d9480f", description: "A month of every ride and every HIIT class, as many as you can book.", options: [], variants: [v({}, 18900, "UNL-MONTH", 0, "", { flatShipCents: 0 })] },
    { slug: "shoe-rental", name: "Shoe rental", category: "Add-ons", color: "#fd7e14", description: "Clip-in cycling shoes for one class. Free with your first ride.", options: [], variants: [v({}, 300, "SHOE-1", 0, "", { flatShipCents: 0 })] },
    {
      slug: "grip-socks",
      name: "Grip socks",
      category: "Gear",
      color: "#495057",
      description: "Non-slip socks for HIIT and the mat room.",
      options: [{ name: "Size", values: ["S/M", "L/XL"] }],
      variants: ["S/M", "L/XL"].map((sz) => v({ Size: sz }, 1400, `SOCK-${sz.replace("/", "")}`, 3, "small", { unitsPerBox: 6 })),
    },
    {
      slug: "studio-tee",
      name: "Studio tee",
      category: "Gear",
      color: "#343a40",
      description: "Lightweight tee with the studio logo on the back.",
      options: [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }],
      variants: ["XS", "S", "M", "L", "XL"].map((sz) => v({ Size: sz }, 3200, `TEE-${sz}`, 5, "small", { unitsPerBox: 4 })),
    },
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
  // Local employers whose staff join on corporate pricing.
  gym: ["Cascade Medical Group", "High Desert Credit Union", "Juniper Elementary", "Ridgeview Engineering", "Pine Street Dental", "Deschutes Brewing Co", "Northside Fire District", "Basin Logistics", "Sagebrush Software", "Lakeside Senior Living"],
  studio: ["Ember Coffee Co", "Stonefly Design", "Trailhead Outfitters", "Alder Physical Therapy", "Bright Lane Realty", "Riverbend Law", "Kiln and Co", "Harbor Yoga Collective", "Copperline Marketing", "Oak Hill Montessori"],
};

/** Fit Funnels clubs get club data: memberships, packs and corporate accounts. */
const isClub = (t: SampleTenant) => editionOfIndustry(t.industry) === "fit";

/** Where each sample trade or corporate account stands, by its place in COMPANIES. */
const TRADE_STATUSES: TradeStatus[] = ["applied", "applied", "approved", "approved", "approved", "approved", "approved", "declined", "paused", "approved"];

/**
 * The club's corporate accounts that buy: approved or paused. Companies still
 * waiting, or turned down, have no quotes or purchases in club sample data.
 */
function clubBuyers(tenant: SampleTenant): string[] {
  const companies = COMPANIES[tenant.industry] ?? COMPANIES.gym;
  return companies.filter((_, i) => ["approved", "paused"].includes(TRADE_STATUSES[i % TRADE_STATUSES.length]));
}

type Employer = { kind: string; staff: number; wants: string; message?: string };

/** What each sample employer said on its corporate application. */
const EMPLOYERS: Record<string, Employer> = {
  "Cascade Medical Group": { kind: "Clinic", staff: 120, wants: "Memberships for staff who want one", message: "Our wellness committee wants to add a club membership to our benefits in January. Could you send corporate pricing for about 40 people?" },
  "High Desert Credit Union": { kind: "Credit union", staff: 45, wants: "Class packs to share across our two branches", message: "A few of our tellers already train with you. We'd like a corporate account so the rest of the team can join at the same rate." },
  "Juniper Elementary": { kind: "School", staff: 60, wants: "Summer memberships for teachers" },
  "Ridgeview Engineering": { kind: "Office", staff: 35, wants: "Small-group training at lunch" },
  "Pine Street Dental": { kind: "Clinic", staff: 12, wants: "Memberships for staff who want one" },
  "Deschutes Brewing Co": { kind: "Brewery", staff: 90, wants: "A staff wellness day each quarter" },
  "Northside Fire District": { kind: "Public agency", staff: 70, wants: "Strength training for crews" },
  "Basin Logistics": { kind: "Warehouse", staff: 150, wants: "Off-peak memberships for shift workers" },
  "Sagebrush Software": { kind: "Office", staff: 25, wants: "Class packs to share around the office" },
  "Lakeside Senior Living": { kind: "Care home", staff: 80, wants: "Memberships for staff who want one" },
  "Ember Coffee Co": { kind: "Cafe", staff: 15, wants: "A team ride each quarter", message: "Our baristas keep asking about a team ride. Could we book one each quarter, and get class packs for the regulars?" },
  "Stonefly Design": { kind: "Design studio", staff: 10, wants: "Class packs to share around the office", message: "We'd like to give everyone on our team of 10 a class pack as a perk this year." },
  "Trailhead Outfitters": { kind: "Retail", staff: 30, wants: "Unlimited memberships for the shop team" },
  "Alder Physical Therapy": { kind: "Clinic", staff: 18, wants: "First rides for new patients' families" },
  "Bright Lane Realty": { kind: "Office", staff: 22, wants: "Class packs to share around the office" },
  "Riverbend Law": { kind: "Law office", staff: 14, wants: "Unlimited memberships for partners and staff" },
  "Kiln and Co": { kind: "Studio", staff: 6, wants: "A team ride for our holiday party" },
  "Harbor Yoga Collective": { kind: "Studio", staff: 9, wants: "Class packs for our teachers" },
  "Copperline Marketing": { kind: "Office", staff: 20, wants: "A team ride each quarter" },
  "Oak Hill Montessori": { kind: "School", staff: 25, wants: "Class packs for teachers" },
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

/** Gear ships; memberships, packs and training don't. */
const ships = (sku: string, catalog: SampleProduct[]) => catalog.some((p) => p.variants.some((x) => x.sku === sku && x.weightOz > 0));

/**
 * What a club member buys: usually one membership, pack or training package,
 * sometimes with a piece of gear. Memberships and packs come one at a time.
 */
function pickClubItems(rand: ReturnType<typeof seeded>, catalog: SampleProduct[], max: number): OrderItem[] {
  const sold = catalog.filter((p) => !p.variants.some((x) => x.weightOz > 0));
  const gear = catalog.filter((p) => p.variants.some((x) => x.weightOz > 0));
  const count = rand.int(1, max);
  const items: OrderItem[] = [];
  for (let i = 0; i < count; i++) {
    const fromGear = gear.length > 0 && (i === 0 ? rand.chance(0.1) : rand.chance(0.7));
    const p = rand.pick(fromGear ? gear : sold);
    const variant = rand.pick(p.variants);
    if (items.some((x) => x.sku === variant.sku)) continue;
    const qty = variant.weightOz > 0 ? rand.int(1, 2) : 1;
    items.push({ productId: null, variantId: null, name: p.name, variant: Object.values(variant.options).join(" / "), sku: variant.sku, qty, unitCents: variant.priceCents, lineCents: variant.priceCents * qty });
  }
  return items;
}

// ---- Orders --------------------------------------------------------------------------

export function sampleOrders(tenant: SampleTenant, now = new Date()): OrderDetail[] {
  if (isClub(tenant)) return clubOrders(tenant, now);
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

/** A club's purchases: memberships, packs and training, with the odd piece of gear that ships. */
function clubOrders(tenant: SampleTenant, now: Date): OrderDetail[] {
  const rand = seeded(`${tenant.id}:${tenant.name}:orders`);
  const catalog = sampleCatalog(tenant);
  const buyers = clubBuyers(tenant);
  const total = rand.int(90, 160);
  const out: OrderDetail[] = [];
  for (let i = 0; i < total; i++) {
    const p = person(rand);
    const ageDays = Math.pow(i / total, 1.2) * 120 + rand.next() * 0.8;
    const paidAt = new Date(now.getTime() - ageDays * DAY - rand.int(0, 8) * 3_600_000);
    const items = pickClubItems(rand, catalog, 2);
    const subtotal = items.reduce((n, x) => n + x.lineCents, 0);
    const corporate = rand.chance(0.14) ? rand.pick(buyers) : null;
    const corporateOff = corporate ? Math.round(subtotal * 0.15) : 0;
    const code = !corporate && rand.chance(0.18) ? rand.pick(["FIRSTMONTH", "SUMMER15", "FRIENDS"]) : "";
    const discount = corporateOff + (code ? Math.round(subtotal * 0.1) : 0);
    const gearCents = items.filter((x) => ships(x.sku, catalog)).reduce((n, x) => n + x.lineCents, 0);
    const shipping = gearCents ? Math.round(600 + gearCents * 0.05 + rand.int(0, 300)) : 0;
    const tax = Math.round(gearCents * 0.078);
    const totalCents = subtotal - discount + shipping + tax;
    const ageHours = ageDays * 24;
    const fulfillment: FulfillmentStatus = !gearCents ? "none" : ageHours < 6 ? "pending" : ageHours < 40 ? "sent" : "shipped";
    const refunded = i > 3 && rand.chance(0.03);
    const status: OrderStatus = refunded ? (rand.chance(0.5) ? "refunded" : "partially_refunded") : "paid";
    const refundedCents = status === "refunded" ? totalCents : status === "partially_refunded" ? Math.round(totalCents * 0.3) : 0;
    const number = 1000 + total - i;
    const domain = corporate ? corporate.toLowerCase().replace(/[^a-z]+/g, "") : "";
    out.push({
      id: sampleUuid(`${tenant.id}:order:${i}`),
      number,
      source: i % 13 === 4 ? "estimate" : "checkout",
      status,
      fulfillment,
      email: corporate ? `${p.name.split(" ")[0].toLowerCase()}@${domain}.com` : p.email,
      name: p.name,
      itemCount: items.reduce((n, x) => n + x.qty, 0),
      totalCents,
      refundedCents,
      currency: "usd",
      paidAt,
      tradeCompany: corporate,
      phone: `(555) 01${rand.int(10, 99)}-${rand.int(1000, 9999)}`,
      shipTo: gearCents ? { name: p.name, company: "", line1: p.street, line2: "", city: p.city[0], state: p.city[1], postal: p.city[2], country: "US" } : {},
      items,
      subtotalCents: subtotal,
      discountCents: discount,
      shippingCents: shipping,
      taxCents: tax,
      discountCode: code,
      shippingService: shipping ? rand.pick(["USPS Ground Advantage", "USPS Ground Advantage", "USPS Priority Mail", "UPS Ground"]) : "",
      alert: { to: ["frontdesk@example.com"], at: paidAt.toISOString(), providerId: `re_${hashString(`${i}`).toString(16)}` },
      fulfillmentDetail: fulfillment === "none" ? {} : { provider: "shipstation", externalId: `se-${100000 + number}`, attempts: 1, at: paidAt.toISOString(), ...(fulfillment === "shipped" ? { tracking: `9400${hashString(`t${i}`).toString().padEnd(18, "0").slice(0, 18)}` } : {}) },
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
  if (isClub(tenant)) return clubEstimates(tenant, now);
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

type ClubQuote = { title: (company: string, first: string) => string; corporate: boolean; lines: (rand: ReturnType<typeof seeded>) => Omit<EstimateLine, "id" | "productId" | "variantId">[] };

// Quotes a club sends: corporate memberships for local employers, team events (team rides at the studio), PT bundles.
const CLUB_QUOTES: Record<string, ClubQuote[]> = {
  gym: [
    { title: (c) => `Corporate memberships for ${c}`, corporate: true, lines: (r) => [{ name: "Club membership, Annual", detail: "Corporate pricing, one per employee", qty: r.int(8, 40), unitCents: 89000 }] },
    { title: (c) => `Class packs for ${c} staff`, corporate: true, lines: (r) => [{ name: "Class pack, 20 classes", detail: "Shared out by your office", qty: r.int(5, 20), unitCents: 30000 }] },
    {
      title: (_, f) => `Personal training bundle for ${f}`,
      corporate: false,
      lines: () => [
        { name: "Personal training, 12 sessions", detail: "50 minutes each, within 90 days", qty: 1, unitCents: 72000 },
        { name: "Fitness assessment", detail: "Movement screen and a starting plan", qty: 1, unitCents: 4500 },
      ],
    },
    { title: (c) => `Small-group training for ${c}`, corporate: true, lines: (r) => [{ name: "Small-group training, 8 weeks", detail: "Two sessions a week, up to 8 people", qty: r.int(1, 3), unitCents: 160000 }] },
    {
      title: (c) => `Staff wellness day for ${c}`,
      corporate: true,
      lines: (r) => [
        { name: "Day pass", detail: "One per guest", qty: r.int(15, 60), unitCents: 2500 },
        { name: "Private group class", detail: "50 minutes with a coach", qty: 1, unitCents: 25000 },
      ],
    },
  ],
  studio: [
    {
      title: (c) => `Team ride for ${c}`,
      corporate: true,
      lines: (r) => [
        { name: "Private team ride", detail: "45 minutes, the whole room, up to 40 riders", qty: 1, unitCents: 60000 },
        { name: "Shoe rental", detail: "One per rider", qty: r.int(10, 40), unitCents: 300 },
      ],
    },
    { title: (c) => `Class packs for ${c} staff`, corporate: true, lines: (r) => [{ name: "Class pack, 10 classes", detail: "Corporate pricing", qty: r.int(6, 25), unitCents: 20000 }] },
    { title: (c) => `Unlimited memberships for ${c}`, corporate: true, lines: (r) => [{ name: "Unlimited monthly", detail: "Corporate pricing, per person per month", qty: r.int(5, 15), unitCents: 18900 }] },
    {
      title: (_, f) => `Birthday ride for ${f}`,
      corporate: false,
      lines: (r) => [
        { name: "Private ride", detail: "45 minutes, up to 25 riders", qty: 1, unitCents: 45000 },
        { name: "Grip socks", detail: "A pair for each guest", qty: r.int(8, 20), unitCents: 1400 },
      ],
    },
    { title: (c) => `First rides for ${c} new hires`, corporate: true, lines: (r) => [{ name: "First ride", detail: "Shoes included", qty: r.int(5, 15), unitCents: 1500 }] },
  ],
};

const CLUB_NOTES: Record<string, { notes: string; change: string }> = {
  gym: { notes: "Corporate pricing holds for 30 days. Memberships start on the first of the month after you approve.", change: "Can we start with 15 memberships and add the rest in the spring?" },
  studio: { notes: "Prices hold for 30 days. We book the ride once the invoice is paid.", change: "Could we move the ride to a Friday evening and add 10 more riders?" },
};

function clubEstimates(tenant: SampleTenant, now: Date): EstimateDetail[] {
  const rand = seeded(`${tenant.id}:${tenant.name}:estimates`);
  const buyers = clubBuyers(tenant);
  const quotes = CLUB_QUOTES[tenant.industry] ?? CLUB_QUOTES.gym;
  const words = CLUB_NOTES[tenant.industry] ?? CLUB_NOTES.gym;
  const statuses: EstimateStatus[] = ["draft", "sent", "sent", "viewed", "viewed", "changes_requested", "approved", "invoiced", "invoiced", "paid", "paid", "paid", "declined", "void"];
  const out: EstimateDetail[] = [];
  const count = rand.int(14, 20);
  for (let i = 0; i < count; i++) {
    const p = person(rand);
    const q = quotes[i % quotes.length];
    const company = q.corporate ? rand.pick(buyers) : "";
    const first = p.name.split(" ")[0];
    const status = i < statuses.length ? statuses[i] : rand.pick(statuses);
    const items: EstimateLine[] = q.lines(rand).map((x, n) => ({ id: `l${n}`, productId: null, variantId: null, ...x }));
    const discount = q.corporate && rand.chance(0.6) ? ({ kind: "percent", value: rand.pick([10, 15, 20]) } as const) : ({} as Record<string, never>);
    const t = estimateTotals(items, discount, 0);
    const createdAgo = rand.int(1, 70) * DAY;
    const sentAt = status === "draft" ? null : new Date(now.getTime() - createdAgo + DAY);
    const updatedAt = new Date(now.getTime() - createdAgo + rand.int(1, 5) * DAY);
    const validUntil = new Date(now.getTime() - createdAgo + 31 * DAY).toISOString().slice(0, 10);
    const email = company ? `${first.toLowerCase()}@${company.toLowerCase().replace(/[^a-z]+/g, "")}.com` : p.email;
    out.push({
      id: sampleUuid(`${tenant.id}:estimate:${i}`),
      number: 101 + count - i,
      status,
      title: q.title(company, first),
      client: { name: p.name, email, company, phone: `(555) 01${rand.int(10, 99)}-${rand.int(1000, 9999)}`, address: { line1: p.street, city: p.city[0], state: p.city[1], postal: p.city[2], country: "US" } },
      totalCents: t.totalCents,
      currency: "usd",
      sentAt,
      updatedAt: updatedAt > now ? now : updatedAt,
      validUntil,
      source: i === 3 ? "inquiry" : "team",
      items,
      discount,
      shippingCents: 0,
      subtotalCents: t.subtotalCents,
      discountCents: t.discountCents,
      notes: words.notes,
      internalNote: "",
      approvedName: ["approved", "invoiced", "paid"].includes(status) ? p.name : "",
      changeRequest: status === "changes_requested" ? words.change : "",
      delivery: sentAt ? { to: [email], at: sentAt.toISOString(), providerId: "re_sample" } : {},
      invoiceUrl: ["invoiced", "paid"].includes(status) ? "https://invoice.stripe.com/" : null,
      paidAt: status === "paid" ? updatedAt : null,
      viewedAt: ["viewed", "changes_requested", "approved", "invoiced", "paid", "declined"].includes(status) && sentAt ? new Date(sentAt.getTime() + 5 * 3_600_000) : null,
      orderId: null,
      contactId: null,
      tradeAccountId: null,
      events: [
        { kind: "created", actor: "team", detail: "", at: new Date(now.getTime() - createdAgo) },
        ...(sentAt ? [{ kind: "sent", actor: "team", detail: `Sent to ${email}`, at: sentAt }] : []),
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
  const club = isClub(tenant);
  for (let i = 0; i < count; i++) {
    const p = person(rand);
    const items = club ? pickClubItems(rand, catalog, 2) : pickItems(rand, catalog, 3);
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
  if (isClub(tenant)) return clubTrade(tenant, now);
  const rand = seeded(`${tenant.id}:${tenant.name}:trade`);
  const companies = COMPANIES[tenant.industry] ?? COMPANIES.general;
  return companies.map((company, i) => {
    const p = person(rand);
    const status = TRADE_STATUSES[i % TRADE_STATUSES.length];
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

/**
 * A club's corporate accounts. Spend and purchase counts add up the sample
 * purchases made on each account, so they never run past the purchases list.
 */
function clubTrade(tenant: SampleTenant, now: Date): TradeRow[] {
  const rand = seeded(`${tenant.id}:${tenant.name}:trade`);
  const companies = COMPANIES[tenant.industry] ?? COMPANIES.gym;
  const orders = clubOrders(tenant, now);
  return companies.map((company, i) => {
    const p = person(rand);
    const status = TRADE_STATUSES[i % TRADE_STATUSES.length];
    const theirs = orders.filter((o) => o.tradeCompany === company);
    const spendCents = theirs.reduce((n, o) => n + o.totalCents - o.refundedCents, 0);
    const firstPaid = theirs.length ? Math.min(...theirs.map((o) => o.paidAt.getTime())) : now.getTime();
    const appliedAt = new Date(Math.min(now.getTime() - rand.int(2, 300) * DAY, firstPaid - 5 * DAY));
    const domain = company.toLowerCase().replace(/[^a-z]+/g, "");
    const who = EMPLOYERS[company] ?? { kind: "Office", staff: 20, wants: "Memberships for staff who want one" };
    return {
      id: sampleUuid(`${tenant.id}:trade:${i}`),
      company,
      contactName: p.name,
      email: `${p.name.split(" ")[0].toLowerCase()}@${domain}.com`,
      phone: `(555) 01${rand.int(10, 99)}-${rand.int(1000, 9999)}`,
      website: `https://${domain}.com`,
      status,
      details: { type: who.kind, resale: `About ${who.staff} staff`, volume: who.wants, message: status === "applied" ? (who.message ?? "We'd like to offer memberships as a staff benefit this year.") : "" },
      note: status === "declined" ? "They asked for one shared membership for the whole team. Memberships are per person, so we suggested day passes for their staff event instead." : "",
      tierOverride: "",
      spendCents,
      orderCount: theirs.length,
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
