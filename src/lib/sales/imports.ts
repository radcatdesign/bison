// Reading products from other places: a spreadsheet, a Shopify product export,
// a Shopify store's public product list, or a product feed (Google Merchant
// XML, or a CSV/TSV feed). Pure: text or JSON in, products out. Every price is
// read as written; nothing is guessed.
import { XMLParser } from "fast-xml-parser";
import { type EditionKey, sayFor } from "@/config/editions";
import { parseCsv } from "@/lib/marketing/csv";
import { MAX_OPTIONS, MAX_PHOTOS, PHOTO_SRC, type ProductOption, slugify } from "./catalog";

export const MAX_IMPORT_PRODUCTS = 500;
export const MAX_IMPORT_BYTES = 5_000_000;

export type ImportedVariant = { options: Record<string, string>; sku: string; priceCents: number; compareAtCents: number | null; weightOz: number };
export type ImportedProduct = { sourceId: string; name: string; description: string; category: string; status: "active" | "draft"; options: ProductOption[]; photos: { src: string; alt: string }[]; variants: ImportedVariant[]; seo: { title: string; description: string } };
export type ImportResult = { products: ImportedProduct[]; skipped: string[]; format: "csv" | "shopify" | "shopify-store" | "feed" };

export class ImportError extends Error {}

const clean = (s: unknown) => (typeof s === "string" ? s : s === undefined || s === null ? "" : String(s)).replace(/\s+/g, " ").trim();

/** HTML descriptions (Shopify, feeds) as plain paragraphs and bullets. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\/\s*(p|div|h[1-6]|ul|ol|li|tr)\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    // Long dashes read as a pause; a comma says the same in plain text.
    .replace(/&mdash;|&ndash;|\u2014|\u2013/g, ", ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20_000);
}

/** "$1,240.50", "12.00 USD", "12" as cents. Null if it isn't a price. */
export function priceCents(input: unknown): number | null {
  const m = /(\d[\d,]*(?:\.\d{1,2})?)/.exec(clean(input).replace(/\s/g, ""));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 100) : null;
}

/** "2 lb", "12 oz", "500 g", "1.5 kg" as ounces. A bare number uses `unit`. */
export function weightOz(input: unknown, unit: "lb" | "oz" | "g" | "kg" = "lb"): number {
  const m = /(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?|kg|kilograms?|g|grams?)?/i.exec(clean(input));
  if (!m) return 0;
  const n = Number(m[1]);
  const u = (m[2] ?? unit).toLowerCase();
  const oz = u.startsWith("lb") || u.startsWith("pound") ? n * 16 : u.startsWith("oz") || u.startsWith("ounce") ? n : u.startsWith("kg") || u.startsWith("kilo") ? n * 35.274 : n / 28.3495;
  return Math.round(Math.min(160_000, oz) * 100) / 100;
}

const photo = (src: unknown, alt = ""): { src: string; alt: string } | null => {
  const s = clean(src).replace(/^\/\//, "https://").replace(/^http:\/\//, "https://");
  return PHOTO_SRC.test(s) ? { src: s, alt: clean(alt).slice(0, 200) } : null;
};

function addPhoto(p: ImportedProduct, src: unknown, alt?: unknown) {
  const ph = photo(src, clean(alt));
  if (ph && p.photos.length < MAX_PHOTOS && !p.photos.some((x) => x.src === ph.src)) p.photos.push(ph);
}

function addOptionValue(p: ImportedProduct, name: string, value: string) {
  let o = p.options.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!o) {
    if (p.options.length >= MAX_OPTIONS) return;
    o = { name, values: [] };
    p.options.push(o);
  }
  if (!o.values.some((v) => v.toLowerCase() === value.toLowerCase())) o.values.push(value);
}

/** Drops variants that repeat a choice, and a lone "Default Title" option Shopify adds. */
function tidy(p: ImportedProduct): ImportedProduct {
  if (p.options.length === 1 && p.options[0].values.length === 1 && /^(title|default)/i.test(`${p.options[0].name} ${p.options[0].values[0]}`) && p.variants.length === 1) {
    p.options = [];
    p.variants[0].options = {};
  }
  const seen = new Set<string>();
  p.variants = p.variants.filter((v) => {
    const key = p.options.map((o) => v.options[o.name] ?? "").join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return p.options.every((o) => v.options[o.name] !== undefined);
  });
  for (const v of p.variants) if (v.compareAtCents !== null && v.compareAtCents <= v.priceCents) v.compareAtCents = null;
  return p;
}

