// Fit Funnels funnel pages: the club templates, the gym and studio example pages
// and sample sites, starter sections in club words, the offline agent building
// club pages from a brief, and the sample A/B tests for clubs.
import { describe, expect, it } from "vitest";
import { planEdits, planPage, runStandIn } from "@/lib/pages/agent/stand-in";
import type { AgentInput } from "@/lib/pages/agent/types";
import { applyOp, applyOps } from "@/lib/pages/ops";
import { buildFromTemplate, FIT_PAGE_TEMPLATES, findTemplate, PAGE_TEMPLATES, templatesFor } from "@/lib/pages/page-templates";
import { emptyPageDoc, findPlaceholders, type PageDoc, parsePageDoc, PLACEHOLDER, SECTION_TYPES, type Section, sectionLabel } from "@/lib/pages/schema";
import { seedPageFor } from "@/lib/pages/seeds";
import { describeChanges } from "@/lib/pages/test-diff";
import { starterSection } from "@/lib/pages/templates";
import { sampleTests } from "@/lib/sample/page-tests";
import { SAMPLE_SITES, sampleSiteFor } from "@/lib/sample/sites";

const allText = (value: unknown) => JSON.stringify(value);
/** Everything a visitor reads, with the [Add ...] placeholders taken out. */
const filledText = (doc: PageDoc) => allText(doc).replace(PLACEHOLDER, "");
const summit = { brand: "Summit Strength Club", accent: "#f76b15" };
const club = (doc: PageDoc, instruction: string, over: Partial<AgentInput> = {}): AgentInput => ({
  doc,
  instruction,
  history: [],
  brand: "Summit Strength Club",
  industry: "gym",
  domain: "summitstrengthclub.com",
  edition: "fit",
  ...over,
});
const build = (instruction: string, over: Partial<AgentInput> = {}) => applyOps(emptyPageDoc(), planPage(club(emptyPageDoc(), instruction, over)), "fit").at(-1)!.doc;
const hero = (doc: PageDoc) => doc.sections.find((s): s is Extract<Section, { type: "hero" }> => s.type === "hero")!;
const form = (doc: PageDoc) => doc.sections.find((s): s is Extract<Section, { type: "form" }> => s.type === "form")!;

describe("club templates", () => {
  it("are their own set of eight, shown instead of the Bison Ops set", () => {
    expect(FIT_PAGE_TEMPLATES).toHaveLength(8);
    expect(templatesFor("fit")).toBe(FIT_PAGE_TEMPLATES);
    expect(templatesFor("bison")).toBe(PAGE_TEMPLATES);
    expect(templatesFor()).toBe(PAGE_TEMPLATES);
    const keys = FIT_PAGE_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(["free-pass", "intro-offer", "class-launch", "pt-consult", "presale", "corporate", "challenge", "tour"]);
    for (const t of PAGE_TEMPLATES) expect(keys).not.toContain(t.key);
  });

  it("each build a valid page with the club's name, a form, and nothing made up", () => {
    for (const t of FIT_PAGE_TEMPLATES) {
      const doc = parsePageDoc(buildFromTemplate(t, summit));
      const text = allText(doc);
      expect(text, t.key).toContain("Summit Strength Club");
      expect(text, t.key).not.toMatch(/—/);
      expect(text, t.key).not.toMatch(/bison|customer/i);
      expect(doc.sections.some((s) => s.type === "form"), `${t.key} has a form`).toBe(true);
      // Every button goes to a section that exists on the page.
      const ids = new Set(doc.sections.map((s) => s.id));
      for (const href of text.match(/"href":"#[a-z-]+"/g) ?? []) expect(ids.has(href.slice(9, -1)), `${t.key} ${href}`).toBe(true);
      // Prices, offers and quotes are the club's to fill in.
      expect(filledText(doc), t.key).not.toMatch(/[$%£€]/);
      for (const s of doc.sections) {
        if (s.type === "offer" && s.price) expect(s.price, `${t.key} price`).toMatch(PLACEHOLDER);
        if (s.type === "quote") expect(s.quote, `${t.key} quote`).toMatch(PLACEHOLDER);
        if (s.type === "stats") for (const i of s.items) expect(i.value, `${t.key} number`).toMatch(PLACEHOLDER);
      }
    }
  });

  it("leave yellow placeholders for prices, dates and times", () => {
    const at = (key: string) => findPlaceholders(buildFromTemplate(findTemplate(key, "fit")!, summit)).map((p) => p.text);
    expect(at("intro-offer")).toContain("[Add the price]");
    expect(at("challenge")).toContain("[Add the start date]");
    expect(at("class-launch")).toContain("[Add the day and time]");
    expect(at("presale")).toContain("[Add the founding rate]");
    expect(at("pt-consult")).toContain("[Add a real member quote]");
  });

  it("are found only in their own edition, and use the club's color unless asked not to", () => {
    const pass = findTemplate("free-pass", "fit")!;
    expect(pass.name).toBe("Free trial pass");
    expect(findTemplate("free-pass")).toBeNull();
    expect(findTemplate("quote", "fit")).toBeNull();
    expect(buildFromTemplate(pass, { ...summit, accent: "#22AA44" }).theme.accent).toBe("#22aa44");
    expect(buildFromTemplate(pass, summit, false).theme.accent).toBe(pass.theme.accent);
  });

  it("still fit when the club's name is very long", () => {
    const long = { brand: "The Extremely Long Named Strength and Conditioning Club of the Pacific Northwest", accent: "#f76b15" };
    for (const t of FIT_PAGE_TEMPLATES) expect(() => parsePageDoc(buildFromTemplate(t, long)), t.key).not.toThrow();
  });
});

