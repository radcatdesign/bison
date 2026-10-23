// Fit Funnels in Marketing and Analyze: the club presets and sample data, the
// setup steps, the starter follow-ups and templates, all in club words, with
// Bison Ops words left as they were.
import { describe, expect, it } from "vitest";
import { editionFor } from "@/config/editions";
import { emailProblems } from "@/lib/email/ops";
import { emailDocSchema, findEmailPlaceholders } from "@/lib/email/schema";
import { CLUB_EMAIL_TEMPLATES, EMAIL_TEMPLATES, emailTemplatesFor, findEmailTemplate } from "@/lib/email/templates";
import { buildLlmsTxt, type SearchContext } from "@/lib/marketing/search";
import { businessTypesFor, defaultBusinessType, defaultMarketingSettings, offerTerms, searchSettingsSchema } from "@/lib/marketing/settings";
import { buildSetup, progressOf, type SetupFacts } from "@/lib/marketing/setup-steps";
import { extraStarterSeries, starterSeries } from "@/lib/marketing/starter";
import { sampleAnalytics, sampleContacts, sampleLandingPages } from "@/lib/sample/generate";
import { INDUSTRIES } from "@/lib/sample/industries";
import { sampleLists, sampleSentNewsletter, sampleSeriesHistory, sampleSubscribers } from "@/lib/sample/marketing";

const summit = { id: "33333333-3333-4333-8333-333333333333", name: "Summit Strength Club", industry: "gym" };
const pulse = { id: "44444444-4444-4444-8444-444444444444", name: "Pulse Cycle Studio", industry: "studio" };
const now = new Date("2026-10-21T17:30:00Z");

const EM_DASH = "\u2014";

/** Every string in a value, for checking words. */
const text = (v: unknown) => JSON.stringify(v);

describe("club presets", () => {
  it("exist for both Fit Funnels kinds of business, with the labels onboarding shows", () => {
    expect(INDUSTRIES.gym.label).toBe("Gym or health club");
    expect(INDUSTRIES.studio.label).toBe("Boutique studio");
    expect(editionFor("fit").industries.map((k) => INDUSTRIES[k]?.label)).toEqual(["Gym or health club", "Boutique studio"]);
  });

  it("cover the paths the seed's traffic lands on", () => {
    expect(INDUSTRIES.gym.pages).toEqual(expect.arrayContaining(["/", "/memberships", "/classes", "/personal-training", "/free-pass"]));
    expect(INDUSTRIES.studio.pages).toEqual(expect.arrayContaining(["/", "/schedule", "/first-ride", "/packs", "/instructors"]));
  });

  it('have stable "I am a..." values', () => {
    expect(INDUSTRIES.gym.signupTypes.map((t) => t.value)).toEqual(["thinking-about-joining", "member", "former-member"]);
    expect(INDUSTRIES.studio.signupTypes.map((t) => t.value)).toEqual(["new-rider", "member", "company"]);
    expect(defaultMarketingSettings({ name: "Summit Strength Club", industry: "gym", accent: "#f76b15", edition: "fit" }).signup.types).toEqual(INDUSTRIES.gym.signupTypes);
  });
});

describe("club sample data", () => {
  it("is the same every time for one club, and different between clubs", () => {
    for (const t of [summit, pulse]) {
      expect(sampleContacts(t, now)).toEqual(sampleContacts(t, now));
      expect(sampleAnalytics(t, 30, now)).toEqual(sampleAnalytics(t, 30, now));
      expect(sampleLandingPages(t, 30, now)).toEqual(sampleLandingPages(t, 30, now));
      expect(sampleSubscribers(t, now)).toEqual(sampleSubscribers(t, now));
    }
    expect(sampleContacts(summit, now).map((c) => c.email)).not.toEqual(sampleContacts(pulse, now).map((c) => c.email));
  });

  it("uses the club's own requests, pages and lists", () => {
    const gymForms = new Set(INDUSTRIES.gym.forms.map((f) => f.type));
    for (const c of sampleContacts(summit, now)) expect(gymForms.has(c.formType ?? "")).toBe(true);
    expect(sampleAnalytics(summit, 30, now).topPages.map((p) => p.path)).toContain("/free-pass");
    expect(sampleLandingPages(pulse, 30, now).map((p) => p.path).sort()).toEqual([...INDUSTRIES.studio.pages].sort());
    expect(sampleLists(summit).map((l) => l.name)).toEqual(["Members", "Trial leads", "Corporate"]);
    expect(sampleLists(pulse).map((l) => l.name)).toEqual(["Members", "New riders", "Corporate and teams"]);
  });

  it("puts people on the list that matches what they said they are", () => {
    const [members, trials] = sampleLists(summit);
    const subs = sampleSubscribers(summit, now);
    expect(subs.filter((s) => s.listIds.includes(members.id)).every((s) => s.kind === "member")).toBe(true);
    expect(subs.filter((s) => s.listIds.includes(trials.id)).every((s) => s.kind === "thinking-about-joining")).toBe(true);
    expect(subs.filter((s) => s.source === "page").every((s) => s.sourceDetail === "page:free-pass")).toBe(true);
  });

  it("names the club's follow-up and newsletter in the demo", () => {
    expect(sampleSeriesHistory("gym").series).toBe("New lead follow-up");
    expect(sampleSeriesHistory("pools")).toEqual({ series: "Welcome series", subject: "Welcome! Here's what to expect" });
    expect(sampleSentNewsletter("pools").subject).toBe("October news: night swims are back");
    expect(sampleSentNewsletter("studio").subject).not.toMatch(/swim|pool/i);
  });
});

