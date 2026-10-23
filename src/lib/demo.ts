import "server-only";
// The public demo: made-up companies, no database, nothing saved on the server.
// Every screen reads sample data. Modules and add-ons can be turned on, and that
// lives in a cookie in the visitor's own browser. Every other action answers DEMO_MESSAGE.
import { BRAND } from "@/config/brand";
import { CATALOG, isPaidItemKey, type PaidItemKey } from "@/config/catalog";
import { type EntitlementRow, resolveAccess } from "@/lib/access/entitlements";
import { DEV_PEOPLE, DEV_TENANTS } from "@/lib/auth/dev-people";
import type { Identity } from "@/lib/auth/identity";
import type { PortalContext } from "@/lib/portal";

export { DEMO_MESSAGE } from "@/config/demo-text";

const DAY = 86_400_000;

/** What each demo company starts with. Same as the seed, so the demo shows locked and unlocked modes. */
function demoEntitlements(tenantId: string, now: Date): EntitlementRow[] {
  if (tenantId !== DEV_TENANTS.brightwater.id) return [];
  return [
    { item_key: "module:marketing", source: "grant", status: "active", starts_at: new Date(now.getTime() - 30 * DAY), ends_at: null },
    { item_key: "addon:calculator", source: "trial", status: "active", starts_at: new Date(now.getTime() - 5 * DAY), ends_at: new Date(now.getTime() + 9 * DAY) },
  ];
}

// ---- What a visitor turned on, kept in their browser -------------------------

export const DEMO_UNLOCKS_COOKIE = "bo_demo_unlocks";
/** Long enough for a 14-day trial to run its course. */
export const DEMO_UNLOCKS_MAX_AGE = 30 * 24 * 60 * 60;

export type DemoUnlock = { item: PaidItemKey; source: "trial" | "subscription"; at: number };
export type DemoUnlocks = Record<string, DemoUnlock[]>;

const DEMO_TENANT_IDS = new Set<string>(Object.values(DEV_TENANTS).map((t) => t.id));

/**
 * Reads the demo cookie. It comes from the browser, so anything odd is dropped:
 * unknown companies or items, stray fields, times in the future or too far back.
 * It only ever changes what this visitor sees in the demo.
 */
export function parseDemoUnlocks(value: string | undefined, now = Date.now()): DemoUnlocks {
  if (!value || value.length > 4000) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: DemoUnlocks = {};
  for (const [tenantId, list] of Object.entries(raw)) {
    if (!DEMO_TENANT_IDS.has(tenantId) || !Array.isArray(list)) continue;
    const seen = new Set<string>();
    const clean: DemoUnlock[] = [];
    for (const entry of list.slice(0, 40)) {
      if (!entry || typeof entry !== "object") continue;
      const { item, source, at } = entry as Record<string, unknown>;
      if (!isPaidItemKey(item)) continue;
      if (source !== "trial" && source !== "subscription") continue;
      if (typeof at !== "number" || !Number.isFinite(at) || at > now + 60_000 || at < now - DEMO_UNLOCKS_MAX_AGE * 1000) continue;
      if (seen.has(`${item}|${source}`)) continue;
      seen.add(`${item}|${source}`);
      clean.push({ item, source, at });
    }
    if (clean.length) out[tenantId] = clean;
  }
  return out;
}

export function serializeDemoUnlocks(unlocks: DemoUnlocks): string {
  return Buffer.from(JSON.stringify(unlocks)).toString("base64url");
}

function unlockRows(unlocks: DemoUnlock[], now: Date): EntitlementRow[] {
  return unlocks.map((u) => {
    const startsAt = new Date(Math.min(u.at, now.getTime()));
    return {
      item_key: u.item,
      source: u.source,
      status: "active",
      starts_at: startsAt,
      ends_at: u.source === "trial" ? new Date(startsAt.getTime() + CATALOG[u.item].trialDays * DAY) : null,
    };
  });
}

// ---- The demo portal --------------------------------------------------------

export function demoContext(identity: Identity, now = new Date(), unlocks: DemoUnlock[] = []): PortalContext | null {
  const person = DEV_PEOPLE.find((p) => p.userId === identity.userId && p.tenantId === identity.tenantId);
  const tenant = Object.values(DEV_TENANTS).find((t) => t.id === identity.tenantId);
  if (!person || !tenant) return null;
  const rows = [...demoEntitlements(tenant.id, now), ...unlockRows(unlocks, now)];
  return {
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.domain.split(".")[0], industry: tenant.industry, access: resolveAccess(rows, now) },
    member: { id: `member-${person.userId}`, userId: person.userId, email: person.email, name: person.name, role: person.role },
    settings: { sampleData: true, accent: BRAND.defaultAccent, timezone: "America/Los_Angeles" },
    sites: [{ id: `site-${tenant.id.slice(0, 8)}`, domain: tenant.domain, siteKey: "site_demo", firstEventAt: null }],
  };
}

export function demoTeam(ctx: PortalContext) {
  return DEV_PEOPLE.filter((p) => p.tenantId === ctx.tenant.id).map((p) => ({ id: p.userId, name: p.name, email: p.email, role: p.role, status: "active" as const }));
}
