// The Claude page agent's tool loop, against a simulated Messages API stream.
// No network and no key: the client's fetch is replaced with canned responses.
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { runClaude } from "@/lib/pages/agent/claude";
import type { AgentEvent } from "@/lib/pages/agent/types";
import { emptyPageDoc } from "@/lib/pages/schema";

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };

/** One streamed assistant message, as server-sent events. */
function sse(blocks: Block[], stopReason: "tool_use" | "end_turn"): string {
  const events: [string, unknown][] = [
    ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "test", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
  ];
  blocks.forEach((b, index) => {
    if (b.type === "text") {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: b.text } }]);
    } else {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } }]);
    }
    events.push(["content_block_stop", { type: "content_block_stop", index }]);
  });
  events.push(["message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 20 } }]);
  events.push(["message_stop", { type: "message_stop" }]);
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

function fakeClient(responses: string[]) {
  const requests: { messages: { role: string; content: unknown }[]; system: unknown; tools: { name: string }[] }[] = [];
  const fetch = async (_url: unknown, init?: { body?: unknown }) => {
    requests.push(JSON.parse(String(init?.body)));
    const body = responses.shift();
    if (!body) throw new Error("No more canned responses");
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  return { client: new Anthropic({ apiKey: "test", fetch: fetch as never, maxRetries: 0 }), requests };
}

const input = (instruction: string) => ({ doc: emptyPageDoc(), instruction, history: [{ role: "user" as const, text: "earlier" }, { role: "agent" as const, text: "ok" }], brand: "Brightwater Pools", industry: "pools", domain: "brightwaterpools.com" });

describe("the Claude page agent", () => {
  it("applies each tool call as it arrives, reports bad ones back, and ends with the reply", async () => {
    const { client, requests } = fakeClient([
      sse(
        [
          { type: "tool_use", id: "t1", name: "set_theme", input: { mode: "dark" } },
          { type: "tool_use", id: "t2", name: "add_section", input: { section: { type: "hero", headline: "Your pool — lit from within", primary: { label: "Get a quote", href: "#form" } } } },
          { type: "tool_use", id: "t3", name: "add_section", input: { section: { type: "hero", headline: "Bad link", primary: { label: "Go", href: "javascript:alert(1)" } } } },
        ],
        "tool_use",
      ),
      sse(
        [
          { type: "tool_use", id: "t4", name: "add_section", input: { section: { type: "form", id: "form", heading: "Get a quote", fields: ["name", "email"], submit: "Send", success: "Thanks." } } },
          { type: "text", text: "Built a dark page with a hero and a quote form." },
        ],
        "end_turn",
      ),
    ]);
    const events: AgentEvent[] = [];
    const result = await runClaude(input("Build a dark quote page"), (e) => events.push(e), undefined, client);

    expect(result.changes).toEqual(["Changed the style", "Added hero", "Added form"]);
    expect(result.doc.theme.mode).toBe("dark");
    expect(result.doc.sections.map((s) => s.id)).toEqual(["hero", "form"]);
    // Em dashes never make it onto the page.
    const hero = result.doc.sections[0];
    expect(hero.type === "hero" && hero.headline).toBe("Your pool, lit from within");
    expect(result.reply).toBe("Built a dark page with a hero and a quote form.");
    expect(events.filter((e) => e.type === "op")).toHaveLength(3);

    // The second request carries a result for every tool call, with the bad link reported as an error.
    expect(requests).toHaveLength(2);
    const results = requests[1].messages.at(-1)!.content as { tool_use_id: string; is_error?: boolean; content: string }[];
    expect(results.map((r) => r.tool_use_id)).toEqual(["t1", "t2", "t3"]);
    expect(results[2].is_error).toBe(true);
    expect(results[2].content).toMatch(/web address/);
    expect(results[1].content).toMatch(/Section id: hero/);

    // The page and the request go in the last user turn, after the earlier conversation.
    expect(requests[0].messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(JSON.stringify(requests[0].messages[2].content)).toContain("Build a dark quote page");
    // The page is cached so later rounds don't pay for it again.
    expect(JSON.stringify(requests[0].messages[2].content)).toContain('"cache_control":{"type":"ephemeral"}');
    expect(requests[0].tools.map((t) => t.name)).toEqual(["add_section", "update_section", "remove_section", "move_section", "set_theme", "set_seo"]);
  });

  it("tells the model it's working for a gym or studio in Fit Funnels, with club facts it must not make up", async () => {
    const system = async (over: Record<string, unknown>) => {
      const { client, requests } = fakeClient([sse([{ type: "text", text: "Nothing to change." }], "end_turn")]);
      await runClaude({ ...input("Hi"), ...over }, () => {}, undefined, client);
      return (requests[0].system as { text: string }[])[0].text;
    };
    const gym = await system({ brand: "Summit Strength Club", industry: "gym", domain: "summitstrengthclub.com", edition: "fit" });
    expect(gym).toContain("inside Fit Funnels");
    expect(gym).toContain("Summit Strength Club is a gym and health club.");
    expect(gym).toMatch(/class times, schedules/);
    expect(gym).toMatch(/member counts, results, before-and-after claims/);
    expect(gym).toContain("Never promise health, weight-loss or fitness results.");
    expect(gym).toContain("Sends land in the club's Leads.");
    expect(gym).not.toMatch(/Bison Ops|customer|Contacts/);
    expect(gym).not.toMatch(/—/);
    expect(await system({ brand: "Pulse Cycle Studio", industry: "studio", edition: "fit" })).toContain("Pulse Cycle Studio is a fitness studio.");
    const pools = await system({});
    expect(pools).toContain("inside Bison Ops. The person you're talking to works there.");
    expect(pools).toContain("Sends land in the company's Contacts.");
    expect(pools).not.toContain("Fit Funnels");
  });

  it("stops after a few rounds even if the model keeps calling tools", async () => {
    const loop = () => sse([{ type: "tool_use", id: `t${Math.random()}`, name: "remove_section", input: { id: "nope" } }], "tool_use");
    const { client, requests } = fakeClient(Array.from({ length: 10 }, loop));
    const result = await runClaude(input("Loop"), () => {}, undefined, client);
    expect(requests).toHaveLength(6);
    expect(result.changes).toEqual([]);
    expect(result.reply).toBe("I didn't change anything.");
  });
});
