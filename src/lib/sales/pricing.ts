// Prices a cart. Pure: the database layer looks up products, codes and the
// buyer's trade tier, and this turns them into lines and totals. Everything a
// shopper sees and everything sent to Stripe comes from here, so the browser
// never decides a price.
import { variantLabel } from "./catalog";
import type { DiscountCheck } from "./discounts";
import { percentOf } from "./money";
import type { StoreSettings } from "./settings";

export const MAX_LINE_QTY = 999;
export const MAX_LINES = 100;

export type CartItem = { variantId: string; qty: number };

export type VariantForPricing = {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  productStatus: "active" | "draft" | "archived";
  productOptions: { name: string }[];
  photo: string | null;
  taxCode: string;
  options: Record<string, string>;
  sku: string;
  priceCents: number;
  compareAtCents: number | null;
  active: boolean;
  weightOz: number;
  box: string;
  unitsPerBox: number;
  shipsAlone: boolean;
  flatShipCents: number | null;
};

export type PricedLine = {
  variantId: string;
  productId: string;
  name: string;
  variant: string;
  slug: string;
  sku: string;
  photo: string | null;
  taxCode: string;
  qty: number;
  /** The price on the product page. */
  listUnitCents: number;
  /** What this buyer pays each, after trade pricing. */
  unitCents: number;
  compareAtCents: number | null;
  lineCents: number;
  shipping: { weightOz: number; box: string; unitsPerBox: number; shipsAlone: boolean; flatShipCents: number | null };
};

export type PricedCart = {
  lines: PricedLine[];
  itemCount: number;
  /** After trade pricing, before codes. */
  subtotalCents: number;
  discount: { code: string; amountCents: number; label: string } | null;
  /** Why the code in the cart doesn't work right now. */
  discountError: string | null;
  /** Subtotal less the code. Shipping and tax come later. */
  merchandiseCents: number;
  freeShipping: boolean;
  trade: { name: string; percentOff: number } | null;
  /** Set when this order is big enough that the team quotes it instead. */
  inquiry: { reason: string } | null;
  /** Things that changed since the shopper added them, said plainly. */
  notices: string[];
  currency: string;
};

/** Merges repeats and drops nonsense, so a cart can't hold 0 or a million of something. */
export function cleanItems(items: unknown): CartItem[] {
  if (!Array.isArray(items)) return [];
  const merged = new Map<string, number>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const { variantId, qty } = raw as { variantId?: unknown; qty?: unknown };
    if (typeof variantId !== "string" || !/^[0-9a-f-]{36}$/.test(variantId)) continue;
    const n = typeof qty === "number" && Number.isFinite(qty) ? Math.floor(qty) : 0;
    if (n <= 0) continue;
    merged.set(variantId, Math.min(MAX_LINE_QTY, (merged.get(variantId) ?? 0) + n));
  }
  return [...merged.entries()].slice(0, MAX_LINES).map(([variantId, qty]) => ({ variantId, qty }));
}

export type PriceInput = {
  items: CartItem[];
  variants: Map<string, VariantForPricing>;
  currency: string;
  trade: { name: string; percentOff: number } | null;
  /** The code's result, worked out against the subtotal this function returns first. */
  discount?: (subtotalCents: number) => (DiscountCheck & { code: string }) | null;
  inquiry: StoreSettings["inquiry"];
};

export function priceCart(input: PriceInput): PricedCart {
  const notices: string[] = [];
  const lines: PricedLine[] = [];
  for (const item of input.items) {
    const v = input.variants.get(item.variantId);
    if (!v || v.productStatus !== "active" || !v.active) {
      notices.push(v ? `${v.productName} isn't available anymore, so it was taken out of your cart.` : "Something in your cart isn't available anymore, so it was taken out.");
      continue;
    }
    const tradePct = input.trade?.percentOff ?? 0;
    const unitCents = tradePct ? v.priceCents - percentOf(v.priceCents, tradePct) : v.priceCents;
    lines.push({
      variantId: v.variantId,
      productId: v.productId,
      name: v.productName,
      variant: variantLabel(v.options, v.productOptions),
      slug: v.productSlug,
      sku: v.sku,
      photo: v.photo,
      taxCode: v.taxCode,
      qty: item.qty,
      listUnitCents: v.priceCents,
      unitCents,
      compareAtCents: v.compareAtCents,
      lineCents: unitCents * item.qty,
      shipping: { weightOz: v.weightOz, box: v.box, unitsPerBox: v.unitsPerBox, shipsAlone: v.shipsAlone, flatShipCents: v.flatShipCents },
    });
  }
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);
  const subtotalCents = lines.reduce((n, l) => n + l.lineCents, 0);

  let discount: PricedCart["discount"] = null;
  let discountError: string | null = null;
  let freeShipping = false;
  const check = input.discount?.(subtotalCents) ?? null;
  if (check) {
    if (check.ok) {
      discount = { code: check.code, amountCents: check.amountCents, label: check.label };
      freeShipping = check.freeShipping;
    } else discountError = check.message;
  }
  const merchandiseCents = subtotalCents - (discount?.amountCents ?? 0);

  let inquiry: PricedCart["inquiry"] = null;
  const q = input.inquiry;
  if (q.on && lines.length) {
    if (q.overCents !== null && subtotalCents > q.overCents) inquiry = { reason: "amount" };
    else if (q.overQuantity !== null && itemCount > q.overQuantity) inquiry = { reason: "quantity" };
  }

  return { lines, itemCount, subtotalCents, discount, discountError, merchandiseCents, freeShipping, trade: input.trade && input.trade.percentOff > 0 ? input.trade : null, inquiry, notices, currency: input.currency };
}

// ---- Estimates ----------------------------------------------------------------------

export type EstimateLine = { id: string; productId: string | null; variantId: string | null; name: string; detail: string; qty: number; unitCents: number };
export type EstimateDiscount = { kind: "percent" | "amount"; value: number } | Record<string, never>;

export function estimateTotals(items: EstimateLine[], discount: EstimateDiscount, shippingCents: number): { subtotalCents: number; discountCents: number; totalCents: number } {
  const subtotalCents = items.reduce((n, l) => n + Math.round(l.qty * l.unitCents), 0);
  let discountCents = 0;
  if ("kind" in discount && discount.value > 0) discountCents = discount.kind === "percent" ? percentOf(subtotalCents, Math.min(100, discount.value)) : Math.min(subtotalCents, Math.round(discount.value));
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents + shippingCents };
}
