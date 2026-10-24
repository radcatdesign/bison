import "server-only";
// The page agent on Claude. It edits the page only through tools; each tool call
// is checked against the page schema and applied the moment it arrives, so the
// preview fills in while the agent is still writing.
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { editionFor, sayFor } from "@/config/editions";
import { applyOp, type PageOp } from "../ops";
import { FORM_FIELDS, MAX_SECTIONS, type PageDoc, PageDocError, SECTION_TYPES } from "../schema";
import { AGENT_BANNED_WORDS } from "./banned-words";
import { type AgentInput, type AgentResult, type Emit, MAX_HISTORY } from "./types";

const MAX_ROUNDS = 6;

export function agentModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
}

/** The section reference. `inbox` is where form sends land: Contacts, or a club's Leads. */
const sectionGuide = (inbox: string) => `Section types and their fields (all text is plain text, no HTML or markdown):
- hero: headline (max 120), eyebrow? (short label, max 60), body? (max 400), primary? {label, href}, secondary? {label, href}, align "left"|"center", art "glow"|"grid"|"orbs"|"none". Use one hero, first.
- features: heading?, intro?, items [{title (max 80), body (max 280)}] 1 to 6.
- steps: heading?, items [{title, body}] 2 to 6. Numbered, for how it works.
- stats: heading?, items [{value (max 20), label (max 60)}] 2 to 4. Only with numbers the person gave you.
- quote: quote (max 400), name, role?. Only a real quote the person gave you; otherwise placeholders.
- offer: heading (max 100), price?, note?, bullets [text] up to 8, cta? {label, href}.
- faq: heading?, items [{q (max 160), a (max 600)}] 1 to 10.
- form: heading, body?, fields (any of ${FORM_FIELDS.join(", ")}; must include email), submit (button text), success (message shown after sending). Sends land in ${inbox}.
- cta: headline, body?, cta {label, href}. A closing band.
- text: heading?, body (blank lines split paragraphs, max 2000).
Buttons: label max 40. href is "#<section id>" (like "#form"), or a full https://, mailto: or tel: address the person gave you.
Theme: mode "light"|"dark", accent "#rrggbb", font "modern" (sans) | "editorial" (serif) | "technical" (mono), corners "soft"|"sharp"|"round".
A page holds up to ${MAX_SECTIONS} sections.`;

/** What kind of club a Fit Funnels company is, from its industry. */
const clubKind = (industry: string) => (industry === "studio" ? "a fitness studio" : industry === "gym" ? "a gym and health club" : "a gym or fitness studio");

function systemPrompt(input: AgentInput): string {
  const edition = editionFor(input.edition);
  const say = sayFor(edition);
  const intro = say(
    `You build and edit landing pages for ${input.brand} (${input.domain}, industry: ${input.industry}) inside ${edition.productName}. The person you're talking to works there.`,
    `You build and edit funnel pages (landing pages) for ${input.brand} (${input.domain}, industry: ${input.industry}) inside ${edition.productName}. ${input.brand} is ${clubKind(input.industry)}. Its pages bring in new members: free trial passes, intro offers, class sign-ups, club tours and personal training consults. The person you're talking to works there, at the front desk, as a coach or running the club.`,
  );
  const asks = say("get in touch, book, get a quote or sign up", "claim a pass or an offer, book a tour, a class or a consult, get a quote or sign up");
  const voice = say("like the owner talking to a customer", "like the owner talking to someone thinking about joining");
  const facts = say(
    `- Never invent facts about the business: no made-up testimonials, reviews, ratings, customer counts, awards, prices, discounts, dates, delivery times, guarantees or statistics. Use only what the person told you or what's already on the page.
- When a section needs a fact you don't have, write a placeholder in exactly this form: [Add ...], for example [Add a real customer quote] or [Add the price].`,
    `- Never invent facts about the club: no made-up testimonials, reviews, ratings, member counts, results, before-and-after claims, awards, prices, intro offers, discounts, class times, schedules, dates, coach names, guarantees or statistics. Use only what the person told you or what's already on the page.
- Never promise health, weight-loss or fitness results.
- When a section needs a fact you don't have, write a placeholder in exactly this form: [Add ...], for example [Add a real member quote], [Add the class times] or [Add the price].`,
  );
  return `${intro}

You change the page only by calling tools. The person watches a live preview update with each call.

How to work:
- For a new page: call set_theme if the request implies a look, then add_section once per section, top to bottom, then set_seo. A good page is usually a hero, three to five supporting sections, and a form or call to action at the end. Don't pad it.
- For changes: make the smallest set of edits that does what was asked. Refer to sections by id. Keep the person's existing words unless they ask you to change them.
- When the page asks people to ${asks}, include a form section with id "form" and point the main buttons at "#form".

Writing:
- Plain, direct and specific, ${voice}. Short sentences. Concrete over clever.
- Never use em dashes. Never use words like ${AGENT_BANNED_WORDS.join(", ")}. No exclamation marks unless asked.

Facts:
${facts} The page can't be published until placeholders are filled in, so use them only where they're needed.
- Never invent web addresses.

After your tool calls, reply in one or two short sentences: what you changed, and which placeholders to fill in if you added any. Don't list every section. If the request isn't about this page, say what you can help with and change nothing.

${sectionGuide(say("the company's Contacts", "the club's Leads"))}`;
}

const looseObject = { type: "object" as const, additionalProperties: true };

