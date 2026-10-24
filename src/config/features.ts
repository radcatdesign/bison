// Every gated feature and the catalog items that grant it.
// can(tenant, feature) is true when the tenant has any one of these items.
import type { ItemKey } from "./catalog";

export const FEATURES = {
  // Base
  analytics: ["base"],
  "analytics.live": ["base"],
  "analytics.heatmaps": ["base"],
  "analytics.benchmarks": ["base"],
  contacts: ["base"],
  "contacts.export": ["base"],
  // The front desk kiosk. Fit Funnels only; joining from it also needs Sales.
  kiosk: ["base"],

  // Sales
  "sales.products": ["module:sales"],
  "sales.checkout": ["module:sales"],
  "sales.estimates": ["module:sales"],
  "sales.orders": ["module:sales"],
  "sales.discounts": ["module:sales"],
  "sales.trade": ["module:sales"],
  "sales.abandoned": ["module:sales"],

  // Marketing
  "marketing.newsletters": ["module:marketing"],
  "marketing.sequences": ["module:marketing"],
  "marketing.subscribers": ["module:marketing"],
  "marketing.brand-kit": ["module:marketing"],
  "marketing.welcome-offer": ["module:marketing"],
  "marketing.seo": ["module:marketing"],
  "marketing.pages": ["module:marketing"],
  "marketing.tests": ["module:marketing"],

  // AI Assistant
  "assistant.widget": ["module:assistant"],
  "assistant.coaching": ["module:assistant"],
  "assistant.chats": ["module:assistant"],

  // Add-ons
  "tools.calculator": ["addon:calculator"],
  "tools.configurator": ["addon:configurator"],
  "tools.knowledge-base": ["addon:knowledge-base"],
  "tools.gallery": ["addon:gallery"],
  "tools.translation": ["addon:translation"],
  "tools.push": ["addon:push"],
  "contacts.share": ["module:sales", "addon:contact-sharing"],
} as const satisfies Record<string, readonly ItemKey[]>;

export type FeatureKey = keyof typeof FEATURES;

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && value in FEATURES;
}
