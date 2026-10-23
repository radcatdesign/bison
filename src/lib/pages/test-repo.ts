import "server-only";
// What the A/B test screens read. Tests themselves are content (always the
// company's own); their results are data, made up while sample data is on.
// The demo has no database, so it shows two made-up tests.
import { demoMode } from "@/lib/env";
import type { PortalContext } from "@/lib/portal";
import { scopeOf } from "@/lib/portal";
import { sampleDays, sampleTests, withSampleResults } from "@/lib/sample/page-tests";
import { dailyCounts, dailyCountsFor, daysRunning, type DayCount, getTest, listTests, type PageTest, type TestRow } from "./tests";

export type TestsRepo = {
  /** Results are made up (sample data on, or the demo). */
  sample: boolean;
  demo: boolean;
  /** Each test with its daily counts (running tests only; ended ones are judged on their saved totals). */
  list(): Promise<(TestRow & { days: DayCount[] })[]>;
  get(id: string): Promise<{ test: PageTest; days: DayCount[] } | null>;
};

const row = (t: PageTest): TestRow => ({
  id: t.id,
  pageId: t.pageId,
  pageTitle: t.pageTitle,
  pageSlug: t.pageSlug,
  pageLive: t.pageLive,
  name: t.name,
  goal: t.goal,
  status: t.status,
  autoEnd: t.autoEnd,
  startedAt: t.startedAt,
  endedAt: t.endedAt,
  endReason: t.endReason,
  keptVersionId: t.keptVersionId,
  createdAt: t.createdAt,
  versions: t.versions.map((v) => ({ id: v.id, key: v.key, name: v.name, weight: v.weight, visitors: v.visitors, conversions: v.conversions })),
});

export function testsRepo(ctx: PortalContext): TestsRepo {
  if (demoMode()) {
    const all = () => sampleTests(ctx.tenant);
    return {
      sample: true,
      demo: true,
      list: async () => all().map((t) => ({ ...row(t), days: withSampleResults(t).days })),
      async get(id) {
        const t = all().find((x) => x.id === id);
        return t ? withSampleResults(t) : null;
      },
    };
  }
  const scope = scopeOf(ctx);
  const sample = ctx.settings.sampleData;
  return {
    sample,
    demo: false,
    async list() {
      const rows = await listTests(scope);
      if (sample) {
        const now = new Date();
        return rows.map((r) => {
          if (r.status === "draft" || !r.startedAt) return { ...r, days: [] };
          const days = sampleDays(r.id, r.versions, daysRunning(r), r.endedAt ?? now);
          const sum = (key: string, f: "visitors" | "conversions") => days.filter((d) => d.key === key).reduce((n, d) => n + d[f], 0);
          return { ...r, days, versions: r.versions.map((v) => ({ ...v, visitors: sum(v.key, "visitors"), conversions: sum(v.key, "conversions") })) };
        });
      }
      const daily = await dailyCountsFor(
        scope,
        rows.filter((r) => r.status === "running").map((r) => r.id),
      );
      return rows.map((r) => ({ ...r, days: daily.get(r.id) ?? [] }));
    },
    async get(id) {
      const t = await getTest(scope, id);
      if (!t) return null;
      return sample ? withSampleResults(t) : { test: t, days: await dailyCounts(scope, id) };
    },
  };
}
