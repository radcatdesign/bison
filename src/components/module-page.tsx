import { CATALOG } from "@/config/catalog";
import type { ModeKey } from "@/config/modes";
import { daysLeft } from "@/lib/access/entitlements";
import { gateMode } from "@/lib/gate";
import { getPortalContext } from "@/lib/portal";
import { Locked, PageHeader, Planned, RoleBlocked } from "./ui";

type PlannedItem = { title: string; body: string };

/** A mode's landing page: the module when it's on, Unlock when it's not, a note when the role doesn't include it. */
export async function ModulePage({ mode, title, note, planned }: { mode: ModeKey; title: string; note: string; planned: PlannedItem[] }) {
  const ctx = await getPortalContext();
  const gate = gateMode(ctx, mode);
  if (gate.kind === "role") return <RoleBlocked mode={gate.label} />;
  if (gate.kind === "locked") return <Locked item={gate.item} canBuy={gate.canBuy} trialUsed={gate.trialUsed} />;

  const key = mode === "sales" ? "module:sales" : "module:marketing";
  const state = ctx.tenant.access.states[key];
  const status =
    state.via === "trial" && state.trialEndsAt
      ? `${CATALOG[key].name} trial: ${daysLeft(state.trialEndsAt)} days left.`
      : state.pastDue
        ? "Your last payment didn't go through. Update your card in Settings to keep this on."
        : null;

  return (
    <div data-testid={`module-${mode}`}>
      <PageHeader title={title} note={note} />
      {status && (
        <p className="notice" style={{ marginBottom: 24 }}>
          {status}
        </p>
      )}
      <p className="muted" style={{ marginBottom: 14, fontWeight: 560 }}>
        Being built now. Here&apos;s what&apos;s coming.
      </p>
      <Planned items={planned} />
    </div>
  );
}
