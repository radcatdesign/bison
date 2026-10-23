// Words and tones for Sales statuses, shared by every Sales screen.

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
