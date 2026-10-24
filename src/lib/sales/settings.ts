// Sales settings: the store (currency, checkout, order limits, alerts, estimate
// defaults), shipping (where it ships from, boxes, how it's charged) and the
// trade program (tiers by 12-month spend). Pure: shared by the server, the
// demo and tests. Stored as JSON documents in sales_settings.
import { z } from "zod";
import type { EditionKey } from "@/config/editions";
import { describeIssues } from "@/lib/email/schema";

const email = z.string().trim().toLowerCase().email("Use a full email address.").max(254);
const text = (max: number) => z.string().trim().max(max).default("");
const cents = z.number().int().min(0).max(100_000_000);
const key = z.string().regex(/^[a-z0-9-]{1,40}$/, "Use lowercase letters, numbers and dashes.");

// ---- Addresses -------------------------------------------------------------------

export const addressSchema = z.object({
  name: text(120),
  company: text(120),
  phone: text(40),
  line1: text(200),
  line2: text(200),
  city: text(100),
  state: text(60),
  postal: text(20),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a two-letter country code, like US.")
    .default("US"),
});
export type Address = z.infer<typeof addressSchema>;

export const EMPTY_ADDRESS: Address = { name: "", company: "", phone: "", line1: "", line2: "", city: "", state: "", postal: "", country: "US" };

/** Enough of an address for a carrier to rate and ship it. */
export function addressComplete(a: Partial<Address> | null | undefined): boolean {
  return Boolean(a?.line1?.trim() && a.city?.trim() && a.postal?.trim() && a.country?.trim() && (a.country !== "US" || a.state?.trim()));
}

export function addressLines(a: Partial<Address>): string[] {
  const cityLine = [a.city, [a.state, a.postal].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [a.name, a.company, a.line1, a.line2, cityLine, a.country && a.country !== "US" ? a.country : ""].filter((x): x is string => Boolean(x && x.trim()));
}

// ---- Store ------------------------------------------------------------------------

export const storeSettingsSchema = z.object({
  /** Three-letter currency code. Prices, orders and invoices use it. */
  currency: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{3}$/)
    .default("usd"),
  /** The public shop page lists active products. Product pages work either way. */
  shopOn: z.boolean().default(true),
  /** Who gets an email for each paid order, estimate reply, cart inquiry and trade application. */
  alertEmails: z.array(email).max(10).default([]),
  checkout: z
    .object({
      /** Countries the shop ships to. */
      countries: z
        .array(z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/))
        .min(1)
        .max(60)
        .default(["US"]),
      collectPhone: z.boolean().default(true),
      /** Sales tax through Stripe Tax. Needs Stripe Tax turned on in the Stripe account. */
      tax: z.boolean().default(false),
      /** A line under the Pay button, like a returns policy. */
      note: text(300),
    })
    .default({ countries: ["US"], collectPhone: true, tax: false, note: "" }),
  /** Above either limit, checkout becomes "Ask for a quote", which lands as a draft estimate. */
  inquiry: z
    .object({
      on: z.boolean().default(false),
      overCents: cents.nullable().default(null),
      overQuantity: z.number().int().min(1).max(100_000).nullable().default(null),
      message: text(300),
    })
    .default({ on: false, overCents: null, overQuantity: null, message: "" }),
  estimates: z
    .object({
      /** How long an estimate stays open, in days. */
      validDays: z.number().int().min(1).max(365).default(30),
      /** Days the client has to pay the invoice. */
      dueDays: z.number().int().min(0).max(120).default(14),
      /** Shown on every estimate, like deposit or warranty terms. */
      terms: text(2000),
    })
    .default({ validDays: 30, dueDays: 14, terms: "" }),
  /** A cart counts as left behind after this many quiet hours, once we have an email. */
  abandonedAfterHours: z.number().int().min(1).max(168).default(4),
});
export type StoreSettings = z.infer<typeof storeSettingsSchema>;

// ---- Shipping ---------------------------------------------------------------------

export const boxSchema = z.object({
  key,
  name: z.string().trim().min(1, "Name the box.").max(60),
  lengthIn: z.number().positive().max(200),
  widthIn: z.number().positive().max(200),
  heightIn: z.number().positive().max(200),
  /** The most it can hold, contents and box together, in pounds. */
  maxWeightLb: z.number().positive().max(2000),
  /** What the empty box weighs, in ounces. */
  emptyWeightOz: z.number().min(0).max(2000).default(0),
});
export type Box = z.infer<typeof boxSchema>;

export const RATE_SOURCES = ["carrier", "flat", "free"] as const;
export type RateSource = (typeof RATE_SOURCES)[number];
export const CARRIERS = ["shipstation", "ups"] as const;
export type CarrierKey = (typeof CARRIERS)[number];

export const shippingSettingsSchema = z.object({
  /** Where orders ship from. Carriers rate from here. */
  from: addressSchema.default(EMPTY_ADDRESS),
  boxes: z.array(boxSchema).max(30).default([]),
  /** carrier: live rates from a connected carrier. flat: a set charge. free: no charge. */
  source: z.enum(RATE_SOURCES).default("flat"),
  carrier: z.enum(CARRIERS).nullable().default(null),
  /** Only offer these services (carrier service codes). Empty offers everything the carrier returns. */
  services: z.array(z.string().trim().max(60)).max(30).default([]),
  /** The most options to show at checkout, cheapest first. */
  maxOptions: z.number().int().min(1).max(8).default(4),
  flat: z
    .object({ perOrderCents: cents.default(0), perItemCents: cents.default(0), label: z.string().trim().max(60).default("Standard shipping") })
    .default({ perOrderCents: 0, perItemCents: 0, label: "Standard shipping" }),
  /** Added to every rate, for packing materials and time. */
  handlingCents: cents.default(0),
  /** Orders at or above this subtotal (after discounts) ship free. Null turns it off. */
  freeOverCents: cents.nullable().default(null),
  /** Ships to a person's home unless they give a company name. Carriers charge more for homes. */
  residentialDefault: z.boolean().default(true),
  /** Paid orders go here to be packed and labeled. */
  fulfillment: z.enum(["none", "shipstation"]).default("none"),
});
export type ShippingSettings = z.infer<typeof shippingSettingsSchema>;

