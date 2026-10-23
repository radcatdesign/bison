import "server-only";
// The product catalog in the database: listing, reading, saving with variants,
// deleting, and the lookups pricing and product pages need. All inside
// withTenant, so RLS keeps every company to its own catalog.
import { sql } from "kysely";
import { CATALOG } from "@/config/catalog";
import { isUuid, type Tx } from "@/lib/db";
import type { ProductSource, ProductStatus } from "@/lib/db/types";
import { type ProductInput, type ProductOption, type ProductPhoto, priceRange, slugify, variantLabel } from "./catalog";
import type { VariantForPricing } from "./pricing";

export type Variant = {
  id: string;
  options: Record<string, string>;
  label: string;
  sku: string;
  priceCents: number;
  compareAtCents: number | null;
  weightOz: number;
  box: string;
  unitsPerBox: number;
  shipsAlone: boolean;
  flatShipCents: number | null;
  active: boolean;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: ProductStatus;
  category: string;
  taxCode: string;
  options: ProductOption[];
  photos: ProductPhoto[];
  seo: { title: string; description: string };
  source: ProductSource;
  sourceId: string;
  variants: Variant[];
  updatedAt: Date;
};

export type ProductRow = { id: string; slug: string; name: string; status: ProductStatus; category: string; photo: string | null; minCents: number | null; maxCents: number | null; variants: number; missingWeight: boolean; updatedAt: Date };

export const productLimit = () => CATALOG["module:sales"].limits.products ?? 2000;

export class ProductError extends Error {}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = <T extends object>(v: unknown, fallback: T): T => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : fallback);

function readVariant(r: { id: string; options: unknown; sku: string; price_cents: number; compare_at_cents: number | null; weight_oz: string; box: string; units_per_box: number; ships_alone: boolean; flat_ship_cents: number | null; active: boolean }, options: ProductOption[]): Variant {
  const o = obj<Record<string, string>>(r.options, {});
  return { id: r.id, options: o, label: variantLabel(o, options), sku: r.sku, priceCents: r.price_cents, compareAtCents: r.compare_at_cents, weightOz: Number(r.weight_oz), box: r.box, unitsPerBox: r.units_per_box, shipsAlone: r.ships_alone, flatShipCents: r.flat_ship_cents, active: r.active };
}

const VARIANT_COLUMNS = ["id", "product_id", "options", "sku", "price_cents", "compare_at_cents", "weight_oz", "box", "units_per_box", "ships_alone", "flat_ship_cents", "active", "position"] as const;

