import "server-only";
// XP and achievements from the company's own records. `syncProgress` looks at
// what's been done and adds any award not given yet (each one once, keyed by
// the record), so there's nothing to remember at the moment work happens, and
// work done before this existed counts too. Awards are kept once earned.
import { sql } from "kysely";
import type { EditionKey } from "@/config/editions";
import { BOOSTS } from "@/lib/boosts/catalog";
import type { Tx } from "@/lib/db";
import { type AchievementKey, achievementsFor, levelFor, type XpKind, xpRules } from "./rules";

export type Gained = { xp: number; achievements: AchievementKey[]; levelUp: number | null };

type Award = { kind: XpKind; points: number; query: ReturnType<typeof sql<{ ref: string; label: string; at: Date }>> };

function awards(edition: EditionKey): Award[] {
  const points = new Map(xpRules(edition).map((r) => [r.kind, r.points]));
  const list: { kind: XpKind; query: Award["query"] }[] = [
    { kind: "campaign", query: sql`select id::text as ref, name as label, created_at as at from campaigns` },
    {
      kind: "filed",
      query: sql`select 'page:' || id as ref, title as label, updated_at as at from pages where campaign_id is not null
        union all select 'newsletter:' || id, coalesce(nullif(subject, ''), 'A newsletter'), updated_at from newsletters where campaign_id is not null
        union all select 'series:' || id, name, updated_at from sequences where campaign_id is not null`,
    },
    { kind: "graphic", query: sql`select file_id::text as ref, coalesce(nullif(name, ''), 'A graphic') as label, added_at as at from campaign_graphics` },
    { kind: "page-published", query: sql`select id::text as ref, title as label, published_at as at from pages where published_at is not null` },
    { kind: "newsletter-sent", query: sql`select id::text as ref, coalesce(nullif(subject, ''), 'A newsletter') as label, coalesce(sent_at, updated_at) as at from newsletters where status = 'sent'` },
    { kind: "series-on", query: sql`select id::text as ref, name as label, updated_at as at from sequences where status = 'on' and not starter` },
    {
      kind: "campaign-lead",
      query: sql`select c.id::text as ref, c.name as label, min(s.created_at) as at
        from campaigns c join pages p on p.campaign_id = c.id and p.tenant_id = c.tenant_id
        join submissions s on s.form_key = 'page:' || p.slug and s.tenant_id = c.tenant_id and s.status = 'received'
        group by c.id, c.name`,
    },
    {
      kind: "campaign-wrapped",
      query: sql`select c.id::text as ref, c.name as label, c.archived_at as at from campaigns c
        where c.archived_at is not null and (exists (select 1 from pages p where p.campaign_id = c.id) or exists (select 1 from newsletters n where n.campaign_id = c.id)
          or exists (select 1 from sequences q where q.campaign_id = c.id) or exists (select 1 from campaign_graphics g where g.campaign_id = c.id))`,
    },
    { kind: "test-ended", query: sql`select id::text as ref, name as label, ended_at as at from page_tests where status = 'ended' and end_reason in ('team', 'winner')` },
    { kind: "first-sale", query: sql`select 'first' as ref, 'Order #' || number as label, created_at as at from orders where status <> 'canceled' order by created_at limit 1` },
    { kind: "kiosk-paired", query: sql`select 'first' as ref, name as label, paired_at as at from kiosk_devices order by paired_at limit 1` },
    {
      kind: "boost-on",
      query: sql`select key as ref, case key ${sql.join(
        BOOSTS.map((b) => sql`when ${b.key} then ${b.name}`),
        sql` `,
      )} else key end as label, first_on_at as at from club_boosts where first_on_at is not null`,
    },
    { kind: "agent-done", query: sql`select id::text as ref, title as label, decided_at as at from agent_tasks where status = 'done' and decided_by <> 'The agent'` },
  ];
  return list.filter((a) => points.has(a.kind)).map((a) => ({ ...a, points: points.get(a.kind)! }));
}

async function totalXp(tx: Tx): Promise<number> {
  const r = await tx.selectFrom("xp_awards").select(sql<string>`coalesce(sum(points), 0)`.as("n")).executeTakeFirstOrThrow();
  return Number(r.n);
}

