import "server-only";
import { pageAgentName } from "@/lib/env";
import { runClaude } from "./claude";
import { runStandIn } from "./stand-in";
import type { AgentInput, AgentResult, Emit } from "./types";

export async function runPageAgent(input: AgentInput, emit: Emit, signal?: AbortSignal): Promise<AgentResult> {
  const agent = pageAgentName();
  emit({ type: "start", agent });
  // The stand-in pauses between steps so the preview builds up the way it does with Claude.
  return agent === "claude" ? runClaude(input, emit, signal) : runStandIn(input, emit, { delayMs: process.env.NODE_ENV === "test" ? 0 : 160 });
}