const blank = (sourceId: string, name: string): ImportedProduct => ({ sourceId, name: name.slice(0, 160), description: "", category: "", status: "active", options: [], photos: [], variants: [], seo: { title: "", description: "" } });

// ---- Spreadsheets -----------------------------------------------------------------------

function headerIndex(header: string[], ...names: string[]): number {
  const h = header.map((x) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  for (const n of names) {
    const i = h.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

export function importCsv(text: string, edition: EditionKey = "bison"): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError("That file is over 5 MB. Split it into smaller files.");
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new ImportError(sayFor(edition)("That file has no products in it. The first row should be the column names.", "That file has nothing to import in it. The first row should be the column names."));
  const header = rows[0];
  if (headerIndex(header, "handle") >= 0 && headerIndex(header, "variant price") >= 0) return importShopifyCsv(rows);

  const col = {
    name: headerIndex(header, "name", "title", "product", "product name"),
    description: headerIndex(header, "description", "body", "details"),
    price: headerIndex(header, "price", "sale price", "unit price"),
    was: headerIndex(header, "was price", "compare at price", "regular price", "msrp", "list price"),
    sku: headerIndex(header, "sku", "item number", "part number"),
    weight: headerIndex(header, "weight", "weight lb", "weight lbs", "weight oz", "shipping weight"),
    category: headerIndex(header, "category", "type", "product type"),
    image: headerIndex(header, "image", "image url", "photo", "image link"),
    status: headerIndex(header, "status", "active"),
    optionName: headerIndex(header, "option name", "option"),
    optionValue: headerIndex(header, "option value", "variant", "value"),
  };
  if (col.name < 0 || col.price < 0) throw new ImportError("The file needs a Name column and a Price column. Other columns are optional.");
  const weightHeader = col.weight >= 0 ? header[col.weight].toLowerCase() : "";
  const weightUnit = /oz|ounce/.test(weightHeader) ? "oz" : /\bkg\b/.test(weightHeader) ? "kg" : /\bg\b|gram/.test(weightHeader) ? "g" : "lb";

  const byName = new Map<string, ImportedProduct>();
  const skipped: string[] = [];
  for (const [i, r] of rows.slice(1).entries()) {
    const name = clean(r[col.name]);
    if (!name) continue;
    const price = priceCents(r[col.price]);
    if (price === null) {
      skipped.push(`Row ${i + 2}, ${name}: no price.`);
      continue;
    }
    const key = name.toLowerCase();
    let p = byName.get(key);
    if (!p) {
      if (byName.size >= MAX_IMPORT_PRODUCTS) {
        skipped.push(`Row ${i + 2} and after: more than ${MAX_IMPORT_PRODUCTS} products in one file.`);
        break;
      }
      p = blank(slugify(name), name);
      byName.set(key, p);
    }
    if (col.description >= 0 && !p.description) p.description = htmlToText(r[col.description] ?? "");
    if (col.category >= 0 && !p.category) p.category = clean(r[col.category]).slice(0, 80);
    if (col.status >= 0 && /draft|no|false|0|inactive|hidden/i.test(clean(r[col.status]))) p.status = "draft";
    if (col.image >= 0) addPhoto(p, r[col.image]);
    const options: Record<string, string> = {};
    const oName = col.optionName >= 0 ? clean(r[col.optionName]) : "";
    const oValue = col.optionValue >= 0 ? clean(r[col.optionValue]) : "";
    if (oName && oValue) {
      addOptionValue(p, oName.slice(0, 40), oValue.slice(0, 60));
      options[p.options.find((o) => o.name.toLowerCase() === oName.toLowerCase())?.name ?? oName] = oValue;
    }
    p.variants.push({ options, sku: clean(r[col.sku] ?? "").slice(0, 64), priceCents: price, compareAtCents: col.was >= 0 ? priceCents(r[col.was]) : null, weightOz: col.weight >= 0 ? weightOz(r[col.weight], weightUnit) : 0 });
  }
  return { products: [...byName.values()].map(tidy).filter((p) => p.variants.length), skipped, format: "csv" };
}

/** Shopify's product export: one row per variant, grouped by Handle, extra rows for extra photos. */
function importShopifyCsv(rows: string[][]): ImportResult {
  const header = rows[0];
  const at = (...n: string[]) => headerIndex(header, ...n);
  const c = {
    handle: at("handle"),
    title: at("title"),
    body: at("body html", "body"),
    type: at("type", "product category"),
    status: at("status"),
    published: at("published"),
    sku: at("variant sku"),
    grams: at("variant grams"),
    weightUnit: at("variant weight unit"),
    price: at("variant price"),
    compare: at("variant compare at price"),
    image: at("image src"),
    imageAlt: at("image alt text"),
    variantImage: at("variant image"),
    seoTitle: at("seo title"),
    seoDesc: at("seo description"),
    opt: [1, 2, 3].map((n) => ({ name: at(`option${n} name`), value: at(`option${n} value`) })),
  };
  const byHandle = new Map<string, ImportedProduct & { optionNames: string[] }>();
  const skipped: string[] = [];
  for (const [i, r] of rows.slice(1).entries()) {
    const handle = clean(r[c.handle]);
    if (!handle) continue;
    let p = byHandle.get(handle);
    if (!p) {
      if (byHandle.size >= MAX_IMPORT_PRODUCTS) {
        skipped.push(`Row ${i + 2} and after: more than ${MAX_IMPORT_PRODUCTS} products in one file.`);
        break;
      }
      p = { ...blank(handle, clean(r[c.title]) || handle), optionNames: [] };
      p.description = htmlToText(r[c.body] ?? "");
      p.category = clean(r[c.type]).split(">").pop()!.trim().slice(0, 80);
      p.status = c.status >= 0 ? (clean(r[c.status]).toLowerCase() === "active" ? "active" : "draft") : clean(r[c.published]).toLowerCase() === "false" ? "draft" : "active";
      p.seo = { title: clean(r[c.seoTitle]).slice(0, 70), description: clean(r[c.seoDesc]).slice(0, 170) };
      p.optionNames = c.opt.map((o) => clean(r[o.name])).filter(Boolean);
      byHandle.set(handle, p);
    }
    addPhoto(p, r[c.image], r[c.imageAlt]);
    addPhoto(p, r[c.variantImage]);
    const price = priceCents(r[c.price]);
    if (price === null) continue; // An image-only row.
    const options: Record<string, string> = {};
    c.opt.forEach((o, n) => {
      const name = p!.optionNames[n];
      const value = clean(r[o.value]);
      if (name && value) {
        addOptionValue(p!, name.slice(0, 40), value.slice(0, 60));
        options[name.slice(0, 40)] = value.slice(0, 60);
      }
    });
    // Shopify's export keeps the weight in grams whatever unit the store shows.
    const grams = Number(clean(r[c.grams])) || 0;
    p.variants.push({ options, sku: clean(r[c.sku]).slice(0, 64), priceCents: price, compareAtCents: priceCents(r[c.compare]), weightOz: grams ? weightOz(`${grams} g`) : 0 });
  }
  const products = [...byHandle.values()].map((x) => tidy({ sourceId: x.sourceId, name: x.name, description: x.description, category: x.category, status: x.status, options: x.options, photos: x.photos, variants: x.variants, seo: x.seo }));
  return { products: products.filter((p) => p.variants.length), skipped, format: "shopify" };
}

// ---- A Shopify store's public product list ------------------------------------------------

type ShopifyJson = { products?: { id?: number; title?: string; handle?: string; body_html?: string; product_type?: string; options?: { name?: string; values?: string[] }[]; images?: { src?: string; alt?: string }[]; variants?: { option1?: string | null; option2?: string | null; option3?: string | null; sku?: string; price?: string; compare_at_price?: string | null; grams?: number; available?: boolean }[] }[] };

export function importShopifyJson(pages: ShopifyJson[]): ImportResult {
  const products: ImportedProduct[] = [];
  const skipped: string[] = [];
  for (const page of pages) {
    for (const sp of page.products ?? []) {
      if (products.length >= MAX_IMPORT_PRODUCTS) {
        skipped.push(`More than ${MAX_IMPORT_PRODUCTS} products; the rest were left out.`);
        return { products, skipped, format: "shopify-store" };
      }
      const name = clean(sp.title);
      if (!name) continue;
      const p = blank(clean(sp.handle) || String(sp.id ?? slugify(name)), name);
      p.description = htmlToText(sp.body_html ?? "");
      p.category = clean(sp.product_type).slice(0, 80);
      for (const img of sp.images ?? []) addPhoto(p, img.src, img.alt ?? name);
      const names = (sp.options ?? []).map((o) => clean(o.name).slice(0, 40)).filter(Boolean).slice(0, MAX_OPTIONS);
      for (const v of sp.variants ?? []) {
        const price = priceCents(v.price);
        if (price === null) continue;
        const options: Record<string, string> = {};
        [v.option1, v.option2, v.option3].forEach((value, i) => {
          if (names[i] && value) {
            addOptionValue(p, names[i], clean(value).slice(0, 60));
            options[names[i]] = clean(value).slice(0, 60);
          }
        });
        p.variants.push({ options, sku: clean(v.sku).slice(0, 64), priceCents: price, compareAtCents: priceCents(v.compare_at_price), weightOz: v.grams ? weightOz(`${v.grams} g`) : 0 });
      }
      const t = tidy(p);
      if (t.variants.length) products.push(t);
      else skipped.push(`${name}: no prices.`);
    }
  }
  return { products, skipped, format: "shopify-store" };
}

/** The address of a Shopify store's public product list, page by page. */
export function shopifyProductsUrl(input: string, page: number): string | null {
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  return `https://${host}/products.json?limit=250&page=${page}`;
}

// ---- Product feeds ---------------------------------------------------------------------------

type FeedItem = Record<string, unknown>;

function field(item: FeedItem, ...keys: string[]): string {
  for (const k of keys) {
    const v = item[k] ?? item[`g:${k}`];
    if (v !== undefined && v !== null && v !== "") return clean(typeof v === "object" ? ((v as { "#text"?: string })["#text"] ?? "") : v);
  }
  return "";
}

/** Google Merchant XML (RSS or Atom), or a CSV/TSV feed with the same column names. */
export function importFeed(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError("That feed is over 5 MB.");
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  let items: FeedItem[];
  if (trimmed.startsWith("<")) {
    const xml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: false, processEntities: true, htmlEntities: true }).parse(trimmed) as Record<string, unknown>;
    const rss = (xml.rss as { channel?: { item?: unknown } } | undefined)?.channel?.item;
    const atom = (xml.feed as { entry?: unknown } | undefined)?.entry;
    const raw = rss ?? atom ?? [];
    items = (Array.isArray(raw) ? raw : [raw]) as FeedItem[];
  } else {
    const delimiter = trimmed.split("\n")[0].includes("\t") ? "\t" : ",";
    const rows = delimiter === "\t" ? trimmed.split(/\r?\n/).map((l) => l.split("\t")) : parseCsv(trimmed);
    const header = rows[0].map((h) => h.trim().toLowerCase().replace(/^g:/, ""));
    items = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
  }
  if (!items.length) throw new ImportError("That feed has no items in it.");

  const groups = new Map<string, ImportedProduct>();
  const skipped: string[] = [];
  for (const it of items) {
    const id = field(it, "id");
    const title = field(it, "title");
    if (!title) continue;
    const list = priceCents(field(it, "price"));
    const sale = priceCents(field(it, "sale_price"));
    if (list === null) {
      skipped.push(`${title}: no price.`);
      continue;
    }
    const group = field(it, "item_group_id") || id || slugify(title);
    let p = groups.get(group);
    if (!p) {
      if (groups.size >= MAX_IMPORT_PRODUCTS) {
        skipped.push(`More than ${MAX_IMPORT_PRODUCTS} products; the rest were left out.`);
        break;
      }
      p = blank(group, title.replace(/\s*[-,(]\s*(size|color|colour)?[^,()-]*\)?$/i, "") || title);
      p.description = htmlToText(field(it, "description"));
      p.category = field(it, "product_type").split(">").pop()!.trim().slice(0, 80);
      if (/out of stock|discontinued/i.test(field(it, "availability"))) p.status = "draft";
      groups.set(group, p);
    }
    addPhoto(p, field(it, "image_link"), title);
    const extra = it["additional_image_link"] ?? it["g:additional_image_link"];
    for (const src of Array.isArray(extra) ? extra : extra ? [extra] : []) addPhoto(p, src, title);
    const options: Record<string, string> = {};
    for (const [key, name] of [
      ["size", "Size"],
      ["color", "Color"],
      ["material", "Material"],
      ["pattern", "Pattern"],
    ] as const) {
      const value = field(it, key);
      if (value && field(it, "item_group_id")) {
        addOptionValue(p, name, value.slice(0, 60));
        options[name] = value.slice(0, 60);
      }
    }
    const onSale = sale !== null && sale < list;
    p.variants.push({ options, sku: (field(it, "mpn") || id).slice(0, 64), priceCents: onSale ? sale! : list, compareAtCents: onSale ? list : null, weightOz: weightOz(field(it, "shipping_weight", "product_weight")) });
  }
  return { products: [...groups.values()].map(tidy).filter((p) => p.variants.length), skipped, format: "feed" };
}
