import "server-only";
// The public demo: made-up companies, no database, nothing saved.
// Every screen reads sample data; every action answers DEMO_MESSAGE.
import { BRAND } from "@/config/brand";
import { type EntitlementRow, resolveAccess } from "@/lib/access/entitlements";
import { DEV_PEOPLE, DEV_TENANTS } from "@/lib/auth/dev-people";
import type { Identity } from "@/lib/auth/identity";
import type { PortalContext } from "@/lib/portal";

export const DEMO_MESSAGE = "This is a demo with made-up data, so nothing is saved.";

const DAY = 86_400_000;

/** What each demo company has turned on. Same as the seed, so the demo shows locked and unlocked modes. */
function demoEntitlements(tenantId: string, now: Date): EntitlementRow[] {
  if (tenantId !== DEV_TENANTS.brightwater.id) return [];
  return [
    { item_key: "module:marketing", source: "grant", status: "active", starts_at: new Date(now.getTime() - 30 * DAY), ends_at: null },
    { item_key: "addon:calculator", source: "trial", status: "active", starts_at: new Date(now.getTime() - 5 * DAY), ends_at: new Date(now.getTime() + 9 * DAY) },
  ];
}

export function demoContext(identity: Identity, now = new Date()): PortalContext | null {
  const person = DEV_PEOPLE.find((p) => p.userId === identity.userId && p.tenantId === identity.tenantId);
  const tenant = Object.values(DEV_TENANTS).find((t) => t.id === identity.tenantId);
  if (!person || !tenant) return null;
  return {
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.domain.split(".")[0], industry: tenant.industry, access: resolveAccess(demoEntitlements(tenant.id, now), now) },
    member: { id: `member-${person.userId}`, userId: person.userId, email: person.email, name: person.name, role: person.role },
    settings: { sampleData: true, accent: BRAND.defaultAccent, timezone: "America/Los_Angeles" },
    sites: [{ id: `site-${tenant.id.slice(0, 8)}`, domain: tenant.domain, siteKey: "site_demo", firstEventAt: null }],
  };
}

export function demoTeam(ctx: PortalContext) {
  return DEV_PEOPLE.filter((p) => p.tenantId === ctx.tenant.id).map((p) => ({ id: p.userId, name: p.name, email: p.email, role: p.role, status: "active" as const }));
}
