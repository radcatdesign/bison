// Marketing settings: the brand kit, signup form choices, the welcome offer and
// the search pack's business details. One row per company in
// marketing_settings, one JSON document per part, each checked here.
// The schemas work in the browser too, for the forms that edit them.
import { z } from "zod";
import { type BrandKit, defaultBrandKit, describeIssues, readBrandKit } from "@/lib/email/schema";
import { presetFor } from "@/lib/sample/industries";

// ---- Signup forms --------------------------------------------------------------

export const KIND_VALUE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const signupSettingsSchema = z
  .object({
    /** What the "I am a..." question says. */
    question: z.string().trim().min(1).max(40).default("I am a"),
    /** Stable values go to the database; labels are only what the form shows. */
    types: z
      .array(z.object({ value: z.string().regex(KIND_VALUE).max(40), label: z.string().trim().min(1).max(40) }))
      .max(8, "Up to 8 choices.")
      .default([]),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.types.forEach((t, i) => {
      if (seen.has(t.value)) ctx.addIssue({ code: "custom", path: ["types", i], message: "Two choices can't share a value." });
      seen.add(t.value);
    });
  });
export type SignupSettings = z.infer<typeof signupSettingsSchema>;

export function kindValueFor(label: string, taken: string[] = []): string {
  const base =
    label
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "type";
  let value = base;
  for (let n = 2; taken.includes(value); n++) value = `${base}-${n}`;
  return value;
}

// ---- Welcome offer -------------------------------------------------------------

export const offerSettingsSchema = z
  .object({
    on: z.boolean().default(false),
    kind: z.enum(["percent", "amount"]).default("percent"),
    value: z.number().positive().max(10_000).default(10),
    /** How many days each code works for. 0 means it doesn't expire. */
    days: z.number().int().min(0).max(365).default(30),
    prefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{2,12}$/, "Use 2 to 12 letters or numbers.")
      .default("WELCOME"),
    fine: z.string().trim().max(200).default(""),
  })
  .refine((o) => o.kind === "amount" || o.value <= 90, { message: "A percent off can be up to 90.", path: ["value"] });
export type OfferSettings = z.infer<typeof offerSettingsSchema>;

export function offerSummary(o: Pick<OfferSettings, "kind" | "value">, currency = "USD"): string {
  return o.kind === "percent" ? `${o.value}% off` : `${new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: o.value % 1 ? 2 : 0 }).format(o.value)} off`;
}

/** The line under each code: what it's worth, who it's for and when it ends. */
export function offerTerms(o: { kind: "percent" | "amount"; value: number; fine?: string }, expiresAt: Date | null, timeZone = "America/Los_Angeles"): string {
  const ends = expiresAt ? ` Use it by ${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone }).format(expiresAt)}.` : "";
  return `${offerSummary(o)} your first order. First-time buyers only, one per person.${ends}${o.fine ? ` ${o.fine}` : ""}`;
}

// ---- Search pack ---------------------------------------------------------------

export const BUSINESS_TYPES = {
  LocalBusiness: "Local business",
  HomeAndConstructionBusiness: "Home and construction",
  Store: "Store",
  CafeOrCoffeeShop: "Cafe or coffee shop",
  FoodEstablishment: "Food and drink",
  ProfessionalService: "Professional service",
  Organization: "Company (no storefront)",
} as const;
export type BusinessType = keyof typeof BUSINESS_TYPES;

const httpsUrl = z.string().trim().max(300).regex(/^https:\/\/[^\s<>"']+$/, "Use a full address starting with https://");

export const searchSettingsSchema = z.object({
  description: z.string().trim().max(600).default(""),
  offerings: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  areas: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(30).default(""),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(254)]).default(""),
  hours: z.string().trim().max(200).default(""),
  businessType: z.enum(Object.keys(BUSINESS_TYPES) as [BusinessType, ...BusinessType[]]).default("LocalBusiness"),
  profiles: z.array(httpsUrl).max(6).default([]),
  /** Whether AI crawlers (GPTBot, ClaudeBot, PerplexityBot and others) may read the pages. */
  allowAi: z.boolean().default(true),
  /** They told us the sitemap is in Google Search Console and Bing Webmaster Tools. */
  submitted: z.boolean().default(false),
});
export type SearchSettings = z.infer<typeof searchSettingsSchema>;

export function defaultBusinessType(industry: string): BusinessType {
  return industry === "pools" ? "HomeAndConstructionBusiness" : industry === "coffee" ? "CafeOrCoffeeShop" : "LocalBusiness";
}

// ---- All together --------------------------------------------------------------

export type MarketingSettings = { brand: BrandKit; signup: SignupSettings; offer: OfferSettings; search: SearchSettings };

export type SettingsTenant = { name: string; industry: string; accent: string; domain?: string };

export function defaultMarketingSettings(t: SettingsTenant): MarketingSettings {
  return {
    brand: defaultBrandKit(t.name, t.accent, t.domain),
    signup: { question: "I am a", types: presetFor(t.industry).signupTypes },
    offer: offerSettingsSchema.parse({}),
    search: searchSettingsSchema.parse({ businessType: defaultBusinessType(t.industry) }),
  };
}

function readPart<T>(schema: z.ZodType<T>, stored: unknown, fallback: T): T {
  if (!stored || typeof stored !== "object" || Object.keys(stored).length === 0) return fallback;
  const parsed = schema.safeParse({ ...(fallback as object), ...(stored as object) });
  return parsed.success ? parsed.data : fallback;
}

/** Reads stored settings, falling back to sensible defaults for anything missing. */
export function readMarketingSettings(row: { brand?: unknown; signup?: unknown; offer?: unknown; search?: unknown } | undefined, t: SettingsTenant): MarketingSettings {
  const d = defaultMarketingSettings(t);
  return {
    brand: readBrandKit(row?.brand, d.brand),
    signup: readPart(signupSettingsSchema, row?.signup, d.signup),
    offer: readPart(offerSettingsSchema, row?.offer, d.offer),
    search: readPart(searchSettingsSchema, row?.search, d.search),
  };
}

export class SettingsInputError extends Error {}

export function parseWith<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new SettingsInputError(describeIssues(r.error));
  return r.data;
}
