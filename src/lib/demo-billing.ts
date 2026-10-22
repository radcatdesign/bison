import "server-only";
// Trials and subscriptions in the public demo. Same rules as real billing, but
// what's turned on is kept in the visitor's browser, so nothing reaches a server
// and every visitor starts from the same place.
import { cookies } from "next/headers";
import { CATALOG, type PaidItemKey } from "@/config/catalog";
import { DEMO_UNLOCKS_COOKIE, DEMO_UNLOCKS_MAX_AGE, type DemoUnlock, parseDemoUnlocks, serializeDemoUnlocks } from "@/lib/demo";
import { secureCookies } from "@/lib/env";
import type { PortalContext } from "@/lib/portal";

type Result = { ok: boolean; message: string };

export async function readDemoUnlocks(tenantId: string): Promise<DemoUnlock[]> {
  const jar = await cookies();
  return parseDemoUnlocks(jar.get(DEMO_UNLOCKS_COOKIE)?.value)[tenantId] ?? [];
}

async function writeDemoUnlocks(tenantId: string, update: (list: DemoUnlock[]) => DemoUnlock[]) {
  const jar = await cookies();
  const all = parseDemoUnlocks(jar.get(DEMO_UNLOCKS_COOKIE)?.value);
  const next = update(all[tenantId] ?? []);
  if (next.length) all[tenantId] = next;
  else delete all[tenantId];
  if (Object.keys(all).length === 0) {
    jar.delete(DEMO_UNLOCKS_COOKIE);
    return;
  }
  jar.set(DEMO_UNLOCKS_COOKIE, serializeDemoUnlocks(all), { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", maxAge: DEMO_UNLOCKS_MAX_AGE });
}

export async function demoStartTrial(ctx: PortalContext, key: PaidItemKey): Promise<Result> {
  const item = CATALOG[key];
  const state = ctx.tenant.access.states[key];
  if (state.active) return { ok: false, message: `${item.name} is already on.` };
  if (state.trialUsed) return { ok: false, message: `You've already tried ${item.name}. Subscribe to turn it back on.` };
  await writeDemoUnlocks(ctx.tenant.id, (list) => [...list, { item: key, source: "trial", at: Date.now() }]);
  return { ok: true, message: `${item.name} is on for ${item.trialDays} days. No card needed.` };
}

export async function demoSubscribe(ctx: PortalContext, key: PaidItemKey): Promise<Result> {
  const item = CATALOG[key];
  if (ctx.tenant.access.states[key].via === "subscription") return { ok: false, message: `You already subscribe to ${item.name}.` };
  await writeDemoUnlocks(ctx.tenant.id, (list) => [...list.filter((u) => !(u.item === key && u.source === "subscription")), { item: key, source: "subscription", at: Date.now() }]);
  return { ok: true, message: `${item.name} is on. This is a demo, so no card was charged.` };
}

/** Puts this demo company back the way every visitor first sees it. */
export async function demoReset(ctx: PortalContext): Promise<Result> {
  await writeDemoUnlocks(ctx.tenant.id, () => []);
  return { ok: true, message: `${ctx.tenant.name} is back to the plan the demo starts with.` };
}
