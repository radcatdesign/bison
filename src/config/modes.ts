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
    pages: [{ href: "/marketing", label: "Overview", feature: "marketing.newsletters" }],
  },
  {
    key: "sales",
    label: "Sales",
    item: "module:sales",
    feature: "sales.estimates",
    pages: [{ href: "/sales", label: "Overview", feature: "sales.estimates" }],
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
