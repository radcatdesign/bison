// A/B test math, pure. Each version's conversion rate, how it compares with A,
// the chance it's really better (Bayesian, with an even prior), and a plain
// verdict: too early, keep going, a winner, or no real difference.

export type VersionKey = "a" | "b" | "c";
export type Counts = { key: VersionKey; visitors: number; conversions: number };
export type VersionResult = Counts & {
  /** Share of visitors who did the goal, 0 to 1. Null with no visitors. */
  rate: number | null;
  /** How much better or worse than A, as a fraction (0.25 is 25% better). Null for A or without data. */
  lift: number | null;
  /** The chance this version's real rate is higher than A's, 0 to 1. Null for A. */
  chance: number | null;
};
export type VerdictKind = "waiting" | "too-early" | "keep-going" | "winner" | "no-difference";
export type Verdict = { kind: VerdictKind; leader: VersionKey | null; sentence: string; moreVisitors: number | null };

/** How sure a test has to be before it calls a winner. */
export const SURE = 0.99;
/** The least each version needs before anything is called. */
export const MIN_VISITORS = 100;
export const MIN_DAYS = 7;
/** After this long with plenty of visitors and no winner, it says there's no real difference. */
export const LONG_DAYS = 28;
const LONG_VISITORS = 1000;

/** The standard normal CDF (Abramowitz and Stegun 7.1.26), good to about 1e-7. */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

function beta(c: Counts) {
  const a = 1 + c.conversions;
  const b = 1 + Math.max(0, c.visitors - c.conversions);
  return { mean: a / (a + b), variance: (a * b) / ((a + b) ** 2 * (a + b + 1)) };
}

/** The chance version `x` really converts better than `base`, from Beta posteriors (normal approximation). */
export function chanceToBeat(x: Counts, base: Counts): number {
  const p = beta(x);
  const q = beta(base);
  const sd = Math.sqrt(p.variance + q.variance);
  return sd === 0 ? 0.5 : normalCdf((p.mean - q.mean) / sd);
}

/** Visitors per version to tell two rates apart (99% confidence, 80% power), roughly. Null when they're the same. */
export function visitorsNeeded(p1: number, p2: number): number | null {
  const d = Math.abs(p1 - p2);
  if (d < 1e-9) return null;
  return Math.ceil(((2.576 + 0.8416) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))) / (d * d));
}

/** "4.2%" under 10%, "18%" above. */
export const pct = (x: number) => {
  const v = x * 100;
  return `${v < 10 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v)}%`;
};
const whole = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const count = (n: number) => n.toLocaleString("en-US");
const name = (k: VersionKey) => k.toUpperCase();

export function results(counts: Counts[]): VersionResult[] {
  const a = counts.find((c) => c.key === "a");
  return counts.map((c) => {
    const rate = c.visitors ? c.conversions / c.visitors : null;
    if (!a || c.key === "a") return { ...c, rate, lift: null, chance: null };
    const aRate = a.visitors ? a.conversions / a.visitors : null;
    const lift = rate !== null && aRate ? (rate - aRate) / aRate : null;
    return { ...c, rate, lift, chance: c.visitors && a.visitors ? chanceToBeat(c, a) : null };
  });
}

/** How many end-of-day checks in a row a winner has to hold for, counting today. */
export const HOLD_DAYS = 3;

/** How sure each version has to be with this many versions besides A (a Bonferroni split, so C doesn't double the false alarms). */
export const sureFor = (others: number) => 1 - (1 - SURE) / Math.max(1, others);

type Call = { leader: VersionKey; chance: number } | null;

/** Who's clearly ahead in one set of results, or nobody. A wins only when every other version is clearly worse. */
function callOf(rs: VersionResult[]): Call {
  const others = rs.filter((r) => r.key !== "a");
  const sure = sureFor(others.length);
  const best = [...others].sort((x, y) => (y.chance ?? 0) - (x.chance ?? 0))[0];
  if (best?.chance != null && best.chance >= sure) return { leader: best.key, chance: best.chance };
  if (others.length && others.every((r) => r.chance !== null && r.chance <= 1 - sure)) return { leader: "a", chance: 1 - Math.max(...others.map((r) => r.chance!)) };
  return null;
}