describe("club example pages and sample sites", () => {
  it("have a finished free week page for the gym and a first ride page for the studio", () => {
    const gym = seedPageFor("gym");
    const studio = seedPageFor("studio");
    expect([gym.title, gym.slug]).toEqual(["Free week pass", "free-week"]);
    expect([studio.title, studio.slug]).toEqual(["First ride free", "first-ride"]);
    for (const seed of [gym, studio]) {
      const doc = parsePageDoc(seed.doc);
      expect(findPlaceholders(doc), seed.slug).toEqual([]);
      expect(allText(doc), seed.slug).not.toMatch(/—/);
      expect(doc.sections[0].type).toBe("hero");
      expect(doc.sections.at(-1)?.type).toBe("form");
    }
    expect(gym.doc.seo.title).toContain("Summit Strength Club");
    expect(studio.doc.seo.title).toContain("Pulse Cycle Studio");
    // Other kinds of business keep their own page.
    expect(seedPageFor("pools").slug).toBe("spring-glow-sale");
    expect(seedPageFor("nope").slug).toBe("book-a-call");
  });

  it("have a made-up gym and cycling studio site with the paths the sample traffic uses", () => {
    expect(Object.keys(SAMPLE_SITES.gym.pages).sort()).toEqual(["/", "/classes", "/free-pass", "/memberships", "/personal-training"]);
    expect(Object.keys(SAMPLE_SITES.studio.pages).sort()).toEqual(["/", "/first-ride", "/instructors", "/packs", "/schedule"]);
    for (const key of ["gym", "studio"]) {
      const site = sampleSiteFor(key);
      expect(site.ctaPath && site.pages[site.ctaPath], key).toBeTruthy();
      for (const n of site.nav) expect(site.pages[n.path], `${key} ${n.path}`).toBeDefined();
      expect(allText(site), key).not.toMatch(/—/);
    }
    expect(sampleSiteFor("gym").pages["/free-pass"].title).toBe("Free pass");
    expect(sampleSiteFor("studio").pages["/first-ride"].title).toBe("First ride free");
  });
});