describe("setup steps", () => {
  const none: SetupFacts = {
    canManageSettings: true,
    sending: { domain: false, verified: false, tested: false },
    brand: { saved: false, logo: false, address: false },
    signup: { saved: false, formOnPage: false },
    subscribers: { count: 0, lists: 0 },
    series: { starterReady: false, anyOn: false },
    newsletters: { count: 0, tested: false, sentOrScheduled: false },
    offer: { saved: false, on: false, inEmail: false },
    search: { described: false, contact: false, publishedPage: false, submitted: false },
    tests: { publishedPage: false, created: false, started: false, ended: false, canStart: true },
  };
  const tool = (edition: "bison" | "fit", key: string) => buildSetup(none, edition).find((t) => t.key === key)!;

  it("read in club words for Fit Funnels", () => {
    expect(tool("fit", "offer").name).toBe("Intro offer");
    expect(tool("fit", "series").name).toBe("Follow-ups");
    expect(tool("fit", "subscribers").steps.find((s) => s.key === "subscribers.form")).toMatchObject({ title: "Put a signup form on a funnel page", cta: "Open Funnel pages" });
    expect(tool("fit", "tests").summary).toContain("funnel page");
    const words = text(buildSetup(none, "fit"));
    expect(words).not.toMatch(/landing page|welcome series|welcome offer|homeowner|wholesale|first-time buyers|yourcompany/i);
    expect(words).not.toContain(EM_DASH);
  });

  it("leave Bison Ops words as they were", () => {
    expect(buildSetup(none)).toEqual(buildSetup(none, "bison"));
    expect(tool("bison", "offer").name).toBe("Welcome offer");
    expect(tool("bison", "series").name).toBe("Welcome series");
    expect(tool("bison", "subscribers").steps.find((s) => s.key === "subscribers.lists")?.body).toBe("Lists let you send to just homeowners, or just wholesale buyers. Skip this if you send everything to everyone.");
    expect(tool("bison", "search").steps.find((s) => s.key === "search.contact")?.body).toBe('Shown to search engines as structured data, so they can answer questions like "Are they open Saturday?"');
  });

  it("are the same steps in both editions: only the words change", () => {
    const shape = (edition: "bison" | "fit") => buildSetup(none, edition).map((t) => [t.key, t.href, t.optional, t.steps.map((s) => [s.key, s.done, s.href, s.optional, s.manual, Boolean(s.blockedNote)])]);
    expect(shape("fit")).toEqual(shape("bison"));
    expect(progressOf(buildSetup(none, "fit"))).toMatchObject({ done: 0, total: progressOf(buildSetup(none)).total });
  });
});