/** Which achievements the company's records meet now. */
async function metNow(tx: Tx, edition: EditionKey, xp: number): Promise<AchievementKey[]> {
  const { rows } = await sql<Record<string, boolean>>`select
    exists (select 1 from xp_awards where kind = 'campaign') as "first-campaign",
    exists (select 1 from campaigns c where exists (select 1 from pages p where p.campaign_id = c.id)
      and (exists (select 1 from newsletters n where n.campaign_id = c.id) or exists (select 1 from sequences q where q.campaign_id = c.id))
      and exists (select 1 from campaign_graphics g where g.campaign_id = c.id)) as "all-in-one",
    exists (select 1 from pages where campaign_id is not null and published_at is not null) as "launch-day",
    exists (select 1 from xp_awards where kind = 'newsletter-sent') as "hit-send",
    exists (select 1 from xp_awards where kind = 'series-on') as "autopilot",
    exists (select 1 from xp_awards where kind = 'campaign-lead') as "first-lead",
    (select count(*) from campaigns where archived_at is null) >= 3 as "busy-season",
    exists (select 1 from xp_awards where kind = 'campaign-wrapped') as "wrap-party",
    exists (select 1 from xp_awards where kind = 'test-ended') as "test-and-learn",
    exists (select 1 from marketing_settings where jsonb_typeof(brand -> 'logo') = 'object' and coalesce(brand ->> 'address', '') <> '') as "brand-ready",
    exists (select 1 from xp_awards where kind = 'first-sale') as "first-sale",
    exists (select 1 from xp_awards where kind = 'kiosk-paired') as "front-desk",
    (select count(*) from club_boosts where on_now) >= 3 as "power-up"`.execute(tx);
  const met = rows[0] ?? {};
  const level = levelFor(xp).level;
  const allowed = new Set(achievementsFor(edition).map((a) => a.key));
  const keys = (Object.keys(met) as AchievementKey[]).filter((k) => met[k]);
  if (level >= 5) keys.push("level-5");
  if (level >= 10) keys.push("level-10");
  return keys.filter((k) => allowed.has(k));
}

/** Gives any XP and achievements not given yet. Returns what was new this time. */
export async function syncProgress(tx: Tx, edition: EditionKey): Promise<Gained> {
  const before = await totalXp(tx);
  let gained = 0;
  for (const a of awards(edition)) {
    const { rows } = await sql<{ points: number }>`
      insert into xp_awards (kind, ref, points, label, earned_at)
      select ${a.kind}, left(x.ref, 80), ${a.points}, left(x.label, 160), coalesce(x.at, now()) from (${a.query}) x
      on conflict do nothing
      returning points`.execute(tx);
    gained += rows.reduce((n, r) => n + r.points, 0);
  }
  const after = before + gained;
  const met = await metNow(tx, edition, after);
  const fresh: AchievementKey[] = [];
  if (met.length) {
    const { rows } = await sql<{ key: AchievementKey }>`
      insert into achievements (key) select unnest(${met}::text[]) on conflict do nothing returning key`.execute(tx);
    fresh.push(...rows.map((r) => r.key));
  }
  const levelUp = levelFor(after).level > levelFor(before).level ? levelFor(after).level : null;
  return { xp: gained, achievements: fresh, levelUp };
}

export type XpEvent = { kind: XpKind; label: string; points: number; at: Date };
export type Progress = { xp: number; recent: XpEvent[]; earned: Map<AchievementKey, Date>; byKind: Map<XpKind, { count: number; points: number }> };

export async function readProgress(tx: Tx): Promise<Progress> {
  const recent = await tx.selectFrom("xp_awards").select(["kind", "label", "points", "earned_at"]).orderBy("earned_at", "desc").limit(25).execute();
  const kinds = await tx.selectFrom("xp_awards").select(["kind", sql<string>`count(*)`.as("n"), sql<string>`sum(points)`.as("p")]).groupBy("kind").execute();
  const earned = await tx.selectFrom("achievements").select(["key", "earned_at"]).execute();
  return {
    xp: kinds.reduce((n, k) => n + Number(k.p), 0),
    recent: recent.map((r) => ({ kind: r.kind as XpKind, label: r.label, points: r.points, at: r.earned_at })),
    earned: new Map(earned.map((e) => [e.key as AchievementKey, e.earned_at])),
    byKind: new Map(kinds.map((k) => [k.kind as XpKind, { count: Number(k.n), points: Number(k.p) }])),
  };
}

export async function xpTotal(tx: Tx): Promise<number> {
  return totalXp(tx);
}

/** "+3 XP. Level 4!" for an action's message, or empty when nothing new was earned. */
export function gainedLine(g: Gained): string {
  if (!g.xp && !g.achievements.length) return "";
  const parts = [g.xp ? `+${g.xp} XP` : ""];
  if (g.levelUp) parts.push(`You reached level ${g.levelUp}`);
  if (g.achievements.length) parts.push(g.achievements.length === 1 ? "New achievement" : `${g.achievements.length} new achievements`);
  return ` ${parts.filter(Boolean).join(". ")}.`;
}
