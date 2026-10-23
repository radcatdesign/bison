// Search data for products: structured data on each product page and the
// product feed Google Merchant Center (and others) read. Pure.
import { descriptionSummary, variantLabel } from "./catalog";
import { minorPerMajor } from "./money";

export type FeedShop = { name: string; slug: string; base: string; currency: string };
export type FeedProduct = {
  slug: string;
  name: string;
  description: string;
  category: string;
  photos: { src: string; alt: string }[];
  options: { name: string }[];
  variants: { id: string; options: Record<string, string>; sku: string; priceCents: number; compareAtCents: number | null; weightOz: number; active: boolean }[];
  updatedAt: Date;
};

const abs = (base: string, src: string) => (src.startsWith("/") ? `${base}${src}` : src);
const amount = (cents: number, currency: string) => (cents / minorPerMajor(currency)).toFixed(Math.log10(minorPerMajor(currency)));
const xml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export const productPageUrl = (s: Pick<FeedShop, "base" | "slug">, productSlug: string) => `${s.base}/p/${s.slug}/shop/${productSlug}`;

/** Product structured data: one Product, or a ProductGroup with a Product per version. */
export function productStructuredData(s: FeedShop, p: FeedProduct): Record<string, unknown> {
  const url = productPageUrl(s, p.slug);
  const images = p.photos.map((ph) => abs(s.base, ph.src));
  const active = p.variants.filter((v) => v.active);
  const offer = (v: FeedProduct["variants"][number]) => ({ "@type": "Offer", url, priceCurrency: s.currency.toUpperCase(), price: amount(v.priceCents, s.currency), availability: "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition", seller: { "@type": "Organization", name: s.name } });
  const base = { name: p.name, description: descriptionSummary(p.description, 5000) || undefined, image: images.length ? images : undefined, brand: { "@type": "Brand", name: s.name }, category: p.category || undefined };
  if (!p.options.length || active.length <= 1) {
    const v = active[0];
    return { "@context": "https://schema.org", "@type": "Product", "@id": `${url}#product`, url, ...base, sku: v?.sku || undefined, ...(v ? { offers: offer(v) } : {}) };
  }
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    "@id": `${url}#product`,
    url,
    ...base,
    productGroupID: p.slug,
    variesBy: p.options.map((o) => (/size/i.test(o.name) ? "https://schema.org/size" : /colou?r/i.test(o.name) ? "https://schema.org/color" : o.name)),
    hasVariant: active.map((v) => ({ "@type": "Product", name: `${p.name}, ${variantLabel(v.options, p.options)}`, sku: v.sku || undefined, ...Object.fromEntries(Object.entries(v.options).map(([k, val]) => [/size/i.test(k) ? "size" : /colou?r/i.test(k) ? "color" : k.toLowerCase(), val])), offers: offer(v) })),
  };
}

/** A Google Merchant product feed (RSS 2.0 with the g: fields), one item per version. */
export function merchantFeed(s: FeedShop, products: FeedProduct[]): string {
  const items = products.flatMap((p) =>
    p.variants
      .filter((v) => v.active)
      .map((v) => {
        const label = variantLabel(v.options, p.options);
        const onSale = v.compareAtCents !== null && v.compareAtCents > v.priceCents;
        const fields = [
          ["g:id", v.sku || v.id],
          ["g:title", label ? `${p.name}, ${label}` : p.name],
          ["g:description", descriptionSummary(p.description, 4900) || p.name],
          ["g:link", productPageUrl(s, p.slug)],
          ...(p.photos[0] ? [["g:image_link", abs(s.base, p.photos[0].src)]] : []),
          ...p.photos.slice(1, 10).map((ph) => ["g:additional_image_link", abs(s.base, ph.src)]),
          ["g:availability", "in_stock"],
          ["g:condition", "new"],
          ["g:price", `${amount(onSale ? v.compareAtCents! : v.priceCents, s.currency)} ${s.currency.toUpperCase()}`],
          ...(onSale ? [["g:sale_price", `${amount(v.priceCents, s.currency)} ${s.currency.toUpperCase()}`]] : []),
          ["g:brand", s.name],
          ...(v.sku ? [["g:mpn", v.sku]] : [["g:identifier_exists", "no"]]),
          ...(p.options.length ? [["g:item_group_id", p.slug]] : []),
          ...Object.entries(v.options).flatMap(([k, val]) => (/size/i.test(k) ? [["g:size", val]] : /colou?r/i.test(k) ? [["g:color", val]] : /material/i.test(k) ? [["g:material", val]] : [])),
          ...(p.category ? [["g:product_type", p.category]] : []),
          ...(v.weightOz > 0 ? [["g:shipping_weight", `${Math.round((v.weightOz / 16) * 100) / 100} lb`]] : []),
        ];
        return `    <item>\n${fields.map(([k, val]) => `      <${k}>${xml(String(val))}</${k}>`).join("\n")}\n    </item>`;
      }),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>${xml(s.name)}</title>\n    <link>${xml(`${s.base}/p/${s.slug}/shop`)}</link>\n    <description>${xml(`Products from ${s.name}`)}</description>\n${items.join("\n")}\n  </channel>\n</rss>\n`;
}
