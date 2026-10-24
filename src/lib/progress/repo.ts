import "server-only";
// What the Progress screen and the sidebar read: the company's own XP, or
// made-up progress in the public demo. Reading also gives any XP not given yet.
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { type PortalContext, scopeOf } from "@/lib/portal";
import { sampleProgress } from "@/lib/sample/progress";
import { type Gained, type Progress, readProgress, syncProgress, xpTotal } from "./store";

export async function progressFor(ctx: PortalContext): Promise<{ progress: Progress; demo: boolean }> {
  if (demoMode()) return { progress: sampleProgress(ctx.tenant.edition), demo: true };
  const progress = await withTenant(scopeOf(ctx), async (tx) => {
    await syncProgress(tx, ctx.tenant.edition);
    return readProgress(tx);
  });
  return { progress, demo: false };
}

/** Gives any new XP after an action, for its message. Never fails the action. */
export async function earn(ctx: PortalContext): Promise<Gained> {
  if (demoMode()) return { xp: 0, achievements: [], levelUp: null };
  try {
    return await withTenant(scopeOf(ctx), (tx) => syncProgress(tx, ctx.tenant.edition));
  } catch (err) {
    console.error("progress sync failed", err);
    return { xp: 0, achievements: [], levelUp: null };
  }
}

// The sidebar catches up now and then, so XP from anywhere shows without a visit to Progress.
const lastSync = new Map<string, number>();
const SYNC_EVERY_MS = 60_000;

/** Total XP for the sidebar's level, catching up on new awards at most once a minute per company. */
export async function sidebarXp(ctx: PortalContext): Promise<number> {
  if (demoMode()) return sampleProgress(ctx.tenant.edition).xp;
  try {
    return await withTenant(scopeOf(ctx), async (tx) => {
      const now = Date.now();
      if (now - (lastSync.get(ctx.tenant.id) ?? 0) > SYNC_EVERY_MS) {
        lastSync.set(ctx.tenant.id, now);
        if (lastSync.size > 5000) lastSync.clear();
        await syncProgress(tx, ctx.tenant.edition);
      }
      return xpTotal(tx);
    });
  } catch (err) {
    console.error("sidebar progress failed", err);
    return 0;
  }
}
