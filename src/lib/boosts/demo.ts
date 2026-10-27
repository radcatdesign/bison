// The boosts a sample club has on, for the public demo and sample data. Pure.
import { BOOSTS, type BoostKey, type BoostState, readBoostSettings } from "./catalog";

const ON: BoostKey[] = ["miss-you", "milestones", "streaks", "bring-a-friend", "lead-alerts"];

export function sampleBoosts(now = new Date()): Record<BoostKey, BoostState> {
  const since = new Date(now.getTime() - 21 * 86_400_000);
  const out = {} as Record<BoostKey, BoostState>;
  for (const b of BOOSTS) {
    const on = ON.includes(b.key);
    out[b.key] = { on, settings: readBoostSettings(b.key, b.defaults), firstOnAt: on ? since : null, updatedAt: on ? since : null };
  }
  return out;
}
