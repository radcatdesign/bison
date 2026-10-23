// Landing pages: the document model, the ops the editor and agent share, and the
// offline agent that stands in for Claude.
import { describe, expect, it } from "vitest";
import { planEdits, planPage, runStandIn } from "@/lib/pages/agent/stand-in";
import type { AgentEvent, AgentInput } from "@/lib/pages/agent/types";
import { applyOp, applyOps } from "@/lib/pages/ops";
import { emptyPageDoc, findPlaceholders, type PageDoc, PageDocError, parsePageDoc, titleFromBrief } from "@/lib/pages/schema";
import { seedPageFor } from "@/lib/pages/seeds";
import { SECTION_TYPES } from "@/lib/pages/schema";
import { starterSection } from "@/lib/pages/templates";

const pools = seedPageFor("pools").doc;
const input = (doc: PageDoc, instruction: string): AgentInput => ({ doc, instruction, history: [], brand: "Brightwater Pools", industry: "pools", domain: "brightwaterpools.com" });
const allText = (doc: PageDoc) => JSON.stringify(doc);

describe("page documents", () => {
  it("accept every demo page and every starter section", () => {
    for (const industry of ["pools", "coffee", "general"]) expect(() => parsePageDoc(seedPageFor(industry).doc)).not.toThrow();
    let doc = emptyPageDoc();
    for (const type of SECTION_TYPES) doc = applyOp(doc, { op: "add_section", section: starterSection(type, "Acme") }).doc;
    expect(doc.sections.map((s) => s.type)).toEqual([...SECTION_TYPES]);
  });

  it("refuse links that could run code or go nowhere", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,hi", "/relative", "//evil.example", "#Bad Id"]) {
      expect(() => applyOp(pools, { op: "update_section", id: "hero", changes: { primary: { label: "Go", href } } }), href).toThrow(PageDocError);
    }
    for (const href of ["https://example.com/a?b=c", "mailto:hi@example.com", "tel:+1 541 555 0100", "#form"]) {
      expect(() => applyOp(pools, { op: "update_section", id: "hero", changes: { primary: { label: "Go", href } } }), href).not.toThrow();
    }
  });

  it("need an email field on every form", () => {
    expect(() => applyOp(pools, { op: "update_section", id: "form", changes: { fields: ["name", "phone"] } })).toThrow(/email/);
  });

  it("refuse two sections with the same id, and more than 16 sections", () => {
    expect(() => parsePageDoc({ ...pools, sections: [pools.sections[0], pools.sections[0]] })).toThrow(/share the id/);
    let doc = emptyPageDoc();
    for (let i = 0; i < 16; i++) doc = applyOp(doc, { op: "add_section", section: starterSection("text", "Acme") }).doc;
    expect(() => applyOp(doc, { op: "add_section", section: starterSection("text", "Acme") })).toThrow(/up to 16/);
  });

  it("find the [Add ...] placeholders that block publishing", () => {
    expect(findPlaceholders(pools)).toEqual([]);
    const withQuote = applyOp(pools, { op: "add_section", section: starterSection("quote", "Acme") }).doc;
    expect(findPlaceholders(withQuote).map((p) => p.text)).toEqual(["[Add a real customer quote]", "[Add their name]", "[Add their company or town]"]);
  });

  it("name a page from a brief", () => {
    expect(titleFromBrief("A spring sale page for glow aggregate, 15% off through May")).toBe("Spring sale: glow aggregate");
    expect(titleFromBrief("Build me a landing page for our wholesale program")).toBe("Wholesale program");
    expect(titleFromBrief("Launch waitlist, dark and minimal")).toBe("Launch waitlist");
    expect(titleFromBrief("   ")).toBe("Untitled page");
  });
});

