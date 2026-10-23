// What the public shop pages and their browser pieces work with: a product as
// a shopper sees it, without costs, boxes or anything internal. Pure, so the
// client components can import the types.
import { priceRange } from "./catalog";

export type ShopVariant = { id: string; options: Record<string, string>; label: string; sku: string; priceCents: number; compareAtCents: number | null };

export type ShopItem = {
  slug: string;
  name: string;
  description: string;
  category: string;
  photos: { src: string; alt: string }[];
  options: { name: string; values: string[] }[];
  variants: ShopVariant[];
  minCents: number;
  maxCents: number;
  /** A color for the tile when there's no photo (the demo's made-up products). */
  color: string | null;
  seo: { title: string; description: string };
  updatedAt: Date;
};

type ProductLike = {
  slug: string;
  name: string;
  description: string;
  category: string;
  photos: { src: string; alt: string }[];
  options: { name: string; values: string[] }[];
  variants: { id: string; options: Record<string, string>; label: string; sku: string; priceCents: number; compareAtCents: number | null; active: boolean }[];
  seo?: { title: string; description: string };
  updatedAt: Date;
};

export function toShopItem(p: ProductLike, color: string | null = null): ShopItem | null {
  const active = p.variants.filter((v) => v.active);
  const range = priceRange(active);
  if (!range) return null;
  return {
    slug: p.slug,
    name: p.name,
    description: p.description,
    category: p.category,
    photos: p.photos,
    // Only the choices some version still sells.
    options: p.options.map((o) => ({ name: o.name, values: o.values.filter((val) => active.some((v) => v.options[o.name] === val)) })).filter((o) => o.values.length),
    variants: active.map(({ id, options, label, sku, priceCents, compareAtCents }) => ({ id, options, label, sku, priceCents, compareAtCents })),
    minCents: range.min,
    maxCents: range.max,
    color,
    seo: p.seo ?? { title: "", description: "" },
    updatedAt: p.updatedAt,
  };
}

/** The shopper's price after their trade tier. */
export const tradePrice = (cents: number, percentOff: number) => (percentOff > 0 ? cents - Math.min(cents, Math.round((cents * percentOff) / 100)) : cents);

/** The share links on a product page. */
export function shareLinks(url: string, title: string, image: string | null) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return {
    email: `mailto:?subject=${t}&body=${encodeURIComponent(`${title}\n${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    pinterest: `https://www.pinterest.com/pin/create/button/?url=${u}&description=${t}${image ? `&media=${encodeURIComponent(image)}` : ""}`,
  };
}

/** The shape the structured data and feed helpers read. */
export function feedProduct(p: ShopItem) {
  return { slug: p.slug, name: p.name, description: p.description, category: p.category, photos: p.photos, options: p.options, variants: p.variants.map((v) => ({ ...v, weightOz: 0, active: true })), updatedAt: p.updatedAt };
}
