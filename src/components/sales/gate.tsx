import type { ReactNode } from "react";
import { Locked, RoleBlocked } from "@/components/ui";
import type { FeatureKey } from "@/config/features";
import { may } from "@/config/roles";
import { can, unlockItemFor } from "@/lib/access/entitlements";
import { gateMode } from "@/lib/gate";
import type { PortalContext } from "@/lib/portal";

/** What a Sales page shows instead of itself: the role note or the Unlock screen. Null when it's open. */
export function salesGate(ctx: PortalContext, feature: FeatureKey): ReactNode | null {
  const gate = gateMode(ctx, "sales");
  if (gate.kind === "role") return <RoleBlocked mode={gate.label} />;
  if (gate.kind === "locked") return <Locked item={gate.item} canBuy={gate.canBuy} trialUsed={gate.trialUsed} />;
  if (!can(ctx.tenant, feature)) {
    const item = unlockItemFor(feature) ?? "module:sales";
    return <Locked item={item} canBuy={may(ctx.member.role, "billing.manage")} trialUsed={ctx.tenant.access.states[item].trialUsed} />;
  }
  return null;
}