const TOOLS: Tool[] = [
  {
    name: "add_section",
    description: "Add one section to the page. Omit `after` to add it at the end; use \"start\" for the top or a section id to add it after that section. Returns the new section's id.",
    input_schema: {
      type: "object",
      properties: {
        section: { ...looseObject, description: "The section: a `type` plus that type's fields. Optionally an `id` (lowercase, dashes).", properties: { type: { type: "string", enum: [...SECTION_TYPES] } }, required: ["type"] },
        after: { type: "string", description: "\"start\", or the id of the section to add it after." },
      },
      required: ["section"],
    },
  },
  {
    name: "update_section",
    description: "Change fields of one section. Only the fields you pass change; arrays are replaced whole. Pass null to remove an optional field.",
    input_schema: { type: "object", properties: { id: { type: "string" }, changes: { ...looseObject } }, required: ["id", "changes"] },
  },
  {
    name: "remove_section",
    description: "Remove one section.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "move_section",
    description: "Move a section to a new position, counted from 0 at the top.",
    input_schema: { type: "object", properties: { id: { type: "string" }, to: { type: "integer", minimum: 0 } }, required: ["id", "to"] },
  },
  {
    name: "set_theme",
    description: "Change the look. Pass only what changes.",
    input_schema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["light", "dark"] },
        accent: { type: "string", description: "Hex color like #3b5bff" },
        font: { type: "string", enum: ["modern", "editorial", "technical"] },
        corners: { type: "string", enum: ["soft", "sharp", "round"] },
      },
    },
  },
  {
    name: "set_seo",
    description: "Set the title (max 70) and description (max 160) shown in search results and link previews.",
    input_schema: { type: "object", properties: { title: { type: "string" }, description: { type: "string" } } },
  },
];

/** Strips em dashes from anything the agent writes, in case one slips through. */
function tidy<T>(value: T): T {
  if (typeof value === "string") return value.replace(/\s*\u2014\s*/g, ", ").replace(/\u2013/g, "-") as T;
  if (Array.isArray(value)) return value.map(tidy) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tidy(v)])) as T;
  return value;
}

function toOp(name: string, input: unknown): PageOp {
  const i = tidy((input ?? {}) as Record<string, unknown>);
  switch (name) {
    case "add_section":
      return { op: "add_section", section: (i.section ?? {}) as Record<string, unknown>, after: typeof i.after === "string" ? i.after : undefined };
    case "update_section":
      return { op: "update_section", id: String(i.id ?? ""), changes: (i.changes ?? {}) as Record<string, unknown> };
    case "remove_section":
      return { op: "remove_section", id: String(i.id ?? "") };
    case "move_section":
      return { op: "move_section", id: String(i.id ?? ""), to: Number(i.to) };
    case "set_theme":
      return { op: "set_theme", changes: i as never };
    case "set_seo":
      return { op: "set_seo", changes: i as never };
    default:
      throw new PageDocError(`There's no tool called ${name}.`);
  }
}

function pageMessage(doc: PageDoc, instruction: string): string {
  return `Current page (JSON):\n\`\`\`json\n${JSON.stringify(doc)}\n\`\`\`\n\nRequest:\n${instruction}`;
}

export async function runClaude(input: AgentInput, emit: Emit, signal?: AbortSignal, client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })): Promise<AgentResult> {
  const history: MessageParam[] = input.history.slice(-MAX_HISTORY).map((t) => ({ role: t.role === "user" ? "user" : "assistant", content: t.text }));
  // The API wants turns to alternate, starting with the person.
  while (history.length && history[0].role !== "user") history.shift();
  const messages: MessageParam[] = [];
  for (const m of history) {
    if (messages.length && messages[messages.length - 1].role === m.role) continue;
    messages.push(m);
  }
  if (messages.length && messages[messages.length - 1].role === "user") messages.pop();
  // Cached, so the page isn't billed again on each round of tool calls.
  messages.push({ role: "user", content: [{ type: "text", text: pageMessage(input.doc, input.instruction), cache_control: { type: "ephemeral" } }] });

  let doc = input.doc;
  const changes: string[] = [];
  let reply = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const results = new Map<string, Omit<ToolResultBlockParam, "type" | "tool_use_id">>();
    const stream = client.messages.stream(
      {
        model: agentModel(),
        max_tokens: 8000,
        system: [{ type: "text", text: systemPrompt(input), cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      },
      { signal },
    );
    stream.on("contentBlock", (block) => {
      if (block.type !== "tool_use") return;
      try {
        const r = applyOp(doc, toOp(block.name, block.input), input.edition);
        doc = r.doc;
        changes.push(r.label);
        emit({ type: "op", label: r.label, doc, sectionId: r.sectionId });
        results.set(block.id, { content: r.sectionId ? `${r.label}. Section id: ${r.sectionId}.` : `${r.label}.` });
      } catch (err) {
        results.set(block.id, { content: err instanceof Error ? err.message : "That change didn't fit the page.", is_error: true });
      }
    });
    const message = await stream.finalMessage();
    reply = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (message.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: message.content as MessageParam["content"] });
    messages.push({
      role: "user",
      content: message.content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ type: "tool_result" as const, tool_use_id: b.id, ...(results.get(b.id) ?? { content: "Not applied.", is_error: true }) })),
    });
  }

  if (!reply) reply = changes.length ? `Done: ${changes.map((c) => c.toLowerCase()).join(", ")}.` : "I didn't change anything.";
  return { doc, reply: tidy(reply), changes };
}
