// A/B test math and wording: the chance a version is better, when a winner is
// called, how visitors are split, and how a version's changes are described.
import { describe, expect, it } from "vitest";
import { applyOp } from "@/lib/pages/ops";
import { seedPageFor } from "@/lib/pages/seeds";
import { describeChanges } from "@/lib/pages/test-diff";
import { chanceToBeat, type Counts, earlierTotals, evenWeights, isBot, MIN_DAYS, MIN_VISITORS, normalCdf, pickVersion, results, verdict, visitorsNeeded } from "@/lib/pages/test-stats";
import { sampleDays, sampleTests } from "@/lib/sample/page-tests";

const raw = (a: [number, number], b: [number, number], c?: [number, number]): Counts[] => [
  { key: "a", visitors: a[0], conversions: a[1] },
  { key: "b", visitors: b[0], conversions: b[1] },
  ...(c ? [{ key: "c" as const, visitors: c[0], conversions: c[1] }] : []),
];
const counts = (a: [number, number], b: [number, number], c?: [number, number]) => results(raw(a, b, c));
/** The same split at the end of each of the last two days, at 90% and 80% of today's totals. */
const held = (a: [number, number], b: [number, number], c?: [number, number]) =>
  [0.9, 0.8].map((f) => raw(a, b, c).map((x) => ({ ...x, visitors: Math.round(x.visitors * f), conversions: Math.round(x.conversions * f) })));

describe("the math", () => {
  it("has a normal curve that matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.645)).toBeCloseTo(0.05, 3);
  });

  it("gives an even chance for equal results, and more data makes it surer", () => {
    expect(chanceToBeat({ key: "b", visitors: 500, conversions: 25 }, { key: "a", visitors: 500, conversions: 25 })).toBeCloseTo(0.5, 2);
    const small = chanceToBeat({ key: "b", visitors: 100, conversions: 6 }, { key: "a", visitors: 100, conversions: 4 });
    const big = chanceToBeat({ key: "b", visitors: 5000, conversions: 300 }, { key: "a", visitors: 5000, conversions: 200 });
    expect(small).toBeGreaterThan(0.5);
    expect(small).toBeLessThan(0.9);
    expect(big).toBeGreaterThan(0.99);
    expect(chanceToBeat({ key: "b", visitors: 5000, conversions: 200 }, { key: "a", visitors: 5000, conversions: 300 })).toBeLessThan(0.01);
  });

  it("works out lift against A", () => {
    const [a, b] = counts([1000, 40], [1000, 50]);
    expect(a.lift).toBeNull();
    expect(b.rate).toBeCloseTo(0.05);
    expect(b.lift).toBeCloseTo(0.25);
    expect(counts([0, 0], [10, 1])[1].chance).toBeNull();
  });

  it("estimates how many visitors it takes to tell two rates apart", () => {
    expect(visitorsNeeded(0.04, 0.04)).toBeNull();
    const n = visitorsNeeded(0.04, 0.05)!;
    expect(n).toBeGreaterThan(9000);
    expect(n).toBeLessThan(11_000);
  });
});

describe("the verdict", () => {
  const goal = "sent the form";

  it("waits for visitors, then a full week and 100 per version", () => {
    expect(verdict(counts([0, 0], [0, 0]), { days: 1, goal, running: true }).kind).toBe("waiting");
    const early = verdict(counts([5000, 200], [5000, 300]), { days: 3, goal, running: true });
    expect(early.kind).toBe("too-early");
    expect(early.sentence).toContain("a full week (it's been 3 days)");
    const thin = verdict(counts([50, 2], [50, 9]), { days: 10, goal, running: true });
    expect(thin.kind).toBe("too-early");
    expect(thin.sentence).toContain(`at least ${MIN_VISITORS} visitors on every version`);
  });

  it("calls a winner only once it's sure and has stayed sure for three days", () => {
    const fresh = verdict(counts([5000, 200], [5000, 300]), { days: MIN_DAYS, goal, running: true });
    expect(fresh.kind).toBe("keep-going");
    expect(fresh.sentence).toContain("has to stay that clear for 3 days in a row");
    const v = verdict(counts([5000, 200], [5000, 300]), { days: MIN_DAYS, goal, running: true, earlier: held([5000, 200], [5000, 300]) });
    expect(v.kind).toBe("winner");
    expect(v.leader).toBe("b");
    expect(v.sentence).toMatch(/^B has 6% sent the form, against 4% sent the form for A\. That's 50% better/);
    expect(v.sentence).toContain("You can end the test and keep B.");
  });

  it("calls A the winner when every other version is clearly worse", () => {
    const v = verdict(counts([5000, 300], [5000, 200]), { days: 14, goal, running: true, earlier: held([5000, 300], [5000, 200]) });
    expect(v).toMatchObject({ kind: "winner", leader: "a" });
  });

  it("keeps going when it's close, with a rough idea of how long", () => {
    const v = verdict(counts([400, 16], [400, 19]), { days: 9, goal, running: true });
    expect(v.kind).toBe("keep-going");
    expect(v.sentence).toContain("not sure enough to call");
    expect(v.sentence).toMatch(/About [\d,]+ more visitors per version/);
  });

  it("says there's no real difference after a long, busy test", () => {
    const v = verdict(counts([3000, 120], [3000, 123]), { days: 30, goal, running: true });
    expect(v.kind).toBe("no-difference");
  });

  it("picks the best of B and C", () => {
    const v = verdict(counts([5000, 200], [5000, 215], [5000, 310]), { days: 10, goal, running: true, earlier: held([5000, 200], [5000, 215], [5000, 310]) });
    expect(v).toMatchObject({ kind: "winner", leader: "c" });
  });

  it("can call a winner when A had none, and says who's ahead by the numbers", () => {
    const v = verdict(counts([500, 0], [500, 25]), { days: 8, goal, running: true, earlier: held([500, 0], [500, 25]) });
    expect(v).toMatchObject({ kind: "winner", leader: "b" });
    expect(v.sentence).toContain("B has 5% sent the form, against 0% sent the form for A. That's better");
    const close = verdict(counts([400, 19], [400, 16]), { days: 9, goal, running: true });
    expect(close.sentence).toMatch(/^A is ahead so far/);
  });

  it("sums up an ended test as it finished", () => {
    expect(verdict(counts([5000, 200], [5000, 300]), { days: 9, goal, running: false }).kind).toBe("winner");
    expect(verdict(counts([40, 2], [40, 3]), { days: 2, goal, running: false }).sentence).toMatch(/^It ended before there was enough to go on/);
  });

  it("reads the end-of-day totals from daily counts, newest first, leaving today out", () => {
    const days = [
      { day: "2026-10-01", key: "a" as const, visitors: 10, conversions: 1 },
      { day: "2026-10-01", key: "b" as const, visitors: 10, conversions: 2 },
      { day: "2026-10-02", key: "a" as const, visitors: 5, conversions: 0 },
      { day: "2026-10-03", key: "a" as const, visitors: 7, conversions: 1 },
    ];
    expect(earlierTotals(days, ["a", "b"], "2026-10-03")).toEqual([
      [
        { key: "a", visitors: 15, conversions: 1 },
        { key: "b", visitors: 10, conversions: 2 },
      ],
      [
        { key: "a", visitors: 10, conversions: 1 },
        { key: "b", visitors: 10, conversions: 2 },
      ],
    ]);
  });
});

describe("splitting visitors", () => {
  it("adds up to 100 with A first", () => {
    expect(evenWeights(2)).toEqual([50, 50]);
    expect(evenWeights(3)).toEqual([34, 33, 33]);
  });

  it("puts each bucket in one version, in proportion to the weights", () => {
    const vs = [
      { key: "a", weight: 70 },
      { key: "b", weight: 30 },
    ];
    const seen = { a: 0, b: 0 } as Record<string, number>;
    for (let i = 0; i < 10_000; i++) seen[pickVersion(i, vs)!.key]++;
    expect(seen.a).toBe(7000);
    expect(pickVersion(0, [])).toBeNull();
    expect(pickVersion(5, [{ key: "a", weight: 0 }])).toBeNull();
  });

  it("doesn't count bots, link previews or scripts", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("curl/8.4.0")).toBe(true);
    expect(isBot("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0 Safari/537.36")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
  });
});