export const DEFAULT_BOXES: Box[] = [
  { key: "small", name: "Small box", lengthIn: 10, widthIn: 8, heightIn: 4, maxWeightLb: 10, emptyWeightOz: 6 },
  { key: "medium", name: "Medium box", lengthIn: 14, widthIn: 12, heightIn: 8, maxWeightLb: 30, emptyWeightOz: 12 },
  { key: "large", name: "Large box", lengthIn: 20, widthIn: 16, heightIn: 12, maxWeightLb: 50, emptyWeightOz: 20 },
];

// ---- Trade ------------------------------------------------------------------------

export const tierSchema = z.object({
  key,
  name: z.string().trim().min(1, "Name the tier.").max(40),
  /** Spend over the last 12 months (after discounts, before tax and shipping) that reaches this tier. */
  minSpendCents: cents,
  percentOff: z.number().min(0).max(90),
});
export type Tier = z.infer<typeof tierSchema>;

export const tradeSettingsSchema = z.object({
  /** The application form at /p/<company>/trade takes new applications. */
  open: z.boolean().default(true),
  tiers: z
    .array(tierSchema)
    .min(1, "Keep at least one tier.")
    .max(8)
    .refine((t) => new Set(t.map((x) => x.key)).size === t.length, "Each tier needs its own key.")
    .default([
      { key: "trade", name: "Trade", minSpendCents: 0, percentOff: 10 },
      { key: "pro", name: "Pro", minSpendCents: 500_000, percentOff: 15 },
      { key: "partner", name: "Partner", minSpendCents: 2_000_000, percentOff: 20 },
    ]),
  /** A few lines at the top of the application form. */
  intro: text(600),
});
export type TradeSettings = z.infer<typeof tradeSettingsSchema>;

/** Fit Funnels clubs start with corporate tier names; the spend steps and discounts match. */
export const CLUB_TIERS: Tier[] = [
  { key: "team", name: "Team", minSpendCents: 0, percentOff: 10 },
  { key: "business", name: "Business", minSpendCents: 500_000, percentOff: 15 },
  { key: "partner", name: "Partner", minSpendCents: 2_000_000, percentOff: 20 },
];

/** The trade program a company starts with before it saves its own. */
export function defaultTradeSettings(edition: EditionKey = "bison"): TradeSettings {
  return tradeSettingsSchema.parse(edition === "fit" ? { tiers: CLUB_TIERS } : {});
}

/** The tier an account reaches with this much 12-month spend. Tiers are matched highest first. */
export function tierFor(tiers: Tier[], spendCents: number, override = ""): Tier {
  const sorted = [...tiers].sort((a, b) => b.minSpendCents - a.minSpendCents);
  if (override) {
    const forced = tiers.find((t) => t.key === override);
    if (forced) return forced;
  }
  return sorted.find((t) => spendCents >= t.minSpendCents) ?? sorted[sorted.length - 1];
}

/** The next tier up, and how much more spend reaches it. Null at the top. */
export function nextTier(tiers: Tier[], spendCents: number): { tier: Tier; moreCents: number } | null {
  const up = [...tiers].sort((a, b) => a.minSpendCents - b.minSpendCents).find((t) => t.minSpendCents > spendCents);
  return up ? { tier: up, moreCents: up.minSpendCents - spendCents } : null;
}

// ---- All together -----------------------------------------------------------------

export type SalesSettings = { store: StoreSettings; shipping: ShippingSettings; trade: TradeSettings };

export function defaultSalesSettings(alertEmails: string[] = [], edition: EditionKey = "bison"): SalesSettings {
  return {
    store: storeSettingsSchema.parse({ alertEmails }),
    shipping: shippingSettingsSchema.parse({ boxes: DEFAULT_BOXES }),
    trade: defaultTradeSettings(edition),
  };
}

function readPart<T>(schema: z.ZodType<T>, stored: unknown, fallback: T): T {
  if (!stored || typeof stored !== "object" || Object.keys(stored).length === 0) return fallback;
  const parsed = schema.safeParse({ ...(fallback as object), ...(stored as object) });
  return parsed.success ? parsed.data : fallback;
}

export function readSalesSettings(row: { store?: unknown; shipping?: unknown; trade?: unknown } | undefined, alertEmails: string[] = [], edition: EditionKey = "bison"): SalesSettings {
  const d = defaultSalesSettings(alertEmails, edition);
  return {
    store: readPart(storeSettingsSchema, row?.store, d.store),
    shipping: readPart(shippingSettingsSchema, row?.shipping, d.shipping),
    trade: readPart(tradeSettingsSchema, row?.trade, d.trade),
  };
}

export class SalesInputError extends Error {}

export function parseSales<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new SalesInputError(describeIssues(r.error));
  return r.data;
}
