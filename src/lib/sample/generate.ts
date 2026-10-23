// Realistic, made-up data for a tenant. Same tenant, same data; different tenant,
// different data. Never written to the database.
import type { ContactStatus } from "@/lib/db/types";
import type { AnalyticsSummary, ContactDetail, DailyPoint, LandingPage, Totals } from "@/lib/repo/types";
import { samplePageTitle } from "./sites";
import { displayNameFor } from "@/lib/repo/types";
import { presetFor } from "./industries";
import { type Rand, seeded } from "./random";

export type SampleTenant = { id: string; name: string; industry: string };

const FIRST = ["Avery", "Jordan", "Maya", "Luis", "Priya", "Noah", "Hana", "Marcus", "Elena", "Theo", "Imani", "Grace", "Diego", "Nora", "Kenji", "Ruth", "Omar", "Tessa", "Wes", "Lila", "Felix", "Sasha", "Andre", "June", "Caleb", "Rosa", "Ezra", "Mina", "Jonah", "Iris"];
const LAST = ["Bennett", "Okafor", "Nguyen", "Alvarez", "Shah", "Fischer", "Tanaka", "Reid", "Moreno", "Hart", "Kowalski", "Price", "Delgado", "Brooks", "Ito", "Sullivan", "Haddad", "Larsen", "Ford", "Castillo", "Weiss", "Park", "Rowe", "Quinn", "Mendez"];
const MAIL = ["gmail.com", "outlook.com", "icloud.com", "yahoo.com"];
const BIZ = ["builds", "co", "group", "studio", "works", "homes", "design"];
const STATUSES: ContactStatus[] = ["new", "new", "new", "contacted", "contacted", "qualified", "won", "lost"];

const HOUR = 3_600_000;
const DAY = 86_400_000;

function anchor(now: Date): number {
  return Math.floor(now.getTime() / HOUR) * HOUR;
}

function seedFor(tenant: SampleTenant, part: string): Rand {
  return seeded(`${tenant.id}:${tenant.name}:${part}`);
}

export function sampleContacts(tenant: SampleTenant, now = new Date(), count = 24): ContactDetail[] {
  const rand = seedFor(tenant, "contacts");
  const preset = presetFor(tenant.industry);
  const base = anchor(now);
  const used = new Set<string>();
  const out: ContactDetail[] = [];

  for (let i = 0; i < count; i++) {
    const first = rand.pick(FIRST);
    const last = rand.pick(LAST);
    const business = rand.chance(0.45);
    let email = business ? `${first.toLowerCase()}@${last.toLowerCase()}${rand.pick(BIZ)}.com` : `${first.toLowerCase()}.${last.toLowerCase()}@${rand.pick(MAIL)}`;
    if (used.has(email)) email = email.replace("@", `${rand.int(2, 99)}@`);
    used.add(email);

    const name = rand.chance(0.12) ? "" : `${first} ${last}`;
    const form = rand.pick(preset.forms);
    const message = rand.pick(form.messages);
    // Newest first, spread over about five weeks.
    const lastSeenAt = new Date(base - Math.floor(i * 1.4 * DAY + rand.next() * 20 * HOUR));
    const status = i < 4 ? "new" : rand.pick(STATUSES);
    const id = `sample-${tenant.id.slice(0, 8)}-${i}`;
    const phone = rand.chance(0.6) ? `(${rand.int(200, 989)}) 555-0${rand.int(100, 199)}` : "";

    out.push({
      id,
      name,
      email,
      displayName: displayNameFor(name, email),
      status,
      isNew: status === "new",
      formType: form.type,
      message,
      lastSeenAt,
      phone,
      firstSeenAt: new Date(lastSeenAt.getTime() - rand.int(0, 9) * DAY),
      submissions: [{ id: `${id}-s1`, formType: form.type, fields: { name, email, phone, message }, createdAt: lastSeenAt }],
    });
  }
  return out;
}

