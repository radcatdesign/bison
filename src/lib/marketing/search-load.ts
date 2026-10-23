import "server-only";
// Loads everything the search pack is built from, for one company.
import { sql } from "kysely";
import { type Database, db, withTenant } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { pageDocSchema } from "@/lib/pages/schema";
import { priceRange } from "@/lib/sales/catalog";
import { descriptionSummary } from "@/lib/sales/catalog";
import { formatMoney } from "@/lib/sales/money";
import { publicProducts } from "@/lib/sales/products";
import { getSalesSettings } from "@/lib/sales/store";
import type { SearchContext, SearchPage, SearchProduct } from "./search";
import { getMarketingSettings, tenantInfo } from "./store";

export async function loadSearchContext(tenantId: string, database: Database = db(), include: { pages: boolean; products: boolean } = { pages: true, products: true }): Promise<SearchContext> {
  return withTenant(
    { tenantId },
    async (tx) => {
      const info = await tenantInfo(tx);
      const settings = await getMarketingSettings(tx, info);
      const rows = include.pages ? await tx.selectFrom("pages").select(["slug", "title", "published_doc", "published_at"]).where("published_at", "is not", null).orderBy("published_at", "desc").limit(500).execute() : [];
      const pages: SearchPage[] = rows.flatMap((r) => {
        const parsed = pageDocSchema.safeParse(r.published_doc);
        return parsed.success && r.published_at ? [{ slug: r.slug, title: r.title, doc: parsed.data, publishedAt: r.published_at }] : [];
      });
      let products: SearchProduct[] = [];
      if (include.products) {
        const currency = (await getSalesSettings(tx)).store.currency;
        products = (await publicProducts(tx, 500)).map((p) => {
          const r = priceRange(p.variants);
          return { slug: p.slug, name: p.name, summary: descriptionSummary(p.description, 200), price: r ? (r.min === r.max ? formatMoney(r.min, currency) : `from ${formatMoney(r.min, currency)}`) : "", updatedAt: p.updatedAt };
        });
      }
      return { name: settings.brand.businessName || info.name, tenantSlug: info.slug, site: info.domain ?? null, base: appUrl(), brand: settings.brand, search: settings.search, pages, products, edition: info.edition };
    },
    database,
  );
}

/** A company's search files by its address: its pages while it has Marketing, its products while it has Sales. */
export async function searchContextBySlug(slug: string, database: Database = db()): Promise<SearchContext | null> {
  if (!/^[a-z0-9-]{1,63}$/.test(slug)) return null;
  const { rows } = await sql<{ tenant_id: string; marketing: boolean; sales: boolean }>`select * from resolve_public_tenant(${slug})`.execute(database);
  const r = rows[0];
  if (!r || (!r.marketing && !r.sales)) return null;
  return loadSearchContext(r.tenant_id, database, { pages: r.marketing, products: r.sales });
}

export async function aiBlockedSlugs(database: Database = db()): Promise<string[]> {
  const { rows } = await sql<{ slug: string }>`select ai_blocked_tenant_slugs() as slug`.execute(database);
  return rows.map((r) => r.slug);
}