describe("the club's starter follow-ups", () => {
  const fit = starterSeries("summitstrength.club", "fit");
  const extras = extraStarterSeries("summitstrength.club", "fit");
  const all = [fit, ...extras];

  it("start with a new lead follow-up and a welcome to the club for members", () => {
    expect(fit.name).toBe("New lead follow-up");
    expect(extras.map((x) => [x.name, x.trigger])).toEqual([["Welcome to the club", "manual"]]);
    expect(extraStarterSeries("brightwaterpools.com")).toEqual([]);
    expect(starterSeries("brightwaterpools.com").name).toBe("Welcome series");
  });

  it("leave what only the club knows as yellow spots", () => {
    expect(fit.steps.map((x) => emailProblems(x.doc, x.subject, x.preheader).length > 0)).toEqual([true, true, false]);
    expect(findEmailPlaceholders(fit.steps[0].doc).length).toBeGreaterThan(0);
    for (const x of extras[0].steps) expect(findEmailPlaceholders(x.doc, x.subject).length, x.subject).toBeGreaterThan(0);
  });

  it("parse, link to the club's site, and have no em dashes", () => {
    for (const series of all) {
      for (const x of series.steps) expect(emailDocSchema.safeParse(x.doc).success, x.subject).toBe(true);
    }
    expect(text(all)).toContain("https://summitstrength.club");
    expect(text(all)).not.toContain(EM_DASH);
  });

  it("show the intro offer code in the first email", () => {
    expect(fit.steps[0].doc.sections.find((s) => s.type === "offer")).toMatchObject({ heading: "Your intro offer" });
  });
});

describe("club newsletters, offer and search words", () => {
  it("ship club templates that parse and leave facts as spots to fill in", () => {
    expect(emailTemplatesFor("fit")).toBe(CLUB_EMAIL_TEMPLATES);
    expect(emailTemplatesFor("bison")).toBe(EMAIL_TEMPLATES);
    for (const t of CLUB_EMAIL_TEMPLATES) {
      expect(emailDocSchema.safeParse(t.doc("https://example.com")).success, t.key).toBe(true);
      expect(emailProblems(t.doc("https://example.com"), t.subject, t.preheader).length, t.key).toBeGreaterThan(0);
    }
    expect(text(CLUB_EMAIL_TEMPLATES.map((t) => ({ ...t, doc: t.doc("https://example.com") })))).not.toContain(EM_DASH);
    expect(findEmailTemplate("schedule", "fit")?.name).toBe("Class schedule");
    expect(findEmailTemplate("schedule")).toBeNull();
  });

  it("word the intro offer's code for a first purchase", () => {
    expect(offerTerms({ kind: "percent", value: 15 }, new Date("2026-11-30T20:00:00Z"), "America/Los_Angeles", "fit")).toBe("15% off your first purchase. New members only, one per person. Use it by November 30, 2026.");
    expect(defaultMarketingSettings({ name: "Pulse Cycle Studio", industry: "studio", accent: "#f76b15", edition: "fit" }).offer.prefix).toBe("INTRO");
    expect(defaultMarketingSettings({ name: "Brightwater Pools", industry: "pools", accent: "#3b5bff" }).offer.prefix).toBe("WELCOME");
  });

  it("sign club emails as the club", () => {
    const brand = defaultMarketingSettings({ name: "Summit Strength Club", industry: "gym", accent: "#f76b15", domain: "summitstrength.club", edition: "fit" }).brand;
    expect(brand.signOff).toBe("See you at the club,\nThe Summit Strength Club team");
    expect(brand.footerNote).toBe("You're getting this because you're a member or signed up at summitstrength.club.");
  });

  it("mark gyms and studios up as ExerciseGym", () => {
    expect(defaultBusinessType("gym")).toBe("ExerciseGym");
    expect(defaultBusinessType("studio")).toBe("ExerciseGym");
    expect(defaultBusinessType("pools")).toBe("HomeAndConstructionBusiness");
    expect(businessTypesFor("fit")[0]).toBe("ExerciseGym");
    expect(businessTypesFor("bison")).not.toContain("ExerciseGym");
    expect(businessTypesFor("bison", "ExerciseGym")).toContain("ExerciseGym");
  });

  it("list a club's memberships in llms.txt", () => {
    const settings = defaultMarketingSettings({ name: "Summit Strength Club", industry: "gym", accent: "#f76b15", edition: "fit" });
    const c: SearchContext = {
      name: "Summit Strength Club",
      tenantSlug: "summit-strength-club",
      site: "summitstrength.club",
      base: "https://app.test",
      brand: settings.brand,
      search: searchSettingsSchema.parse({ businessType: "ExerciseGym" }),
      pages: [],
      products: [{ slug: "monthly", name: "Monthly membership", summary: "", price: "$1", updatedAt: now }],
      edition: "fit",
    };
    expect(buildLlmsTxt(c)).toContain("## Memberships, packs and gear");
    expect(buildLlmsTxt({ ...c, edition: undefined })).toContain("## Products");
  });
});
