// The two editions of the product. Same tools and the same data model; each
// edition has its own name, mark, default color and words. A company is in one
// edition, set when it's created (tenants.edition). Pure and browser-safe.
//
// Words that change between editions are written at the place they're used,
// with `say("Bison Ops words", "Fit Funnels words")`, so each sentence reads
// right in both. Labels used in many places (nav, modules) live here.
import { CATALOG, type ItemKey } from "./catalog";
import type { NavGroupKey } from "./modes";

export type EditionKey = "bison" | "fit";
export const EDITION_KEYS = ["bison", "fit"] as const satisfies readonly EditionKey[];

export type Edition = {
  key: EditionKey;
  productName: string;
  shortName: string;
  maker: string;
  /** The accent a new company starts with. Companies can recolor. */
  defaultAccent: string;
  /** Who it's for, in a few words, for the sign-in and onboarding. */
  audience: string;
  /** The line on the sign-in page. */
  pitch: string;
  /** Kinds of business a company in this edition can pick. The first is the default. */
  industries: string[];
  /** The preview chart's label on the sign-in page. */
  previewLabel: string;
  /** Nav labels that differ from the page's usual name, by href. */
  pageLabels: Partial<Record<string, string>>;
  /** Nav category names that differ. */
  groupLabels: Partial<Record<NavGroupKey, string>>;
  /** Module and add-on names and pitches that differ. */
  items: Partial<Record<ItemKey, { name?: string; pitch?: string }>>;
};

export const EDITIONS: Record<EditionKey, Edition> = {
  bison: {
    key: "bison",
    productName: "Bison Ops",
    shortName: "Bison Ops",
    maker: "Bison by RADCAT",
    defaultAccent: "#3b5bff",
    audience: "businesses that sell from their website",
    pitch: "Every visitor, every lead and every sale from your website, in one place.",
    industries: ["pools", "coffee", "general"],
    previewLabel: "Visitors",
    pageLabels: {},
    groupLabels: {},
    items: {},
  },
  fit: {
    key: "fit",
    productName: "Fit Funnels",
    shortName: "Fit Funnels",
    maker: "Bison by RADCAT",
    defaultAccent: "#f76b15",
    audience: "gyms, health clubs and fitness studios",
    pitch: "Every visitor, every trial and every new member from your club's website, in one place.",
    industries: ["gym", "studio"],
    previewLabel: "Trial sign-ups",
    pageLabels: {
      "/analyze/contacts": "Leads",
      "/marketing/pages": "Funnel pages",
      "/marketing/offer": "Intro offer",
      "/sales/estimates": "Quotes",
      "/sales/orders": "Purchases",
      "/sales/products": "Memberships",
      "/sales/discounts": "Promo codes",
      "/sales/trade": "Corporate accounts",
      "/sales/carts": "Unfinished joins",
    },
    groupLabels: { web: "Funnels and tests", catalog: "Memberships and checkout" },
    items: {
      base: { pitch: "Visitors, pages, heatmaps and the live view, plus one inbox for every trial, tour and class request from your site. Included with every club." },
      "module:sales": { name: "Membership sales", pitch: "Sell memberships, class packs and personal training on your site, send corporate quotes people approve online, and run corporate accounts. Payments go straight to your own Stripe account." },
      "module:marketing": { pitch: "Funnel pages you build by telling an agent what you want, plus newsletters, automatic follow-ups for new leads and members, and an intro offer, all in your club's colors." },
      "module:assistant": { pitch: "A chat assistant on your site that answers from your own pages, schedule and memberships. Your team can correct it in plain words." },
      "addon:calculator": { name: "Membership calculator", pitch: "Visitors see what a membership costs with the extras they want, then email themselves the result. You get the lead." },
      "addon:configurator": { name: "Plan builder", pitch: "Visitors build a plan from your memberships, classes and training, and send it to you as a quote." },
      "addon:knowledge-base": { name: "Member library", pitch: "Workout guides, class notes and club policies in a clean viewer on your site, with an optional email gate and read tracking." },
      "addon:gallery": { name: "Club gallery", pitch: "Your floor, studios, classes and events in categories. The assistant can show it too." },
      "addon:push": { pitch: "New trial requests and chats show up on your team's phones the moment they happen." },
      "addon:contact-sharing": { pitch: "Send a private, read-only page of what someone sent you to a trainer or another location. Links expire in 30 days." },
    },
  },
};

export const isEditionKey = (v: unknown): v is EditionKey => v === "bison" || v === "fit";

export const editionFor = (key: unknown): Edition => EDITIONS[isEditionKey(key) ? key : "bison"];

/** The words for one edition: `say("Products", "Memberships")`. */
export type Say = (bison: string, fit: string) => string;
export const sayFor =
  (key: EditionKey | Edition): Say =>
  (bison, fit) =>
    (typeof key === "string" ? key : key.key) === "fit" ? fit : bison;

/** Which edition a kind of business belongs to, for companies made before editions. */
export const editionOfIndustry = (industry: string): EditionKey => (EDITIONS.fit.industries.includes(industry) ? "fit" : "bison");

/** A module's or add-on's name and pitch in this edition. */
export function itemOf(edition: Edition | EditionKey, key: ItemKey): { name: string; pitch: string } {
  const e = typeof edition === "string" ? EDITIONS[edition] : edition;
  const o = e.items[key];
  return { name: o?.name ?? CATALOG[key].name, pitch: o?.pitch ?? CATALOG[key].pitch };
}
