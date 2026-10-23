// Sales setup: every tool's steps on one page, and one tool's steps at the top
// of its own page. Same guide as Marketing; the steps tick off from what's
// really saved or connected.
import { SetupGuide } from "@/components/marketing/setup-guide";
import m from "@/components/marketing/marketing.module.css";
import { demoMode } from "@/lib/env";
import { progressOf } from "@/lib/marketing/setup-steps";
import type { PortalContext } from "@/lib/portal";
import { loadSalesSetup } from "@/lib/sales/setup";
import type { SalesTool, SalesToolKey } from "@/lib/sales/setup-steps";

export function SalesHub({ tools }: { tools: SalesTool[] }) {
  const p = progressOf(tools);
  const share = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <div className={m.hub} data-testid="sales-setup-hub">
      <div className={m.hubIntro}>
        <div>
          <strong data-testid="sales-setup-progress">{p.done === p.total ? "Sales is set up." : `${p.done} of ${p.total} steps done`}</strong>
          <p>{p.next ? `Next: ${p.next.title.charAt(0).toLowerCase()}${p.next.title.slice(1)} (${p.next.tool.name}). Each step ticks off on its own once it's done.` : "Everything required is done. Optional steps stay here for whenever you want them."}</p>
          <div className={m.bar} aria-hidden="true">
            <span style={{ width: `${share}%` }} />
          </div>
        </div>
      </div>
      {tools.map((tool, i) => (
        <SetupGuide key={tool.key} tool={tool} variant="hub" number={i + 1} />
      ))}
    </div>
  );
}

/** The setup steps for one Sales tool, at the top of that tool's page. */
export async function SalesSetupFor({ ctx, tool }: { ctx: PortalContext; tool: SalesToolKey }) {
  const found = (await loadSalesSetup(ctx, demoMode())).find((t) => t.key === tool);
  return found ? <SetupGuide tool={found} /> : null;
}
