// can(tenant, feature): the one check that decides what a tenant can use.
import { CATALOG, type ItemKey, type PaidItemKey, isPaidItemKey } from "@/config/catalog";
import { FEATURES, type FeatureKey } from "@/config/features";
import type { Tx } from "@/lib/db";
import type { EntitlementSource, EntitlementStatus } from "@/lib/db/types";

export type EntitlementRow = {
  item_key: string;
  source: EntitlementSource;
  status: EntitlementStatus;
  starts_at: Date;
  ends_at: Date | null;
};

export type ItemState = {
  key: PaidItemKey;
  active: boolean;
  /** Where access comes from when active. Paid beats grant beats trial. */
  via: EntitlementSource | null;
  trialEndsAt: Date | null;
  trialUsed: boolean;
  pastDue: boolean;
};

export type Access = {
  items: ReadonlySet<ItemKey>;
  states: Readonly<Record<PaidItemKey, ItemState>>;
};

/** Stripe keeps a subscription past_due while it retries the card, so access stays on. */
const LIVE_STATUSES: EntitlementStatus[] = ["active", "past_due"];
const SOURCE_RANK: Record<EntitlementSource, number> = { subscription: 3, grant: 2, trial: 1 };

export function isRowLive(row: EntitlementRow, now: Date): boolean {
  if (!LIVE_STATUSES.includes(row.status)) return false;
  if (row.starts_at > now) return false;
  if (row.ends_at && row.ends_at <= now) return false;
  return true;
}

export function resolveAccess(rows: EntitlementRow[], now: Date = new Date()): Access {
  const states = {} as Record<PaidItemKey, ItemState>;
  for (const key of Object.keys(CATALOG)) {
    if (!isPaidItemKey(key)) continue;
    states[key] = { key, active: false, via: null, trialEndsAt: null, trialUsed: false, pastDue: false };
  }

  for (const row of rows) {
    if (!isPaidItemKey(row.item_key)) continue;
    const state = states[row.item_key];
    if (row.source === "trial") {
      state.trialUsed = true;
      if (isRowLive(row, now)) state.trialEndsAt = row.ends_at;
    }
    if (!isRowLive(row, now)) continue;
    if (!state.via || SOURCE_RANK[row.source] > SOURCE_RANK[state.via]) {
      state.via = row.source;
      state.active = true;
      state.pastDue = row.status === "past_due";
    }
  }

  const items = new Set<ItemKey>(["base"]);
  for (const state of Object.values(states)) if (state.active) items.add(state.key);
  return { items, states };
}

/** True when the tenant has any catalog item that grants `feature`. */
export function can(tenant: { access: Access }, feature: FeatureKey): boolean {
  const grantedBy: readonly ItemKey[] = FEATURES[feature];
  return grantedBy.some((item) => tenant.access.items.has(item));
}

/** The first item that would unlock `feature`, for the Unlock button. */
export function unlockItemFor(feature: FeatureKey): PaidItemKey | null {
  const grantedBy: readonly ItemKey[] = FEATURES[feature];
  return (grantedBy.find((i) => i !== "base") as PaidItemKey | undefined) ?? null;
}

export async function loadAccess(tx: Tx, now: Date = new Date()): Promise<Access> {
  const rows = await tx
    .selectFrom("entitlements")
    .select(["item_key", "source", "status", "starts_at", "ends_at"])
    .execute();
  return resolveAccess(rows, now);
}

export function daysLeft(until: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((until.getTime() - now.getTime()) / 86_400_000));
}
