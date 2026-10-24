import "server-only";
// What the Agents screen reads: the team's work and how busy the week was.
// From the database (the agents look for new work first, at most every couple
// of minutes per company), or made up while sample data is on and in the demo.
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { type PortalContext, scopeOf } from "@/lib/portal";
import { SAMPLE_WEEK, sampleTasks } from "@/lib/sample/agents";
import { type Crowd, crowdFor, type WeekNumbers } from "./roster";
import { listTasks, runAgents, type Task, weekNumbers } from "./store";

export type AgentsView = { sample: boolean; open: Task[]; done: Task[]; crowd: Crowd; week: WeekNumbers; before: WeekNumbers };

const lastRun = new Map<string, number>();
const RUN_EVERY_MS = 2 * 60_000;

export async function agentsView(ctx: PortalContext): Promise<AgentsView> {
  if (demoMode() || ctx.settings.sampleData) {
    const { week, before } = SAMPLE_WEEK[ctx.tenant.edition];
    return { sample: true, open: sampleTasks(ctx.tenant), done: [], crowd: crowdFor(week, before), week, before };
  }
  return withTenant(scopeOf(ctx), async (tx) => {
    const now = Date.now();
    // A company with no work on record yet always gets a fresh look.
    const none = !(await tx.selectFrom("agent_tasks").select("id").limit(1).executeTakeFirst());
    if (none || now - (lastRun.get(ctx.tenant.id) ?? 0) > RUN_EVERY_MS) {
      lastRun.set(ctx.tenant.id, now);
      if (lastRun.size > 5000) lastRun.clear();
      await runAgents(tx, ctx.tenant.edition);
    }
    const { open, done } = await listTasks(tx);
    const { week, before } = await weekNumbers(tx);
    return { sample: false, open, done, crowd: crowdFor(week, before), week, before };
  });
}

/** Lets the next visit look for work straight away, after someone approves or dismisses something. */
export function rerunSoon(tenantId: string) {
  lastRun.delete(tenantId);
}
