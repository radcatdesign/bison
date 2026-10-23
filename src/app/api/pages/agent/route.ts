// The page agent. Takes the page as the editor has it plus a request, and
// streams back each change as one JSON object per line, ending with "done".
// Signed-in only; role, plan and usage are checked here on the server.
import { CATALOG } from "@/config/catalog";
import { may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { isUuid } from "@/lib/db";
import { demoMode, pageAgentName } from "@/lib/env";
import { runPageAgent } from "@/lib/pages/agent";
import { type AgentEvent, type AgentTurn, MAX_HISTORY, MAX_INSTRUCTION } from "@/lib/pages/agent/types";
import { agentRunsThisMonth, getPage, recordAgentRun } from "@/lib/pages/repo";
import { PageDocError, parsePageDoc } from "@/lib/pages/schema";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { allow } from "@/lib/rate-limit";

export const maxDuration = 60;

const refuse = (status: number, message: string) => Response.json({ message }, { status });

function readHistory(value: unknown): AgentTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t): t is AgentTurn => !!t && typeof t === "object" && (t.role === "user" || t.role === "agent") && typeof t.text === "string")
    .slice(-MAX_HISTORY)
    .map((t) => ({ role: t.role, text: t.text.slice(0, 4000) }));
}

export async function POST(req: Request) {
  const ctx = await getPortalContext();
  if (!can(ctx.tenant, "marketing.pages")) return refuse(403, "Pages are part of Marketing. Unlock Marketing to build pages.");
  if (!may(ctx.member.role, "pages.edit")) return refuse(403, "Your role can't change landing pages.");

  let body: { pageId?: unknown; doc?: unknown; instruction?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return refuse(400, "Couldn't read that request. Reload the page and try again.");
  }
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) return refuse(400, "Tell the agent what to build or change.");
  if (instruction.length > MAX_INSTRUCTION) return refuse(400, `Keep requests under ${MAX_INSTRUCTION} characters.`);
  let doc;
  try {
    doc = parsePageDoc(body.doc);
  } catch (err) {
    return refuse(400, err instanceof PageDocError ? `The page didn't load correctly: ${err.message}` : "The page didn't load correctly. Reload and try again.");
  }

  const demo = demoMode();
  const scope = scopeOf(ctx);
  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  if (!demo) {
    if (!isUuid(pageId) || !(await getPage(scope, pageId))) return refuse(404, "That page doesn't exist. It may have been deleted.");
    const limit = CATALOG["module:marketing"].limits.pageAgentRunsPerMonth ?? 0;
    if ((await agentRunsThisMonth(scope)) >= limit) {
      return refuse(429, `You've used all ${limit} agent requests this month. You can still edit by hand, and requests reset on the 1st.`);
    }
  } else if (pageAgentName() === "claude") {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!allow(`page-agent:${ip}`, 20, 60 * 60 * 1000)) return refuse(429, "The demo agent is busy. Try again in an hour, or edit the page by hand.");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await runPageAgent(
          { doc, instruction, history: readHistory(body.history), brand: ctx.tenant.name, industry: ctx.tenant.industry, domain: ctx.sites[0]?.domain ?? "" },
          send,
          req.signal,
        );
        let saved = false;
        if (!demo) {
          await recordAgentRun(scope, pageId, { doc: result.doc, instruction, reply: result.reply, actor: ctx.member.email });
          saved = true;
        }
        send({ type: "done", doc: result.doc, reply: result.reply, changes: result.changes, saved });
      } catch (err) {
        if (!req.signal.aborted) {
          console.error("page agent failed", err);
          send({ type: "error", message: "The agent stopped partway. The changes it made so far are kept, and Undo takes them back. Try again in a moment." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
