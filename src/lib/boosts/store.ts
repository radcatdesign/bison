import "server-only";
// Reading and switching boosts. A club without a row for a boost has it off.
import { audit } from "@/lib/audit";
import type { Tx } from "@/lib/db";
import { BOOSTS, type BoostKey, type BoostSettings, type BoostState, boostSpec, readBoostSettings } from "./catalog";

export class BoostError extends Error {}

export async function readBoosts(tx: Tx): Promise<Record<BoostKey, BoostState>> {
  const rows = await tx.selectFrom("club_boosts").select(["key", "on_now", "settings", "first_on_at", "updated_at"]).execute();
  const out = {} as Record<BoostKey, BoostState>;
  for (const b of BOOSTS) {
    const r = rows.find((x) => x.key === b.key);
    out[b.key] = { on: Boolean(r?.on_now), settings: readBoostSettings(b.key, r?.settings), firstOnAt: r?.first_on_at ?? null, updatedAt: r?.updated_at ?? null };
  }
  return out;
}

export async function boostOn(tx: Tx, key: BoostKey): Promise<BoostState | null> {
  const r = await tx.selectFrom("club_boosts").select(["on_now", "settings", "first_on_at", "updated_at"]).where("key", "=", key).executeTakeFirst();
  return r?.on_now ? { on: true, settings: readBoostSettings(key, r.settings), firstOnAt: r.first_on_at, updatedAt: r.updated_at } : null;
}

/** Turns a boost on or off and saves its settings. A boost that needs a setting can't go on without it. */
export async function setBoost(tx: Tx, key: BoostKey, on: boolean, raw: BoostSettings, actor: string): Promise<BoostState> {
  const spec = boostSpec(key);
  const settings = readBoostSettings(key, raw);
  if (on && spec.needs === "link" && !settings.link) throw new BoostError("Add your review link first, starting with https://, like your Google review page.");
  const json = JSON.stringify(settings);
  const now = new Date();
  const row = await tx
    .insertInto("club_boosts")
    .values({ key, on_now: on, settings: json, first_on_at: on ? now : null, changed_by: actor.slice(0, 120) })
    .onConflict((oc) =>
      oc.columns(["tenant_id", "key"]).doUpdateSet((eb) => ({
        on_now: on,
        settings: json,
        changed_by: actor.slice(0, 120),
        first_on_at: on ? eb.fn.coalesce("club_boosts.first_on_at", eb.val(now)) : eb.ref("club_boosts.first_on_at"),
      })),
    )
    .returning(["first_on_at", "updated_at"])
    .executeTakeFirstOrThrow();
  await audit(tx, { action: on ? "boost.on" : "boost.off", targetType: "boost", targetId: key, detail: { settings } });
  return { on, settings, firstOnAt: row.first_on_at, updatedAt: row.updated_at };
}
