// What the page agent takes in and streams back. Shared by the Claude agent,
// the offline stand-in, the API route and the editor.
import type { PageDoc } from "../schema";

export type AgentTurn = { role: "user" | "agent"; text: string };

export type AgentInput = {
  doc: PageDoc;
  instruction: string;
  /** Earlier requests and replies on this page, oldest first. */
  history: AgentTurn[];
  brand: string;
  industry: string;
  domain: string;
};

export type AgentEvent =
  | { type: "start"; agent: AgentName }
  | { type: "op"; label: string; doc: PageDoc; sectionId?: string }
  | { type: "done"; doc: PageDoc; reply: string; changes: string[]; saved: boolean }
  | { type: "error"; message: string };

export type AgentName = "claude" | "stand-in";

export type AgentResult = { doc: PageDoc; reply: string; changes: string[] };

export type Emit = (event: AgentEvent) => void;

export const MAX_INSTRUCTION = 2000;
export const MAX_HISTORY = 8;
