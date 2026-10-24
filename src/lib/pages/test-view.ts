// What the A/B test screens show, worked out on the server from a test and its
// daily counts: each version's results, the verdict, what each version changes,
// and the lines for the chart. Plain values only, so it can go to the browser.
import type { EditionKey } from "@/config/editions";
import type { PageTestEndReason, PageTestGoal, PageTestStatus } from "@/lib/db/types";
import type { PageDoc } from "./schema";
import { describeChanges } from "./test-diff";
import { earlierTotals, GOAL_TEXT, pct, results, type Verdict, verdict, type VersionKey } from "./test-stats";
import { type DayCount, daysRunning, fullDays, type PageTest, startNotes, startProblems, type TestRow } from "./tests";

export type VersionView = {
  id: string;
  key: VersionKey;
  name: string;
  weight: number;
  doc: PageDoc | null;
  visitors: number;
  conversions: number;
  rate: number | null;
  lift: number | null;
  chance: number | null;
  /** What it changes from A, in a sentence. Empty for A. */
  change: string;
  kept: boolean;
};

export type ChartPoint = { day: string; rates: Partial<Record<VersionKey, number | null>> };

export type TestView = {
  id: string;
  name: string;
  hypothesis: string;
  goal: PageTestGoal;
  goalLabel: string;
  goalVerb: string;
  status: PageTestStatus;
  autoEnd: boolean;
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  pageLive: boolean;
  days: number;
  startedLabel: string | null;
  endedLabel: string | null;
  endReason: PageTestEndReason;
  versions: VersionView[];
  verdict: Verdict;
  problems: string[];
  /** Worth a look before starting, but don't stop it. */
  notes: string[];
  totals: { visitors: number; conversions: number };
  /** Each version's rate so far, day by day. */
  chart: ChartPoint[];
};

/** "Running, day 12", "Ended, kept B": the status in a few words. */
export function statusLabel(t: { status: PageTestStatus; startedAt: Date | null; endedAt: Date | null; endReason: PageTestEndReason; keptVersionId: string | null; versions: { id: string; key: VersionKey }[] }, now = Date.now()): string {
  if (t.status === "draft") return "Setting up";
  if (t.status === "running") return `Running, day ${daysRunning(t, now)}`;
  if (t.endReason === "unpublished") return "Ended, page went offline";
  const kept = t.versions.find((v) => v.id === t.keptVersionId)?.key ?? "a";
  return `Ended, kept ${kept.toUpperCase()}`;
}

/** Running totals by day, so the lines settle as visitors add up instead of jumping around. */
function cumulative(days: DayCount[], keys: VersionKey[]): ChartPoint[] {
  const dates = [...new Set(days.map((d) => d.day))].sort();
  const sum = new Map(keys.map((k) => [k, { v: 0, c: 0 }]));
  return dates.map((day) => {
    const rates: ChartPoint["rates"] = {};
    for (const k of keys) {
      const today = days.find((d) => d.day === day && d.key === k);
      const s = sum.get(k)!;
      if (today) {
        s.v += today.visitors;
        s.c += today.conversions;
      }
      rates[k] = s.v ? s.c / s.v : null;
    }
    return { day, rates };
  });
}

/** `edition` only changes the words, like what a version changes. */
export function testView(t: PageTest, days: DayCount[], opts: { timeZone: string; now?: number; edition?: EditionKey }): TestView {
  const now = opts.now ?? Date.now();
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: opts.timeZone });
  const rs = results(t.versions.map((v) => ({ key: v.key, visitors: v.visitors, conversions: v.conversions })));
  const n = daysRunning(t, now);
  const goal = GOAL_TEXT[t.goal];
  const a = t.versions.find((v) => v.key === "a");
  const keys = t.versions.map((v) => v.key);
  const asOf = (t.endedAt ?? new Date(now)).toISOString().slice(0, 10);
  return {
    id: t.id,
    name: t.name,
    hypothesis: t.hypothesis,
    goal: t.goal,
    goalLabel: goal.label,
    goalVerb: goal.verb,
    status: t.status,
    autoEnd: t.autoEnd,
    pageId: t.pageId,
    pageTitle: t.pageTitle,
    pageSlug: t.pageSlug,
    pageLive: t.pageLive,
    days: n,
    startedLabel: t.startedAt ? fmt.format(t.startedAt) : null,
    endedLabel: t.endedAt ? fmt.format(t.endedAt) : null,
    endReason: t.endReason,
    versions: t.versions.map((v, i) => ({
      id: v.id,
      key: v.key,
      name: v.name,
      weight: v.weight,
      doc: v.doc,
      visitors: v.visitors,
      conversions: v.conversions,
      rate: rs[i].rate,
      lift: rs[i].lift,
      chance: rs[i].chance,
      change: v.key === "a" ? "" : describeChanges(a?.doc ?? null, v.doc, opts.edition) || "The same as A so far.",
      kept: v.id === t.keptVersionId,
    })),
    verdict: verdict(rs, { days: fullDays(t, now), goal: goal.verb, running: t.status === "running", earlier: earlierTotals(days, keys, asOf) }),
    problems: t.status === "draft" ? startProblems(t, a?.doc ?? null) : [],
    notes: startNotes(t),
    totals: { visitors: rs.reduce((x, r) => x + r.visitors, 0), conversions: rs.reduce((x, r) => x + r.conversions, 0) },
    chart: cumulative(days, keys),
  };
}

export type TestCard = {
  id: string;
  name: string;
  pageTitle: string;
  pageSlug: string;
  status: PageTestStatus;
  statusLabel: string;
  goalLabel: string;
  /** "A 3.1%, B 4.2%", or empty before it starts. */
  line: string;
  verdict: Verdict["kind"] | null;
  leader: VersionKey | null;
};

/** One row of the list. `days` are its daily counts, so the verdict matches the test's own page. */
export function testCard(t: TestRow, days: DayCount[], now = Date.now()): TestCard {
  const rs = results(t.versions.map((v) => ({ key: v.key, visitors: v.visitors, conversions: v.conversions })));
  const started = t.status !== "draft";
  const asOf = (t.endedAt ?? new Date(now)).toISOString().slice(0, 10);
  const v = started ? verdict(rs, { days: fullDays(t, now), goal: GOAL_TEXT[t.goal].verb, running: t.status === "running", earlier: earlierTotals(days, t.versions.map((x) => x.key), asOf) }) : null;
  return {
    id: t.id,
    name: t.name,
    pageTitle: t.pageTitle,
    pageSlug: t.pageSlug,
    status: t.status,
    statusLabel: statusLabel(t, now),
    goalLabel: GOAL_TEXT[t.goal].label,
    line: !started ? `${t.versions.length} versions` : rs.every((r) => !r.visitors) ? "No visitors yet" : rs.map((r) => `${r.key.toUpperCase()} ${r.rate === null ? "no visitors" : pct(r.rate)}`).join(", "),
    verdict: v?.kind ?? null,
    leader: v?.leader ?? null,
  };
}