/**
 * The call, in a sentence. `goal` is what was counted, like "sent the form".
 * `days` is full days since it started. `earlier` holds the totals at the end
 * of each earlier day, newest first: a winner has to have been clear at the end
 * of the last two days too, so checking every few minutes can't catch a lucky
 * streak. Nothing is called before a week and 100 visitors on every version.
 */
export function verdict(rs: VersionResult[], opts: { days: number; goal: string; running: boolean; earlier?: Counts[][] }): Verdict {
  const a = rs.find((r) => r.key === "a");
  const others = rs.filter((r) => r.key !== "a");
  if (!a || !others.length) return { kind: "waiting", leader: null, sentence: "Add a version to test against A.", moreVisitors: null };
  const total = rs.reduce((n, r) => n + r.visitors, 0);
  if (!total) return { kind: "waiting", leader: null, sentence: opts.running ? "No visitors yet. Share the page's address and results show up here." : "Results show up here once the test is running.", moreVisitors: null };

  const fewest = Math.min(...rs.map((r) => r.visitors));
  // The leader by rate, not by chance, so "ahead" always matches the numbers shown.
  const best = [...others].sort((x, y) => (y.rate ?? -1) - (x.rate ?? -1))[0];
  const rateText = (r: VersionResult) => (r.rate === null ? "no visitors yet" : `${pct(r.rate)} ${opts.goal}`);
  const better = (r: VersionResult) => (r.lift !== null ? `${whole(r.lift)} better` : "better");

  const needFor = (r: VersionResult) => (r.rate !== null && a.rate !== null ? visitorsNeeded(r.rate, a.rate) : null);
  const need = needFor(best);
  const moreVisitors = need === null ? null : Math.max(0, need - fewest);
  const more = moreVisitors && moreVisitors > 0 ? ` About ${moreVisitors > 200_000 ? "200,000 or more" : count(Math.ceil(moreVisitors / 50) * 50)} more visitors per version should settle it.` : "";

  if (fewest < MIN_VISITORS || opts.days < MIN_DAYS) {
    const sofar = opts.days === 0 ? "it started today" : `it's been ${opts.days} ${opts.days === 1 ? "day" : "days"}`;
    const wait = [opts.days < MIN_DAYS ? `a full week (${sofar})` : "", fewest < MIN_VISITORS ? `at least ${MIN_VISITORS} visitors on every version` : ""].filter(Boolean).join(" and ");
    if (!opts.running) return { kind: "too-early", leader: null, sentence: `It ended before there was enough to go on. A had ${rateText(a)}${others.map((r) => `, ${name(r.key)} ${rateText(r)}`).join("")}.`, moreVisitors };
    return { kind: "too-early", leader: null, sentence: `Give it ${wait}, so a lucky day doesn't decide it. So far A has ${rateText(a)}${others.map((r) => `, ${name(r.key)} ${rateText(r)}`).join("")}.`, moreVisitors };
  }

  const now = callOf(rs);
  // An ended test is summed up as it finished; only a running one has to show its lead has held.
  const held = now !== null && (!opts.running || ((opts.earlier ?? []).length >= HOLD_DAYS - 1 && (opts.earlier ?? []).slice(0, HOLD_DAYS - 1).every((c) => callOf(results(c))?.leader === now.leader)));
  if (now && held) {
    if (now.leader === "a") {
      return { kind: "winner", leader: "a", sentence: `The page as it is has ${rateText(a)}, and there's a ${whole(now.chance)} chance ${others.length === 1 ? `${name(others[0].key)} does worse` : "the other versions do worse"}. ${opts.running ? "You can end the test and keep A." : ""}`.trim(), moreVisitors: 0 };
    }
    const w = others.find((r) => r.key === now.leader)!;
    return { kind: "winner", leader: w.key, sentence: `${name(w.key)} has ${rateText(w)}, against ${rateText(a)} for A. That's ${better(w)}, with a ${whole(now.chance)} chance it's really better. ${opts.running ? `You can end the test and keep ${name(w.key)}.` : ""}`.trim(), moreVisitors: 0 };
  }
  if (now && opts.running) {
    const who = now.leader === "a" ? "A, the page as it is," : name(now.leader);
    return { kind: "keep-going", leader: null, sentence: `${who} is clearly ahead now, with a ${whole(now.chance)} chance it's really ${now.leader === "a" ? "the better one" : "better"}. A winner has to stay that clear for ${HOLD_DAYS} days in a row, so a lucky streak can't decide it. Give it a little longer.`, moreVisitors: 0 };
  }
  if (opts.days >= LONG_DAYS && fewest >= LONG_VISITORS) {
    return { kind: "no-difference", leader: null, sentence: `After ${opts.days} days and ${count(total)} visitors, the versions do about the same. Keep the one you like best, or test a bolder change.`, moreVisitors };
  }
  const ahead = best.rate !== null && a.rate !== null && best.rate > a.rate;
  const lead = ahead ? `${name(best.key)} is ahead so far${best.lift !== null ? `, ${whole(best.lift)} better than A` : ""}` : best.rate === a.rate ? "They're even so far" : "A is ahead so far";
  const chance = best.chance !== null && best.rate !== a.rate ? `, with a ${whole(ahead ? best.chance : 1 - best.chance)} chance that holds` : "";
  if (!opts.running) return { kind: "keep-going", leader: null, sentence: `${lead}${chance}. It ended before that was clear.`, moreVisitors };
  return { kind: "keep-going", leader: null, sentence: `${lead}${chance}. That's not sure enough to call.${more || " Keep it running."}`, moreVisitors };
}

