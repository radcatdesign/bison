import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { type Access, loadAccess } from "@/lib/access/entitlements";
import { getIdentity } from "@/lib/auth/identity";
import { type TenantScope, withTenant } from "@/lib/db";
import type { Role } from "@/lib/db/types";
import { demoContext } from "@/lib/demo";
import { readDemoUnlocks } from "@/lib/demo-billing";
import { demoMode } from "@/lib/env";

export type PortalContext = {
  tenant: { id: string; name: string; slug: string; industry: string; access: Access };
  member: { id: string; userId: string; email: string; name: string; role: Role };
  settings: { sampleData: boolean; accent: string; timezone: string };
  sites: { id: string; domain: string; siteKey: string; firstEventAt: Date | null }[];
};

/**
 * The data access layer's front door. Resolves who is signed in, confirms they
 * are an active member of the tenant (under that tenant's RLS context), and
 * loads what the tenant has. Deduped per request. Server actions call it too,
 * so nothing about tenant or role is ever taken from the browser.
 */
export const getPortalContext = cache(async (): Promise<PortalContext> => {
  const identity = await getIdentity();
  if (!identity) redirect("/sign-in");
  if (!identity.tenantId) redirect(identity.provider === "clerk" ? "/onboarding" : "/sign-in");

  if (demoMode()) {
    const demo = demoContext(identity, new Date(), await readDemoUnlocks(identity.tenantId));
    if (!demo) redirect("/sign-in");
    return demo;
  }

  const scope: TenantScope = { tenantId: identity.tenantId, userId: identity.userId };
  const ctx = await withTenant(scope, async (tx) => {
    const member = await tx
      .selectFrom("members")
      .select(["id", "user_id", "email", "name", "role", "status"])
      .where("user_id", "=", identity.userId)
      .executeTakeFirst();
    if (!member || member.status !== "active") return member?.status === "pending" ? "pending" : null;
    const tenant = await tx.selectFrom("tenants").select(["id", "name", "slug", "industry", "status"]).executeTakeFirstOrThrow();
    if (tenant.status !== "active") return null;
    const settings = await tx.selectFrom("settings").select(["sample_data", "accent", "timezone"]).executeTakeFirstOrThrow();
    const sites = await tx.selectFrom("sites").select(["id", "domain", "site_key", "first_event_at"]).orderBy("created_at").execute();
    const access = await loadAccess(tx);
    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, industry: tenant.industry, access },
      member: { id: member.id, userId: member.user_id!, email: member.email, name: member.name, role: member.role },
      settings: { sampleData: settings.sample_data, accent: settings.accent, timezone: settings.timezone },
      sites: sites.map((s) => ({ id: s.id, domain: s.domain, siteKey: s.site_key, firstEventAt: s.first_event_at })),
    } satisfies PortalContext;
  });
  if (ctx === "pending") redirect("/sign-in?error=pending");
  if (!ctx) redirect("/sign-in?error=no-access");
  return ctx;
});

export function scopeOf(ctx: PortalContext): TenantScope {
  return { tenantId: ctx.tenant.id, userId: ctx.member.userId };
}
