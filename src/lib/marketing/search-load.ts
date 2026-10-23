import "server-only";
// Loads everything the search pack is built from, for one company.
import { sql } from "kysely";
import { type Database, db, withTenant } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { pageDocSchema } from "@/lib/pages/schema";
import type { SearchContext, SearchPage } from "./search";
import { getMarketingSettings, tenantInfo } from "./store";

export async function loadSearchContext(tenantId: string, database: Database = db()): Promise<SearchContext> {
  return withTenant(
    { tenantId },
    async (tx) => {
      const info = await tenantInfo(tx);
      const settings = await getMarketingSettings(tx, info);
      const rows = await tx.selectFrom("pages").select(["slug", "title", "published_doc", "published_at"]).where("published_at", "is not", null).orderBy("published_at", "desc").limit(500).execute();
      const pages: SearchPage[] = rows.flatMap((r) => {
        const parsed = pageDocSchema.safeParse(r.published_doc);
        return parsed.success && r.published_at ? [{ slug: r.slug, title: r.title, doc: parsed.data, publishedAt: r.published_at }] : [];
      });
      return { name: settings.brand.businessName || info.name, tenantSlug: info.slug, site: info.domain ?? null, base: appUrl(), brand: settings.brand, search: settings.search, pages };
    },
    database,
  );
}

/** A company's search files by its address, only while it has Marketing. */
export async function searchContextBySlug(slug: string, database: Database = db()): Promise<SearchContext | null> {
  if (!/^[a-z0-9-]{1,63}$/.test(slug)) return null;
  const { rows } = await sql<{ id: string | null }>`select resolve_marketing_tenant(${slug}) as id`.execute(database);
  const id = rows[0]?.id;
  return id ? loadSearchContext(id, database) : null;
}

export async function aiBlockedSlugs(database: Database = db()): Promise<string[]> {
  const { rows } = await sql<{ slug: string }>`select ai_blocked_tenant_slugs() as slug`.execute(database);
  return rows.map((r) => r.slug);
}
