import { markSetupStepAction } from "@/app/(portal)/marketing/actions";
import { demoMode } from "@/lib/env";
import { loadSetup } from "@/lib/marketing/setup";
import type { ToolKey } from "@/lib/marketing/setup-steps";
import type { PortalContext } from "@/lib/portal";
import { sampleLists, sampleSubscribers } from "@/lib/sample/marketing";
import { DemoToolSetup } from "./demo-setup";
import { SetupGuide } from "./setup-guide";

/** The setup steps for one tool, at the top of that tool's page. */
export async function SetupFor({ ctx, tool }: { ctx: PortalContext; tool: ToolKey }) {
  if (demoMode()) {
    const subscribers = sampleSubscribers(ctx.tenant).filter((x) => x.status === "subscribed").length;
    return <DemoToolSetup tenantId={ctx.tenant.id} tool={tool} base={{ subscribers, lists: sampleLists(ctx.tenant).length }} />;
  }
  const found = (await loadSetup(ctx)).find((t) => t.key === tool);
  return found ? <SetupGuide tool={found} onMark={markSetupStepAction} /> : null;
}