describe("describing a version", () => {
  const live = seedPageFor("pools").doc;

  it("says what changed in plain words", () => {
    expect(describeChanges(live, live)).toBe("");
    const headline = applyOp(live, { op: "update_section", id: "hero", changes: { headline: "Glow that lasts all night" } }).doc;
    expect(describeChanges(live, headline)).toBe("Changes the hero headline.");
    const dark = { ...headline, theme: { ...headline.theme, mode: live.theme.mode === "dark" ? ("light" as const) : ("dark" as const) } };
    expect(describeChanges(live, dark)).toBe("Changes the hero headline and the light or dark mode.");
    const fewer = applyOp(live, { op: "remove_section", id: "faq" }).doc;
    expect(describeChanges(live, fewer)).toBe("Removes questions.");
  });
});

describe("sample results", () => {
  it("are the same every time for the same test", () => {
    const vs = [
      { key: "a" as const, weight: 50 },
      { key: "b" as const, weight: 50 },
    ];
    const now = new Date("2026-10-01T12:00:00Z");
    expect(sampleDays("t1", vs, 10, now)).toEqual(sampleDays("t1", vs, 10, now));
    expect(sampleDays("t1", vs, 10, now)).toHaveLength(20);
  });

  it("give the demo one running test and one that ended", () => {
    const tests = sampleTests({ id: "00000000-0000-4000-8000-000000000001", name: "Demo Co", industry: "pools" } as never);
    expect(tests.map((t) => t.status)).toEqual(["running", "ended"]);
    expect(tests[0].versions.every((v) => v.visitors > 0)).toBe(true);
  });
});

describe("what counts as a visit or a click", async () => {
  const { fromSameSite, isPageView, visitorFrom } = await import("@/lib/pages/tests");
  const h = (o: Record<string, string>) => new Headers(o);

  it("counts people opening the page, not prefetches or the page loaded from elsewhere", () => {
    expect(isPageView(h({ "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }))).toBe(true);
    expect(isPageView(h({}))).toBe(true);
    expect(isPageView(h({ "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" }))).toBe(false);
    expect(isPageView(h({ "sec-fetch-mode": "navigate", "sec-fetch-dest": "iframe" }))).toBe(false);
    expect(isPageView(h({ "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "sec-purpose": "prefetch;prerender" }))).toBe(false);
  });

  it("only takes clicks sent from the page's own site", () => {
    expect(fromSameSite(h({ "sec-fetch-site": "same-origin" }), "app.example.com")).toBe(true);
    expect(fromSameSite(h({ "sec-fetch-site": "cross-site", origin: "https://app.example.com" }), "app.example.com")).toBe(false);
    expect(fromSameSite(h({ origin: "https://evil.example" }), "app.example.com")).toBe(false);
    expect(fromSameSite(h({ origin: "https://app.example.com" }), "app.example.com")).toBe(true);
  });

  it("knows the team by its session cookie", () => {
    expect(visitorFrom(h({ cookie: "theme=dark; bo_dev_session=abc", "x-real-ip": "203.0.113.9" }))).toMatchObject({ team: true, ip: "203.0.113.9" });
    expect(visitorFrom(h({ cookie: "my__session=1" })).team).toBe(false);
  });
});