describe("starter sections for a club", () => {
  it("read in club words and still make a valid page", () => {
    let doc = emptyPageDoc();
    for (const type of SECTION_TYPES) doc = applyOp(doc, { op: "add_section", section: starterSection(type, "Summit Strength Club", "fit") }, "fit").doc;
    expect(doc.sections.map((s) => s.type)).toEqual([...SECTION_TYPES]);
    expect(allText(doc)).not.toMatch(/customer|Get in touch/);
    const h = hero(doc);
    expect(h.primary).toEqual({ label: "Claim your free pass", href: "#form" });
    expect(form(doc).fields).toContain("phone");
    expect(findPlaceholders(applyOp(emptyPageDoc(), { op: "add_section", section: starterSection("quote", "x", "fit") }).doc).map((p) => p.text)).toEqual([
      "[Add a real member quote]",
      "[Add their name]",
      "[Add how long they've been a member]",
    ]);
  });

  it("stay as they were for Bison Ops", () => {
    expect(starterSection("hero", "Acme")).toEqual(starterSection("hero", "Acme", "bison"));
    expect((starterSection("hero", "Acme") as { primary: { label: string } }).primary.label).toBe("Get in touch");
    expect(starterSection("form", "Acme")).toMatchObject({ heading: "Get in touch", fields: ["name", "email", "message"] });
  });

  it("call a quote a member quote in the change log and in a test's summary", () => {
    expect(sectionLabel("quote", "fit")).toBe("Member quote");
    expect(sectionLabel("quote")).toBe("Customer quote");
    expect(sectionLabel("hero", "fit")).toBe("Hero");
    const live = seedPageFor("gym").doc;
    const r = applyOp(live, { op: "add_section", section: starterSection("quote", "x", "fit") }, "fit");
    expect(r.label).toBe("Added member quote");
    expect(applyOp(live, { op: "add_section", section: starterSection("quote", "x") }).label).toBe("Added customer quote");
    expect(describeChanges(live, r.doc, "fit")).toBe("Adds member quote.");
    expect(describeChanges(live, r.doc)).toBe("Adds customer quote.");
  });
});

