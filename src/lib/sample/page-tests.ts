// Made-up A/B test results, for sample mode and the demo. The same test gets
// the same numbers every time. Never written to the database. Gyms and studios
// (Fit Funnels) get club headlines and hypotheses.
import type { PageTest, DayCount, TestVersion } from "@/lib/pages/tests";
import type { PageDoc } from "@/lib/pages/schema";
import { seedPageFor } from "@/lib/pages/seeds";
import { sampleUuid } from "./sales";
import { seeded } from "./random";
import type { SampleTenant } from "./marketing";

const DAY = 86_400_000;

/** Daily visitors and conversions per version, for a test that's run `days` days. */
export function sampleDays(testId: string, versions: { key: TestVersion["key"]; weight: number }[], days: number, now = new Date()): DayCount[] {
  const rand = seeded(`page-test:${testId}`);
  const base = 0.028 + rand.next() * 0.03;
  // Each version's true rate: B does a bit better more often than not, so the demo has something to call.
  const truth = new Map(versions.map((v) => [v.key, v.key === "a" ? base : base * (0.85 + rand.next() * 0.6)]));
  const out: DayCount[] = [];
  for (let d = Math.max(0, days - 1); d >= 0; d--) {
    const day = new Date(now.getTime() - d * DAY).toISOString().slice(0, 10);
    const traffic = 60 + rand.int(0, 90) + (new Date(day).getUTCDay() % 6 === 0 ? -25 : 0);
    for (const v of versions) {
      const visitors = Math.max(0, Math.round((traffic * v.weight) / 100));
      let conversions = 0;
      for (let i = 0; i < visitors; i++) if (rand.next() < truth.get(v.key)!) conversions++;
      out.push({ day, key: v.key, visitors, conversions });
    }
  }
  return out;
}

const sum = (days: DayCount[], key: string) => days.filter((d) => d.key === key).reduce((n, d) => ({ visitors: n.visitors + d.visitors, conversions: n.conversions + d.conversions }), { visitors: 0, conversions: 0 });

/** A real test with made-up results laid over it. */
export function withSampleResults(t: PageTest, now = new Date()): { test: PageTest; days: DayCount[] } {
  if (t.status === "draft" || !t.startedAt) return { test: t, days: [] };
  const n = Math.max(1, Math.ceil(((t.endedAt?.getTime() ?? now.getTime()) - t.startedAt.getTime()) / DAY));
  const days = sampleDays(t.id, t.versions, n, t.endedAt ?? now);
  return { test: { ...t, versions: t.versions.map((v) => ({ ...v, ...sum(days, v.key) })) }, days };
}

function variantOf(doc: PageDoc, change: (d: PageDoc) => void): PageDoc {
  const copy = JSON.parse(JSON.stringify(doc)) as PageDoc;
  change(copy);
  return copy;
}

const HEADLINES: Record<string, string> = {
  pools: "Glow that lasts all night, with no wiring",
  coffee: "Roasted this week, at your door by Friday",
  general: "Book a free planning call this week",
  // Fit Funnels clubs
  gym: "Seven free days, no card needed",
  studio: "New to indoor cycling? Your first ride is free",
};

/** What the headline test expects, per kind of business. `live` is the page's headline now. */
const HYPOTHESES: Record<string, (live: string) => string> = {
  gym: (live) => `"${live}" says what it is. Leading with "no card needed" should bring in more free pass requests, because people worry about being signed up.`,
  studio: (live) => `"${live}" is friendly but vague. Speaking to people who've never tried indoor cycling should bring in more first ride bookings.`,
};
const hypothesisFor = (industry: string, live: string) => HYPOTHESES[industry]?.(live) ?? `"${live}" says how it feels. A headline that says what you get should bring in more quote requests.`;

/** The demo's tests: one running on the example page, one that's ended. */
export function sampleTests(tenant: SampleTenant, now = new Date()): PageTest[] {
  const seed = seedPageFor(tenant.industry);
  const pageId = sampleUuid(`${tenant.id}:demo-page`);
  const hero = seed.doc.sections.find((s) => s.type === "hero");
  const b = variantOf(seed.doc, (d) => {
    const h = d.sections.find((s) => s.type === "hero");
    if (h && h.type === "hero") h.headline = HEADLINES[tenant.industry] ?? HEADLINES.general;
  });
  const c = variantOf(seed.doc, (d) => {
    d.theme = { ...d.theme, mode: d.theme.mode === "dark" ? "light" : "dark" };
  });
  const running: PageTest = {
    id: sampleUuid(`${tenant.id}:test:headline`),
    pageId,
    pageTitle: seed.title,
    pageSlug: seed.slug,
    pageLive: true,
    name: "A more concrete headline",
    hypothesis: hypothesisFor(tenant.industry, hero && hero.type === "hero" ? hero.headline : "The headline"),
    goal: "form",
    status: "running",
    autoEnd: false,
    // Started mid-morning 12 days ago, so it's on day 13.
    startedAt: new Date(now.getTime() - 12 * DAY - 3 * 3_600_000),
    endedAt: null,
    endReason: "",
    keptVersionId: null,
    createdBy: "demo",
    createdAt: new Date(now.getTime() - 13 * DAY),
    versions: [
      { id: sampleUuid(`${tenant.id}:test:headline:a`), key: "a", name: "The live page", weight: 50, doc: seed.doc, visitors: 0, conversions: 0 },
      { id: sampleUuid(`${tenant.id}:test:headline:b`), key: "b", name: "Says what you get", weight: 50, doc: b, visitors: 0, conversions: 0 },
    ],
  };
  const ended: PageTest = {
    ...running,
    id: sampleUuid(`${tenant.id}:test:theme`),
    name: "Light or dark",
    hypothesis: "A lighter page might read as friendlier on phones.",
    goal: "click",
    status: "ended",
    startedAt: new Date(now.getTime() - 50 * DAY),
    endedAt: new Date(now.getTime() - 22 * DAY),
    endReason: "team",
    createdAt: new Date(now.getTime() - 51 * DAY),
    versions: [
      { id: sampleUuid(`${tenant.id}:test:theme:a`), key: "a", name: "The live page", weight: 50, doc: seed.doc, visitors: 0, conversions: 0 },
      { id: sampleUuid(`${tenant.id}:test:theme:b`), key: "b", name: "Switched theme", weight: 50, doc: c, visitors: 0, conversions: 0 },
    ],
  };
  ended.keptVersionId = ended.versions[0].id;
  return [running, ended].map((t) => withSampleResults(t, now).test);
}