function totalsFrom(points: DailyPoint[], rand: Rand): Totals {
  const visitors = points.reduce((s, p) => s + p.visitors, 0);
  const pageviews = points.reduce((s, p) => s + p.pageviews, 0);
  const visits = points.reduce((s, p) => s + p.visits, 0);
  return {
    visitors,
    pageviews,
    visits,
    bounceRate: visits ? 0.34 + rand.next() * 0.18 : null,
    avgActiveSeconds: visits ? Math.round(52 + rand.next() * 70) : null,
    pagesPerVisit: visits ? pageviews / visits : null,
    returningShare: visits ? 0.18 + rand.next() * 0.14 : null,
  };
}

export function sampleAnalytics(tenant: SampleTenant, rangeDays: number, now = new Date()): AnalyticsSummary {
  const rand = seedFor(tenant, `analytics:${rangeDays}`);
  const preset = presetFor(tenant.industry);
  const end = Math.floor(anchor(now) / DAY) * DAY;
  const scale = 0.7 + (seedFor(tenant, "scale").next() * 0.6);

  const series = (offsetDays: number, growth: number): DailyPoint[] =>
    Array.from({ length: rangeDays }, (_, i) => {
      const t = end - (offsetDays + rangeDays - 1 - i) * DAY;
      const weekday = new Date(t).getUTCDay();
      const weekly = weekday === 0 || weekday === 6 ? 0.72 : 1;
      const trend = 1 + growth * (i / Math.max(1, rangeDays - 1));
      const visitors = Math.max(1, Math.round(preset.dailyVisitors * scale * weekly * trend * (0.82 + rand.next() * 0.36)));
      const visits = Math.round(visitors * (1.08 + rand.next() * 0.12));
      const pageviews = Math.round(visits * (2.1 + rand.next() * 0.9));
      return { date: new Date(t).toISOString().slice(0, 10), visitors, pageviews, visits };
    });

  const daily = series(0, 0.12);
  const previousDaily = series(rangeDays, 0.04).map((p) => ({ ...p, visitors: Math.round(p.visitors * 0.91) }));
  const current = totalsFrom(daily, rand);
  const previous = totalsFrom(previousDaily, rand);

  const weights = preset.pages.map((_, i) => 1 / (i + 1.3));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const topPages = preset.pages
    .map((path, i) => ({ path, views: Math.round((current.pageviews * weights[i]) / weightSum) }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 6);

  return { rangeDays, current, previous, daily, topPages };
}

/** Landing pages for sample mode, consistent with the sample overview for the same range. */
export function sampleLandingPages(tenant: SampleTenant, rangeDays: number, now = new Date()): LandingPage[] {
  const { current } = sampleAnalytics(tenant, rangeDays, now);
  const rand = seedFor(tenant, `landing:${rangeDays}`);
  const preset = presetFor(tenant.industry);
  // The home page takes most arrivals; deeper pages get search and ad traffic.
  const weights = preset.pages.map((path, i) => (path === "/" ? 3.2 : 1.6 / (i + 0.8)) * (0.8 + rand.next() * 0.4));
  const total = weights.reduce((a, b) => a + b, 0);
  const pages = preset.pages.map((path, i) => {
    const entries = Math.max(1, Math.round((current.visits * weights[i]) / total));
    const intent = /quote|contact|wholesale|dealers|pricing|free-pass|first-ride|memberships|packs|personal-training/.test(path);
    return {
      path,
      title: samplePageTitle(tenant.industry, path),
      entries,
      share: 0,
      bounceRate: 0.22 + rand.next() * 0.4,
      avgActiveSeconds: Math.round(28 + rand.next() * 120),
      formRate: (intent ? 0.04 : 0.006) + rand.next() * (intent ? 0.05 : 0.015),
    };
  });
  const sum = pages.reduce((a, p) => a + p.entries, 0);
  return pages.map((p) => ({ ...p, share: p.entries / sum })).sort((a, b) => b.entries - a.entries);
}
