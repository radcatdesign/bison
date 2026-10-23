// What a shopper is offered for shipping, from the company's shipping settings,
// the packed cart and (when live rates are on) the carrier's answer. Pure.
import { formatMoney } from "./money";
import type { PackResult } from "./packing";
import type { Rate } from "./carriers";
import type { ShippingSettings } from "./settings";

export type ShippingOption = { id: string; label: string; amountCents: number; days: number | null };

export type OptionsInput = {
  settings: ShippingSettings;
  pack: PackResult;
  itemCount: number;
  /** Merchandise after codes, before shipping and tax. */
  merchandiseCents: number;
  /** A code took the whole order off. */
  codeFreeShipping: boolean;
  /** The carrier's rates, when live rates are on and the carrier answered. */
  rates: Rate[] | null;
  currency: string;
};

export type OptionsResult = { ok: true; options: ShippingOption[] } | { ok: false; message: string };

const FREE: ShippingOption = { id: "free", label: "Free shipping", amountCents: 0, days: null };

export function freeShippingApplies(s: ShippingSettings, merchandiseCents: number, codeFreeShipping: boolean): boolean {
  return codeFreeShipping || s.source === "free" || (s.freeOverCents !== null && merchandiseCents >= s.freeOverCents);
}

export function shippingOptions(i: OptionsInput): OptionsResult {
  const s = i.settings;
  if (freeShippingApplies(s, i.merchandiseCents, i.codeFreeShipping)) return { ok: true, options: [FREE] };
  const extra = i.pack.flatCents + s.handlingCents;

  if (s.source === "flat") {
    const amount = s.flat.perOrderCents + s.flat.perItemCents * i.itemCount + extra;
    return { ok: true, options: [{ id: "flat", label: s.flat.label || "Shipping", amountCents: amount, days: null }] };
  }

  // Live rates. A cart of only flat-rate items has nothing for the carrier to rate.
  if (!i.pack.packages.length) return { ok: true, options: [{ id: "flat", label: s.flat.label || "Shipping", amountCents: extra, days: null }] };
  if (!i.rates) return { ok: false, message: "We couldn't get shipping rates for that address. Check the address and try again." };
  const allowed = s.services.length ? i.rates.filter((r) => s.services.includes(r.code)) : i.rates;
  const best = new Map<string, Rate>();
  for (const r of allowed) {
    const prev = best.get(r.code);
    if (!prev || r.amountCents < prev.amountCents) best.set(r.code, r);
  }
  const options = [...best.values()]
    .sort((a, b) => a.amountCents - b.amountCents)
    .slice(0, s.maxOptions)
    .map((r) => ({ id: r.code, label: [r.carrier, r.service].filter(Boolean).join(" ").replace(/^(UPS) UPS /, "$1 ").trim() || "Shipping", amountCents: r.amountCents + extra, days: r.days }));
  if (!options.length) return { ok: false, message: "No shipping options reach that address. Check it, or contact us to order." };
  return { ok: true, options };
}

/** "UPS Ground, $18.40, about 4 business days" for emails and order pages. */
export function describeOption(o: ShippingOption, currency: string): string {
  const price = o.amountCents === 0 ? "free" : formatMoney(o.amountCents, currency);
  return `${o.label}, ${price}${o.days ? `, about ${o.days} business day${o.days === 1 ? "" : "s"}` : ""}`;
}
