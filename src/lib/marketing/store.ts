import "server-only";
// Reading and saving marketing settings, and what a company is called and where
// it lives, for code that runs without a portal session (the send job, public
// signups, unsubscribe pages). All of it inside withTenant.
import type { Tx } from "@/lib/db";
import { isUuid } from "@/lib/db";
import type { PortalContext } from "@/lib/portal";
import { type MarketingSettings, readMarketingSettings, type SettingsTenant } from "./settings";

export type MarketingPart = keyof MarketingSettings;

export function settingsTenantOf(ctx: PortalContext): SettingsTenant {
  return { name: ctx.tenant.name, industry: ctx.tenant.industry, accent: ctx.settings.accent, domain: ctx.sites[0]?.domain };
}

export async function getMarketingSettings(tx: Tx, t: SettingsTenant): Promise<MarketingSettings> {
  const row = await tx.selectFrom("marketing_settings").select(["brand", "signup", "offer", "search"]).executeTakeFirst();
  return readMarketingSettings(row, t);
}

export async function saveMarketingPart<P extends MarketingPart>(tx: Tx, part: P, value: MarketingSettings[P]): Promise<void> {
  const json = JSON.stringify(value);
  await tx
    .insertInto("marketing_settings")
    .values({ [part]: json })
    .onConflict((oc) => oc.column("tenant_id").doUpdateSet({ [part]: json }))
    .execute();
}

export type TenantInfo = SettingsTenant & { id: string; slug: string; timezone: string; sampleData: boolean; domains: string[] };

/** The company behind the current transaction, for code without a portal session. */
export async function tenantInfo(tx: Tx): Promise<TenantInfo> {
  const t = await tx.selectFrom("tenants").select(["id", "name", "slug", "industry"]).executeTakeFirstOrThrow();
  const s = await tx.selectFrom("settings").select(["accent", "timezone", "sample_data"]).executeTakeFirstOrThrow();
  const sites = await tx.selectFrom("sites").select("domain").orderBy("created_at").execute();
  return { id: t.id, name: t.name, slug: t.slug, industry: t.industry, accent: s.accent, timezone: s.timezone, sampleData: s.sample_data, domain: sites[0]?.domain, domains: sites.map((x) => x.domain) };
}

/** Uploads named in a document must be this company's own. */
export async function ownFiles(tx: Tx, ids: string[]): Promise<boolean> {
  const wanted = [...new Set(ids)].filter(isUuid);
  if (wanted.length !== new Set(ids).size) return false;
  if (!wanted.length) return true;
  const rows = await tx.selectFrom("files").select("id").where("id", "in", wanted).execute();
  return rows.length === wanted.length;
}
