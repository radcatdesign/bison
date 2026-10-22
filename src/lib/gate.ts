import "server-only";
import { MODES, type ModeKey } from "@/config/modes";
import type { PaidItemKey } from "@/config/catalog";
import { may, seesMode } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import type { PortalContext } from "@/lib/portal";

export type Gate =
  | { kind: "open" }
  | { kind: "role"; label: string }
  | { kind: "locked"; item: PaidItemKey; canBuy: boolean; trialUsed: boolean };

/** Decides what a mode's page shows: the page, a role note, or the Unlock screen. */
export function gateMode(ctx: PortalContext, key: ModeKey): Gate {
  const mode = MODES.find((m) => m.key === key)!;
  if (!seesMode(ctx.member.role, key)) return { kind: "role", label: mode.label };
  if (mode.item && !can(ctx.tenant, mode.feature)) {
    return { kind: "locked", item: mode.item, canBuy: may(ctx.member.role, "billing.manage"), trialUsed: ctx.tenant.access.states[mode.item].trialUsed };
  }
  return { kind: "open" };
}