/** Running totals at the end of each day before today, newest first, for `verdict`'s `earlier`. */
export function earlierTotals(days: { day: string; key: VersionKey; visitors: number; conversions: number }[], keys: VersionKey[], today: string): Counts[][] {
  const dates = [...new Set(days.map((d) => d.day))].filter((d) => d < today).sort();
  const out: Counts[][] = [];
  for (const end of dates) out.unshift(keys.map((key) => days.filter((d) => d.key === key && d.day <= end).reduce((c, d) => ({ key, visitors: c.visitors + d.visitors, conversions: c.conversions + d.conversions }), { key, visitors: 0, conversions: 0 })));
  return out;
}

/** Which version a visitor sees: `bucket` is 0 to 9,999, from a hash of who they are; weights are percents. */
export function pickVersion<T extends { weight: number }>(bucket: number, versions: T[]): T | null {
  const total = versions.reduce((n, v) => n + Math.max(0, v.weight), 0);
  if (!versions.length || total <= 0) return null;
  const at = (bucket % 10_000) / 10_000;
  let edge = 0;
  for (const v of versions) {
    edge += Math.max(0, v.weight) / total;
    if (at < edge) return v;
  }
  return versions[versions.length - 1];
}

/** Even weights that add up to 100, A first: 50/50, 34/33/33. */
export function evenWeights(n: number): number[] {
  const base = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => base + (i < 100 - base * n ? 1 : 0));
}

const BOTS = /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|monitor|lighthouse|pagespeed|headless|phantom|curl\/|wget|python|go-http|java\/|node-fetch|axios|okhttp|httpclient/i;

/** Crawlers, link previews and scripts see a version but aren't counted. */
export const isBot = (ua: string) => !ua || ua.length < 20 || BOTS.test(ua);

export const GOAL_TEXT: Record<"form" | "click", { verb: string; label: string; help: string }> = {
  form: { verb: "sent the form", label: "Form sends", help: "A visitor counts once a day, when they send a form on the page." },
  click: { verb: "clicked a button", label: "Button clicks", help: "A visitor counts once a day, when they click any button on the page, like Get a quote or Shop now." },
};
