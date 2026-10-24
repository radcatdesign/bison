// Words and tones for Sales statuses, shared by every Sales screen.
import type { EditionKey } from "@/config/editions";

export type Tone = "good" | "warn" | "bad" | "accent" | "neutral";

export const ESTIMATE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "accent" },
  viewed: { label: "Viewed", tone: "accent" },
  changes_requested: { label: "Changes requested", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  declined: { label: "Declined", tone: "bad" },
  invoiced: { label: "Invoiced", tone: "accent" },
  paid: { label: "Paid", tone: "good" },
  void: { label: "Void", tone: "neutral" },
};

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  paid: { label: "Paid", tone: "good" },
  partially_refunded: { label: "Partly refunded", tone: "warn" },
  refunded: { label: "Refunded", tone: "neutral" },
  canceled: { label: "Canceled", tone: "neutral" },
};

export const FULFILLMENT: Record<string, { label: string; tone: Tone }> = {
  none: { label: "No fulfillment", tone: "neutral" },
  pending: { label: "Sending to ShipStation", tone: "accent" },
  sent: { label: "In ShipStation", tone: "accent" },
  failed: { label: "Didn't reach ShipStation", tone: "bad" },
  shipped: { label: "Shipped", tone: "good" },
};

export const CART_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Still shopping", tone: "accent" },
  checkout: { label: "At checkout", tone: "accent" },
  abandoned: { label: "Left behind", tone: "warn" },
  ordered: { label: "Bought", tone: "good" },
  inquiry: { label: "Asked for a quote", tone: "accent" },
};

export const TRADE_STATUS: Record<string, { label: string; tone: Tone }> = {
  applied: { label: "Waiting for you", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  declined: { label: "Declined", tone: "neutral" },
  paused: { label: "Paused", tone: "neutral" },
};

export const SOURCE: Record<string, string> = { checkout: "Shop", estimate: "Estimate", free: "Free order" };

export function pillClass(tone: Tone): string {
  return tone === "good" ? "pill pill-good" : tone === "warn" ? "pill pill-warn" : tone === "bad" ? "pill pill-bad" : tone === "accent" ? "pill pill-accent" : "pill";
}

// ---- Fit Funnels ------------------------------------------------------------------------
// A club's words for the same statuses: purchases, joins and corporate accounts.
// Tones stay the same; only labels that read wrong for a club change.

const FIT_LABELS = {
  ORDER_STATUS: {},
  FULFILLMENT: { none: "Nothing to ship" },
  CART_STATUS: { open: "Still choosing", abandoned: "Didn't finish", ordered: "Finished" },
  TRADE_STATUS: {},
  ESTIMATE_STATUS: {},
} satisfies Record<string, Record<string, string>>;

const FIT_SOURCE: Record<string, string> = { checkout: "Online", estimate: "Quote", free: "Free purchase" };

function withFit(base: Record<string, { label: string; tone: Tone }>, fit: Record<string, string>): Record<string, { label: string; tone: Tone }> {
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, fit[k] ? { ...v, label: fit[k] } : v]));
}

/** Every Sales status in this edition's words. Bison Ops gets the tables above as they are. */
export function salesLabels(edition: EditionKey) {
  if (edition !== "fit") return { ESTIMATE_STATUS, ORDER_STATUS, FULFILLMENT, CART_STATUS, TRADE_STATUS, SOURCE };
  return {
    ESTIMATE_STATUS: withFit(ESTIMATE_STATUS, FIT_LABELS.ESTIMATE_STATUS),
    ORDER_STATUS: withFit(ORDER_STATUS, FIT_LABELS.ORDER_STATUS),
    FULFILLMENT: withFit(FULFILLMENT, FIT_LABELS.FULFILLMENT),
    CART_STATUS: withFit(CART_STATUS, FIT_LABELS.CART_STATUS),
    TRADE_STATUS: withFit(TRADE_STATUS, FIT_LABELS.TRADE_STATUS),
    SOURCE: FIT_SOURCE,
  };
}