export async function listProducts(tx: Tx, opts: { status?: ProductStatus | "all"; search?: string } = {}): Promise<ProductRow[]> {
  let q = tx.selectFrom("products").select(["id", "slug", "name", "status", "category", "photos", "updated_at"]).orderBy("position").orderBy("name");
  if (opts.status && opts.status !== "all") q = q.where("status", "=", opts.status);
  else q = q.where("status", "!=", "archived");
  if (opts.search?.trim()) q = q.where("name", "ilike", `%${opts.search.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const rows = await q.limit(2000).execute();
  if (!rows.length) return [];
  const variants = await tx.selectFrom("product_variants").select(["product_id", "price_cents", "active", "weight_oz", "flat_ship_cents"]).where("product_id", "in", rows.map((r) => r.id)).execute();
  return rows.map((r) => {
    const vs = variants.filter((v) => v.product_id === r.id);
    const range = priceRange(vs.map((v) => ({ priceCents: v.price_cents, active: v.active })));
    const photos = arr<ProductPhoto>(r.photos);
    return { id: r.id, slug: r.slug, name: r.name, status: r.status, category: r.category, photo: photos[0]?.src ?? null, minCents: range?.min ?? null, maxCents: range?.max ?? null, variants: vs.length, missingWeight: vs.some((v) => v.active && Number(v.weight_oz) <= 0 && v.flat_ship_cents === null), updatedAt: r.updated_at };
  });
}

type ProductTableRow = { id: string; slug: string; name: string; description: string; status: ProductStatus; category: string; tax_code: string; options: unknown; photos: unknown; seo: unknown; source: ProductSource; source_id: string; updated_at: Date };
type VariantTableRow = Parameters<typeof readVariant>[0] & { product_id: string };

function readProduct(row: ProductTableRow, variants: VariantTableRow[]): Product {
  const options = arr<ProductOption>(row.options);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status,
    category: row.category,
    taxCode: row.tax_code,
    options,
    photos: arr<ProductPhoto>(row.photos),
    seo: obj(row.seo, { title: "", description: "" }),
    source: row.source,
    sourceId: row.source_id,
    variants: variants.map((v) => readVariant(v, options)),
    updatedAt: row.updated_at,
  };
}

export async function getProduct(tx: Tx, idOrSlug: string): Promise<Product | null> {
  const row = await tx
    .selectFrom("products")
    .selectAll()
    .where(isUuid(idOrSlug) ? "id" : "slug", "=", idOrSlug)
    .executeTakeFirst();
  if (!row) return null;
  const variants = await tx.selectFrom("product_variants").select(VARIANT_COLUMNS).where("product_id", "=", row.id).orderBy("position").execute();
  return readProduct(row, variants);
}

async function uniqueSlug(tx: Tx, wanted: string, exceptId: string | null): Promise<string> {
  const base = slugify(wanted);
  const taken = new Set((await tx.selectFrom("products").select(["id", "slug"]).where("slug", "like", `${base}%`).execute()).filter((r) => r.id !== exceptId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

/** Photos that are uploads must be this company's own. */
async function checkPhotos(tx: Tx, photos: ProductPhoto[]) {
  const ids = photos.map((p) => /^\/f\/([0-9a-f-]{36})$/.exec(p.src)?.[1]).filter((x): x is string => Boolean(x));
  if (!ids.length) return;
  const found = await tx.selectFrom("files").select("id").where("id", "in", ids).execute();
  if (found.length !== new Set(ids).size) throw new ProductError("One of the photos isn't one of your uploads.");
}

/** Creates or replaces a product and its variants. Variants not in the input are removed. */
export async function saveProduct(tx: Tx, input: ProductInput, opts: { id?: string | null; source?: ProductSource; sourceId?: string } = {}): Promise<string> {
  await checkPhotos(tx, input.photos);
  const id = opts.id ?? null;
  if (id) {
    const exists = await tx.selectFrom("products").select("id").where("id", "=", id).executeTakeFirst();
    if (!exists) throw new ProductError("That product isn't here anymore.");
  } else {
    const { n } = await tx.selectFrom("products").select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
    if (Number(n) >= productLimit()) throw new ProductError(`Your plan holds up to ${productLimit().toLocaleString("en-US")} products. Archive or delete some first.`);
  }
  const slug = await uniqueSlug(tx, input.slug || input.name, id);
  const values = {
    slug,
    name: input.name,
    description: input.description,
    status: input.status,
    category: input.category,
    tax_code: input.taxCode,
    options: JSON.stringify(input.options),
    photos: JSON.stringify(input.photos),
    seo: JSON.stringify(input.seo),
  };
  let productId = id;
  if (productId) await tx.updateTable("products").set(values).where("id", "=", productId).execute();
  else productId = (await tx.insertInto("products").values({ ...values, source: opts.source ?? "manual", source_id: opts.sourceId ?? "" }).returning("id").executeTakeFirstOrThrow()).id;

  const existing = await tx.selectFrom("product_variants").select("id").where("product_id", "=", productId).execute();
  const keep = new Set(input.variants.map((v) => v.id).filter((x): x is string => Boolean(x) && existing.some((e) => e.id === x)));
  const remove = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
  if (remove.length) await tx.deleteFrom("product_variants").where("id", "in", remove).execute();
  // Clear SKUs first so swapping SKUs between versions can't trip the unique index.
  if (keep.size) await tx.updateTable("product_variants").set({ sku: "" }).where("id", "in", [...keep]).execute();
  for (const [position, v] of input.variants.entries()) {
    const row = { options: JSON.stringify(v.options), sku: v.sku, price_cents: v.priceCents, compare_at_cents: v.compareAtCents, weight_oz: v.weightOz, box: v.box, units_per_box: v.unitsPerBox, ships_alone: v.shipsAlone, flat_ship_cents: v.flatShipCents, active: v.active, position };
    try {
      if (v.id && keep.has(v.id)) await tx.updateTable("product_variants").set(row).where("id", "=", v.id).execute();
      else await tx.insertInto("product_variants").values({ ...row, product_id: productId }).execute();
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw new ProductError(`The SKU ${v.sku} is already used by another product.`);
      throw err;
    }
  }
  return productId;
}

export async function setProductStatus(tx: Tx, id: string, status: ProductStatus): Promise<void> {
  await tx.updateTable("products").set({ status }).where("id", "=", id).execute();
}

export async function deleteProduct(tx: Tx, id: string): Promise<void> {
  await tx.deleteFrom("products").where("id", "=", id).execute();
}

/** What pricing needs to know about each variant in a cart or estimate. */
export async function variantsForPricing(tx: Tx, ids: string[]): Promise<Map<string, VariantForPricing>> {
  const wanted = [...new Set(ids)].filter(isUuid);
  const out = new Map<string, VariantForPricing>();
  if (!wanted.length) return out;
  const rows = await tx
    .selectFrom("product_variants as v")
    .innerJoin("products as p", (j) => j.onRef("p.id", "=", "v.product_id").onRef("p.tenant_id", "=", "v.tenant_id"))
    .select(["v.id", "v.product_id", "v.options", "v.sku", "v.price_cents", "v.compare_at_cents", "v.weight_oz", "v.box", "v.units_per_box", "v.ships_alone", "v.flat_ship_cents", "v.active", "p.name", "p.slug", "p.status", "p.options as product_options", "p.photos", "p.tax_code"])
    .where("v.id", "in", wanted)
    .execute();
  for (const r of rows) {
    out.set(r.id, {
      variantId: r.id,
      productId: r.product_id,
      productName: r.name,
      productSlug: r.slug,
      productStatus: r.status,
      productOptions: arr<ProductOption>(r.product_options),
      photo: arr<ProductPhoto>(r.photos)[0]?.src ?? null,
      taxCode: r.tax_code,
      options: obj<Record<string, string>>(r.options, {}),
      sku: r.sku,
      priceCents: r.price_cents,
      compareAtCents: r.compare_at_cents,
      active: r.active,
      weightOz: Number(r.weight_oz),
      box: r.box,
      unitsPerBox: r.units_per_box,
      shipsAlone: r.ships_alone,
      flatShipCents: r.flat_ship_cents,
    });
  }
  return out;
}

/** Active products for the public shop, sitemap and search files, with their prices. Two queries, whatever the size. */
export async function publicProducts(tx: Tx, limit = 500): Promise<(Product & { minCents: number; maxCents: number })[]> {
  const rows = await tx.selectFrom("products").selectAll().where("status", "=", "active").orderBy("position").orderBy("name").limit(limit).execute();
  if (!rows.length) return [];
  const variants = await tx.selectFrom("product_variants").select(VARIANT_COLUMNS).where("product_id", "in", rows.map((r) => r.id)).orderBy("position").execute();
  const byProduct = new Map<string, VariantTableRow[]>();
  for (const v of variants) byProduct.set(v.product_id, [...(byProduct.get(v.product_id) ?? []), v]);
  const out: (Product & { minCents: number; maxCents: number })[] = [];
  for (const r of rows) {
    const p = readProduct(r, byProduct.get(r.id) ?? []);
    const range = priceRange(p.variants);
    if (range) out.push({ ...p, minCents: range.min, maxCents: range.max });
  }
  return out;
}

export async function productCount(tx: Tx): Promise<{ total: number; active: number; missingWeight: number }> {
  const r = await sql<{ total: string; active: string; missing: string }>`
    select count(*) filter (where p.status <> 'archived') as total,
           count(*) filter (where p.status = 'active') as active,
           count(*) filter (where p.status = 'active' and exists (
             select 1 from product_variants v where v.tenant_id = p.tenant_id and v.product_id = p.id and v.active and v.weight_oz <= 0 and v.flat_ship_cents is null
           )) as missing
    from products p`.execute(tx);
  const row = r.rows[0];
  return { total: Number(row?.total ?? 0), active: Number(row?.active ?? 0), missingWeight: Number(row?.missing ?? 0) };
}

// ---- Imports ------------------------------------------------------------------------------

export type ImportSummary = { created: number; updated: number; failed: string[] };

/**
 * Saves imported products. A product imported before (same source and id) or
 * with the same address is updated; weights, boxes and shipping the team set
 * by hand are kept when the import doesn't say.
 */
export async function saveImported(tx: Tx, products: import("./imports").ImportedProduct[], source: ProductSource): Promise<ImportSummary> {
  const { parseProduct } = await import("./catalog");
  const out: ImportSummary = { created: 0, updated: 0, failed: [] };
  for (const p of products) {
    const existing =
      (p.sourceId ? await tx.selectFrom("products").select("id").where("source", "=", source).where("source_id", "=", p.sourceId).executeTakeFirst() : undefined) ??
      (await tx.selectFrom("products").select("id").where("slug", "=", slugify(p.name)).where("source", "=", source).executeTakeFirst());
    const before = existing ? await getProduct(tx, existing.id) : null;
    const variants = p.variants.map((v) => {
      const match = before?.variants.find((b) => (v.sku && b.sku.toLowerCase() === v.sku.toLowerCase()) || JSON.stringify(b.options) === JSON.stringify(v.options));
      return {
        id: match?.id,
        options: v.options,
        sku: v.sku,
        priceCents: v.priceCents,
        compareAtCents: v.compareAtCents,
        weightOz: v.weightOz || match?.weightOz || 0,
        box: match?.box ?? "",
        unitsPerBox: match?.unitsPerBox ?? 1,
        shipsAlone: match?.shipsAlone ?? false,
        flatShipCents: match?.flatShipCents ?? null,
        active: true,
      };
    });
    try {
      const input = parseProduct({ name: p.name, description: p.description, status: before?.status === "archived" ? "archived" : p.status, category: p.category, options: p.options, photos: p.photos.length ? p.photos : (before?.photos ?? []), seo: p.seo, variants, taxCode: before?.taxCode ?? "", slug: before?.slug });
      await saveProduct(tx, input, { id: existing?.id ?? null, source, sourceId: p.sourceId });
      if (existing) out.updated++;
      else out.created++;
    } catch (err) {
      out.failed.push(`${p.name}: ${err instanceof Error ? err.message : "couldn't be saved"}`);
      if (out.failed.length > 50) break;
    }
  }
  return out;
}