describe("the offline agent for a club", () => {
  it("builds a free pass page for a gym brief without making anything up", () => {
    const doc = parsePageDoc(build("A free week pass page for first-time visitors, dark, with what's included and a few common questions"));
    expect(doc.sections.map((s) => s.type)).toEqual(["hero", "features", "offer", "steps", "faq", "form"]);
    expect(doc.theme.mode).toBe("dark");
    expect(hero(doc).primary).toEqual({ label: "Claim your free pass", href: "#form" });
    expect(hero(doc).headline).toBe("Try Summit Strength Club before you join");
    expect(form(doc)).toMatchObject({ heading: "Claim your free pass", fields: ["name", "email", "phone"], submit: "Claim my pass" });
    const faq = doc.sections.find((s) => s.type === "faq");
    expect(faq?.type === "faq" && faq.items.map((i) => i.q)).toEqual(["Is it really free?", "What should I bring?", "What happens after my pass ends?"]);
    // The offer box and answers are the club's to fill in.
    const offer = doc.sections.find((s) => s.type === "offer");
    expect(offer?.type === "offer" && offer.price).toMatch(PLACEHOLDER);
    expect(filledText(doc)).not.toMatch(/[$%]|quote|customer|—/i);
    expect(doc.seo.title).toContain("Summit Strength Club");
    expect(doc.seo.title.length).toBeLessThanOrEqual(70);
  });

  it("reads what kind of club page the brief asks for", () => {
    const cta = (b: string, over?: Partial<AgentInput>) => hero(build(b, over)).primary?.label;
    expect(cta("A corporate wellness page for local employers, with a quote form")).toBe("Get a corporate quote");
    expect(form(build("A corporate wellness page for local employers")).fields).toContain("company");
    expect(cta("A presale page for our new location, dark and bold")).toBe("Join the presale");
    expect(cta("A six-week challenge page starting in January")).toBe("Join the challenge");
    expect(cta("A page to book a personal training consult, clean and light")).toBe("Book a consult");
    // A page the club's site already has borrows its words.
    expect(hero(build("A page to book a personal training consult")).headline).toBe(SAMPLE_SITES.gym.pages["/personal-training"].headline);
    expect(hero(build("A page to book a consult with a trainer")).headline).toBe("Book a consult");
    expect(cta("An intro offer page for new members")).toBe("Claim the offer");
    expect(cta("A page to launch our new HIIT class")).toBe("Save my spot");
    expect(cta("A page to book a club tour")).toBe("Book a tour");
    // A trial is only called free when the brief says so.
    expect(cta("A trial pass page")).toBe("Claim your pass");
    expect(cta("Something about the club")).toBe("Book a tour");
  });

  it("uses what the brief says, and steps that fit the kind of page", () => {
    // A price the person gave goes in; anything else stays a placeholder.
    const intro = build("An intro offer page: first month for $1 through March");
    const box = intro.sections.find((s) => s.type === "offer");
    expect(box?.type === "offer" && [box.price, box.note]).toEqual(["$1", "Good through March."]);
    expect(hero(build("A page to launch our new HIIT class")).headline).toBe("New HIIT class, now on the schedule");
    const steps = (doc: PageDoc) => doc.sections.find((s) => s.type === "steps");
    const corporate = steps(build("A corporate wellness page for local employers"));
    expect(corporate?.type === "steps" && corporate.items.map((i) => i.title)).toEqual(["Tell us about your team", "Get a quote", "Your staff sign up"]);
    expect(steps(build("A page to launch our new HIIT class"))).toBeUndefined();
  });

  it("builds a first ride page for a cycling studio", () => {
    const doc = parsePageDoc(build("A first ride free page for new riders, with how it works", { brand: "Pulse Cycle Studio", industry: "studio", domain: "pulsecyclestudio.com" }));
    expect(hero(doc).primary?.label).toBe("Book your free ride");
    expect(form(doc).submit).toBe("Book my free ride");
    expect(allText(doc)).toContain("Pulse Cycle Studio");
    expect(doc.sections.map((s) => s.type)).toContain("steps");
  });

  it("knows a gym or studio is a club even when the edition isn't passed", () => {
    const doc = build("A free week pass page", { edition: undefined });
    expect(hero(doc).primary?.label).toBe("Claim your free pass");
  });

  it("streams a club page and adds a member quote when asked", async () => {
    const r = await runStandIn(club(emptyPageDoc(), "A free week pass page with a short form"), () => {});
    expect(() => parsePageDoc(r.doc)).not.toThrow();
    expect(r.reply).toMatch(/^Built a \d-section page/);
    const ops = planEdits(seedPageFor("gym").doc, "Add a member quote", "Summit Strength Club", "fit");
    const after = applyOps(seedPageFor("gym").doc, ops, "fit").at(-1)!;
    expect(after.label).toBe("Added member quote");
    expect(findPlaceholders(after.doc).map((p) => p.text)).toContain("[Add a real member quote]");
    const edited = await runStandIn(club(seedPageFor("gym").doc, "Add a member quote"), () => {});
    expect(edited.reply).toMatch(/^Done: added member quote\./);
  });
});

describe("sample A/B tests for a club", () => {
  const tenant = (industry: string) => ({ id: "00000000-0000-4000-8000-000000000003", name: "Club", industry }) as never;

  it("test a gym headline on the free week page", () => {
    const [running] = sampleTests(tenant("gym"));
    expect(running.pageTitle).toBe("Free week pass");
    const b = running.versions.find((v) => v.key === "b")!;
    expect(b.doc && hero(b.doc).headline).toBe("Seven free days, no card needed");
    expect(running.hypothesis).toMatch(/free pass requests/);
    expect(running.hypothesis).not.toMatch(/quote/);
  });

  it("test a studio headline on the first ride page", () => {
    const [running] = sampleTests(tenant("studio"));
    expect(running.pageTitle).toBe("First ride free");
    const b = running.versions.find((v) => v.key === "b")!;
    expect(b.doc && hero(b.doc).headline).toBe("New to indoor cycling? Your first ride is free");
    expect(running.hypothesis).toMatch(/first ride bookings/);
  });

  it("keep the Bison Ops wording for other businesses", () => {
    expect(sampleTests(tenant("pools"))[0].hypothesis).toMatch(/more quote requests\.$/);
  });
});
