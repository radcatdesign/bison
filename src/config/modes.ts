// The portal's three modes, in order, and the pages inside each.
import type { PaidItemKey } from "./catalog";
import type { FeatureKey } from "./features";

export type ModeKey = "analyze" | "marketing" | "sales";

export type PageSpec = { href: string; label: string; feature: FeatureKey };

export type ModeSpec = {
  key: ModeKey;
  label: string;
  /** The module that unlocks this mode. Analyze is part of the base plan. */
  item: PaidItemKey | null;
  /** Feature checked to decide if the mode is unlocked. */
  feature: FeatureKey;
  pages: PageSpec[];
};

export const MODES: ModeSpec[] = [
  {
    key: "analyze",
    label: "Analyze",
    item: null,
    feature: "analytics",
    pages: [
      { href: "/analyze", label: "Overview", feature: "analytics" },
      { href: "/analyze/pages", label: "Landing pages", feature: "analytics" },
      { href: "/analyze/contacts", label: "Contacts", feature: "contacts" },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    item: "module:marketing",
    feature: "marketing.newsletters",
    pages: [
      { href: "/marketing", label: "Overview", feature: "marketing.newsletters" },
      { href: "/marketing/setup", label: "Setup", feature: "marketing.newsletters" },
      { href: "/marketing/newsletters", label: "Newsletters", feature: "marketing.newsletters" },
      { href: "/marketing/series", label: "Email series", feature: "marketing.sequences" },
      { href: "/marketing/subscribers", label: "Subscribers", feature: "marketing.subscribers" },
      { href: "/marketing/pages", label: "Pages", feature: "marketing.pages" },
      { href: "/marketing/brand", label: "Brand kit", feature: "marketing.brand-kit" },
      { href: "/marketing/offer", label: "Welcome offer", feature: "marketing.welcome-offer" },
      { href: "/marketing/search", label: "Search pack", feature: "marketing.seo" },
    ],
  },
  {
    key: "sales",
    label: "Sales",
    item: "module:sales",
    feature: "sales.estimates",
    pages: [
      { href: "/sales", label: "Overview", feature: "sales.estimates" },
      { href: "/sales/setup", label: "Setup", feature: "sales.estimates" },
      { href: "/sales/estimates", label: "Estimates", feature: "sales.estimates" },
      { href: "/sales/orders", label: "Orders", feature: "sales.orders" },
      { href: "/sales/products", label: "Products", feature: "sales.products" },
      { href: "/sales/discounts", label: "Discount codes", feature: "sales.discounts" },
      { href: "/sales/trade", label: "Trade accounts", feature: "sales.trade" },
      { href: "/sales/carts", label: "Carts", feature: "sales.abandoned" },
      { href: "/sales/checkout", label: "Checkout", feature: "sales.checkout" },
    ],
  },
];

export const MODE_KEYS = MODES.map((m) => m.key);

export function isModeKey(value: unknown): value is ModeKey {
  return typeof value === "string" && (MODE_KEYS as string[]).includes(value);
}

export function modeForPath(pathname: string): ModeKey | null {
  const first = pathname.split("/")[1];
  return isModeKey(first) ? first : null;
}

export const MODE_COOKIE = "bo_mode";