describe("page ops", () => {
  it("give new sections unique ids and put them where asked", () => {
    const a = applyOp(pools, { op: "add_section", section: { ...starterSection("faq", "x") } });
    expect(a.sectionId).toBe("faq-2");
    expect(a.doc.sections.at(-1)?.id).toBe("faq-2");
    const b = applyOp(pools, { op: "add_section", section: starterSection("cta", "x"), after: "start" });
    expect(b.doc.sections[0].type).toBe("cta");
    const c = applyOp(pools, { op: "add_section", section: starterSection("text", "x"), after: "hero" });
    expect(c.doc.sections[1].type).toBe("text");
  });

  it("change only the fields given, remove fields set to null, and never change a section's type", () => {
    const r = applyOp(pools, { op: "update_section", id: "hero", changes: { headline: "New headline", secondary: null } });
    const hero = r.doc.sections[0];
    expect(hero.type === "hero" && hero.headline).toBe("New headline");
    expect(hero.type === "hero" && hero.secondary).toBeUndefined();
    expect(hero.type === "hero" && hero.eyebrow).toBe("Spring sale: 15% off through May");
    expect(() => applyOp(pools, { op: "update_section", id: "hero", changes: { type: "faq" } })).toThrow(/can't change type/);
    expect(() => applyOp(pools, { op: "update_section", id: "nope", changes: {} })).toThrow(/no section/);
  });

  it("move and remove sections, and check theme values", () => {
    const moved = applyOp(pools, { op: "move_section", id: "form", to: 0 }).doc;
    expect(moved.sections[0].id).toBe("form");
    expect(applyOp(pools, { op: "move_section", id: "hero", to: 99 }).doc.sections.at(-1)?.id).toBe("hero");
    expect(applyOp(pools, { op: "remove_section", id: "faq" }).doc.sections.map((s) => s.id)).not.toContain("faq");
    expect(applyOp(pools, { op: "set_theme", changes: { accent: "#FF0000" } }).doc.theme.accent).toBe("#ff0000");
    expect(() => applyOp(pools, { op: "set_theme", changes: { accent: "red" } })).toThrow(PageDocError);
  });

  it("apply a list in order", () => {
    const results = applyOps(emptyPageDoc(), [
      { op: "add_section", section: starterSection("hero", "x") },
      { op: "add_section", section: starterSection("form", "x") },
      { op: "set_theme", changes: { mode: "dark" } },
    ]);
    expect(results.map((r) => r.label)).toEqual(["Added hero", "Added form", "Changed the style"]);
    expect(results.at(-1)?.doc.theme.mode).toBe("dark");
  });
});

describe("the offline agent", () => {
  const brief = "A spring sale page for glow aggregate, 15% off through May, dark and premium, with a quote form and a few common questions";

  it("builds a page from a brief without making anything up", () => {
    const doc = applyOps(emptyPageDoc(), planPage(input(emptyPageDoc(), brief))).at(-1)!.doc;
    expect(doc.sections.map((s) => s.type)).toEqual(["hero", "features", "offer", "steps", "faq", "form"]);
    expect(doc.theme).toMatchObject({ mode: "dark", font: "editorial" });
    const hero = doc.sections[0];
    expect(hero.type === "hero" && hero.headline).toBe("Glow aggregate for plaster and pebble");
    expect(hero.type === "hero" && hero.eyebrow).toBe("15% off through May");
    expect(hero.type === "hero" && hero.primary).toEqual({ label: "Get a quote", href: "#form" });
    const offer = doc.sections.find((s) => s.type === "offer");
    expect(offer?.type === "offer" && offer.note).toBe("Good through May.");
    // Answers only the business knows are left for them to fill in.
    expect(findPlaceholders(doc).every((p) => /\[Add (the answer|how soon you reply)\]/.test(p.text))).toBe(true);
    expect(allText(doc)).not.toMatch(/—/);
    expect(doc.seo.title.length).toBeLessThanOrEqual(70);
  });

  it("reads what the page asks people to do", () => {
    const build = (b: string) => applyOps(emptyPageDoc(), planPage(input(emptyPageDoc(), b))).at(-1)!.doc;
    const consult = build("A page to book a free pool design consultation, light and elegant");
    expect(consult.sections[0].type === "hero" && consult.sections[0].headline).toBe("Book a free pool design consultation");
    expect(consult.sections.map((s) => s.type)).not.toContain("offer");
    const list = build("A page for our launch list, with a sign up form");
    expect(list.sections[0].type === "hero" && list.sections[0].headline).toBe("Join the launch list");
    expect(list.sections.map((s) => s.type)).toEqual(["hero", "features", "form"]);
    expect(findPlaceholders(list)).toEqual([]);
  });

  it("follows short changes", () => {
    const ops = planEdits(pools, 'Make it light and add a customer quote. Change the headline to "Glow, after dark"', "Brightwater Pools");
    const doc = applyOps(pools, ops).at(-1)!.doc;
    expect(doc.theme.mode).toBe("light");
    const hero = doc.sections[0];
    expect(hero.type === "hero" && hero.headline).toBe("Glow, after dark");
    // New sections go before the closing form.
    expect(doc.sections.map((s) => s.type).slice(-2)).toEqual(["quote", "form"]);
  });

  it("removes and moves sections by name", () => {
    const doc = applyOps(pools, planEdits(pools, "remove the offer, then move the form to the top", "x")).at(-1)!.doc;
    expect(doc.sections.map((s) => s.id)).toEqual(["form", "hero", "features", "steps", "faq"]);
  });

  it("says what it can do when it doesn't understand, and changes nothing", async () => {
    const events: AgentEvent[] = [];
    const r = await runStandIn(input(pools, "write me a poem about pools"), (e) => events.push(e));
    expect(r.changes).toEqual([]);
    expect(r.doc).toEqual(pools);
    expect(r.reply).toMatch(/short, direct requests/);
    expect(events).toEqual([]);
  });

  it("streams each change and ends with a valid page", async () => {
    const events: AgentEvent[] = [];
    const r = await runStandIn(input(emptyPageDoc(), brief), (e) => events.push(e));
    expect(events.filter((e) => e.type === "op").length).toBe(r.changes.length);
    expect(() => parsePageDoc(r.doc)).not.toThrow();
    expect(r.reply).toMatch(/^Built a 6-section page/);
  });

  it("treats 'make the page darker' as a change, not a new page", async () => {
    const r = await runStandIn(input(pools, "Make the page dark"), () => {});
    expect(r.doc.sections).toHaveLength(pools.sections.length);
  });
});

describe("page templates", () => {
  const ctx = { brand: "Brightwater Pools", accent: "#2ef2d0" };

  it("all build valid pages with the company's name in them and nothing made up", async () => {
    const { PAGE_TEMPLATES, buildFromTemplate } = await import("@/lib/pages/page-templates");
    expect(new Set(PAGE_TEMPLATES.map((t) => t.key)).size).toBe(PAGE_TEMPLATES.length);
    expect(PAGE_TEMPLATES.length).toBeGreaterThanOrEqual(8);
    for (const t of PAGE_TEMPLATES) {
      const doc = parsePageDoc(buildFromTemplate(t, ctx));
      expect(allText(doc), t.key).toContain("Brightwater Pools");
      expect(allText(doc), t.key).not.toMatch(/—/);
      expect(doc.sections.some((s) => s.type === "form"), `${t.key} has a form`).toBe(true);
      // Every button goes to a section that exists on the page.
      const ids = new Set(doc.sections.map((s) => s.id));
      for (const href of allText(doc).match(/"href":"#[a-z-]+"/g) ?? []) expect(ids.has(href.slice(9, -1)), `${t.key} ${href}`).toBe(true);
    }
  });

  it("use the company's color unless asked to keep their own", async () => {
    const { findTemplate, buildFromTemplate } = await import("@/lib/pages/page-templates");
    const launch = findTemplate("launch")!;
    expect(buildFromTemplate(launch, ctx).theme.accent).toBe("#2ef2d0");
    expect(buildFromTemplate(launch, ctx, false).theme.accent).toBe(launch.theme.accent);
    expect(findTemplate("nope")).toBeNull();
  });

  it("still fit when the company name is very long", async () => {
    const { PAGE_TEMPLATES, buildFromTemplate } = await import("@/lib/pages/page-templates");
    const long = { brand: "The Extremely Long Named Pool and Spa Supply Company of the Pacific Northwest", accent: "#3b5bff" };
    for (const t of PAGE_TEMPLATES) expect(() => parsePageDoc(buildFromTemplate(t, long)), t.key).not.toThrow();
  });
});
