// Everything Bison Ops sells, in one place. Change prices and limits here.
// Prices are placeholders until pricing is decided (see docs/decisions.md).
// Stripe price ids come from env vars so test and live accounts can differ.

export type ModuleKey = "sales" | "marketing" | "assistant";
export type AddonKey =
  | "calculator"
  | "configurator"
  | "knowledge-base"
  | "gallery"
  | "translation"
  | "push"
  | "contact-sharing";
export type ItemKey = "base" | `module:${ModuleKey}` | `addon:${AddonKey}`;
export type PaidItemKey = Exclude<ItemKey, "base">;

export type Price = {
  amount: number; // whole dollars per interval
  currency: "usd";
  interval: "month";
  /** True until real pricing is set. The UI says "Placeholder price" while this is on. */
  placeholder: boolean;
};

export type Limits = Partial<{
  sites: number;
  seats: number;
  retentionDays: number;
  eventsPerMonth: number;
  emailSendsPerMonth: number;
  subscribers: number;
  answersPerMonth: number;
  answersPerVisitorPerDay: number;
  translatedStringsPerMonth: number;
  translatedStringsPerVisitorPerDay: number;
  pageAgentRunsPerMonth: number;
  products: number;
  tradeAccounts: number;
}>;

export type CatalogItem = {
  key: ItemKey;
  kind: "base" | "module" | "addon";
  name: string;
  /** One or two plain sentences shown on locked screens and in billing. */
  pitch: string;
  price: Price;
  limits: Limits;
  trialDays: number;
  /** Env var holding the Stripe price id for this item. */
  stripePriceEnv?: string;
  /** Modules that already include this add-on. */
  includedWith?: PaidItemKey[];
};

const placeholder = (amount: number): Price => ({ amount, currency: "usd", interval: "month", placeholder: true });

export const CATALOG: Record<ItemKey, CatalogItem> = {
  base: {
    key: "base",
    kind: "base",
    name: "Analytics",
    pitch: "Visitors, pages, heatmaps and the live view, plus a contacts inbox for every form on your site. Included with every account.",
    price: placeholder(0),
    limits: { sites: 1, seats: 5, retentionDays: 400, eventsPerMonth: 100_000 },
    trialDays: 0,
  },
  "module:sales": {
    key: "module:sales",
    kind: "module",
    name: "Sales",
    pitch: "Send estimates people approve online, turn them into invoices, and take orders on your site. Payments go straight to your own Stripe account.",
    price: placeholder(149),
    limits: { products: 2_000, tradeAccounts: 500 },
    trialDays: 14,
    stripePriceEnv: "STRIPE_PRICE_SALES",
  },
  "module:marketing": {
    key: "module:marketing",
    kind: "module",
    name: "Marketing",
    pitch: "Landing pages you build by telling an agent what you want, plus newsletters, automatic email series and a welcome offer, all in your own colors.",
    price: placeholder(99),
    limits: { emailSendsPerMonth: 10_000, subscribers: 5_000, pageAgentRunsPerMonth: 300 },
    trialDays: 14,
    stripePriceEnv: "STRIPE_PRICE_MARKETING",
  },
  "module:assistant": {
    key: "module:assistant",
    kind: "module",
    name: "AI Assistant",
    pitch: "A chat assistant on your site that answers from your own pages, products and documents. Your team can correct it in plain words.",
    price: placeholder(99),
    limits: { answersPerMonth: 2_000, answersPerVisitorPerDay: 20 },
    trialDays: 14,
    stripePriceEnv: "STRIPE_PRICE_ASSISTANT",
  },
  "addon:calculator": {
    key: "addon:calculator",
    kind: "addon",
    name: "Quote calculator",
    pitch: "Visitors price a job on your site and email themselves the result. You get the lead.",
    price: placeholder(29),
    limits: {},
    trialDays: 14,
    stripePriceEnv: "STRIPE_PRICE_CALCULATOR",
  },
  "addon:configurator": {
    key: "addon:configurator",
    kind: "addon",
    name: "Visual configurator",
    pitch: "Visitors drag your products onto a layout, get a parts list, and send it to you as an estimate.",
    price: placeholder(49),
    limits: {},
    trialDays: 14,
    stripePriceEnv: "STRIPE_PRICE_CONFIGURATOR",
  },
  "addon:knowledge-base": {
    key: "addon:knowledge-base",
    kind: "addon",
    name: "Document library",
    pitch: "Spec sheets and guides in a clean viewer on your site, with an optional email gate and read tracking.",
    price: placeholder(19),
    limits: {},
    trialDays: 14,
    stripePriceEnv: "STRIPE_PRICE_KNOWLEDGE_BASE",
  },
  "addon:gallery": {
    key: "addon:gallery",
    kind: "addon",
    name: "Project gallery",
    pitch: "Your finished work in categories, with before and after pairs. The assistant can show it too.",
    price: placeholder(19),
    limits: {},
    trialDays: 14,
    stripePriceEnv: "STRIPE_PRICE_GALLERY",
  },
  "addon:translation": {
    key: "addon:translation",
    kind: "addon",
    name: "Site translation",
    pitch: "A language switcher that translates your whole site in place. Your team can correct any line.",
    price: placeholder(39),
    limits: { translatedStringsPerMonth: 20_000, translatedStringsPerVisitorPerDay: 400 },
    trialDays: 14,
    stripePriceEnv: "STRIPE_PRICE_TRANSLATION",
  },
  "addon:push": {
    key: "addon:push",
    kind: "addon",
    name: "Push notifications",
    pitch: "New forms and chats show up on your team's phones the moment they happen.",
    price: placeholder(9),
    limits: {},
    trialDays: 14,
    stripePriceEnv: "STRIPE_PRICE_PUSH",
  },
  "addon:contact-sharing": {
    key: "addon:contact-sharing",
    kind: "addon",
    name: "Shared contact pages",
    pitch: "Send a private, read-only page of what someone sent you to a partner or installer. Links expire in 30 days.",
    price: placeholder(9),
    limits: {},
    trialDays: 14,
    stripePriceEnv: "STRIPE_PRICE_CONTACT_SHARING",
    includedWith: ["module:sales"],
  },
};

export const PAID_ITEMS = Object.values(CATALOG).filter((i) => i.kind !== "base") as (CatalogItem & { key: PaidItemKey })[];
export const MODULES = PAID_ITEMS.filter((i) => i.kind === "module");
export const ADDONS = PAID_ITEMS.filter((i) => i.kind === "addon");

export function isPaidItemKey(value: unknown): value is PaidItemKey {
  return typeof value === "string" && value !== "base" && value in CATALOG;
}

export function formatPrice(price: Price): string {
  if (price.amount === 0) return "Included";
  return `$${price.amount}/mo`;
}

/** Stripe price id for an item, or null when that env var isn't set. */
export function stripePriceFor(key: PaidItemKey): string | null {
  const envName = CATALOG[key].stripePriceEnv;
  return (envName && process.env[envName]) || null;
}

/** Reverse lookup used by the Stripe webhook. */
export function itemForStripePrice(priceId: string): PaidItemKey | null {
  for (const item of PAID_ITEMS) {
    if (item.stripePriceEnv && process.env[item.stripePriceEnv] === priceId) return item.key;
  }
  return null;
}
