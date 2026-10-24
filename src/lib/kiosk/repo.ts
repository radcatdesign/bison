import "server-only";
// What the Front desk screen reads: today's and this week's check-ins, free
// passes, tours and waivers, the latest of them, and the paired tablets. From
// the database, or made up while sample data is on (and always in the demo).
// The kiosk itself always saves: people at the desk are real either way.
import { sql } from "kysely";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { type PortalContext, scopeOf } from "@/lib/portal";
import { sampleContacts } from "@/lib/sample/generate";
import { seeded } from "@/lib/sample/random";

export type DeskKind = "checkin" | "pass" | "tour" | "waiver";
export type DeskCounts = Record<DeskKind, number>;
export type DeskEvent = { at: Date; kind: DeskKind; name: string; contactId: string | null };
export type FrontDesk = { sample: boolean; today: DeskCounts; week: DeskCounts; recent: DeskEvent[]; tablets: { name: string; lastSeenAt: Date; online: boolean }[] };

/** A tablet that hasn't checked in for 5 minutes is probably off, asleep or offline. */
const QUIET_MS = 5 * 60_000;

const zero = (): DeskCounts => ({ checkin: 0, pass: 0, tour: 0, waiver: 0 });

function sampleDesk(ctx: PortalContext, now = new Date()): FrontDesk {
  const r = seeded(`${ctx.tenant.id}:front-desk:${now.toISOString().slice(0, 10)}`);
  const people = sampleContacts(ctx.tenant, now, 24);
  const big = ctx.tenant.industry === "gym";
  // Morning so far: scale today's counts by how far into the club's day it is.
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: ctx.settings.timezone }).format(now));
  const part = Math.min(1, Math.max(0.1, (hour - 5) / 16));
  const day = { checkin: Math.round(r.int(big ? 140 : 45, big ? 220 : 80) * part), pass: Math.round(r.int(2, 7) * part), tour: Math.round(r.int(1, 4) * part), waiver: Math.round(r.int(2, 8) * part) };
  const week = { checkin: day.checkin + r.int(big ? 700 : 240, big ? 1100 : 380), pass: day.pass + r.int(14, 30), tour: day.tour + r.int(6, 16), waiver: day.waiver + r.int(14, 34) };
  const kinds: DeskKind[] = ["checkin", "checkin", "checkin", "checkin", "checkin", "pass", "tour", "waiver"];
  const recent: DeskEvent[] = [];
  let at = now.getTime() - r.int(1, 6) * 60_000;
  // Different people, so nobody "checks in" twice within the same visit.
  const order = people.map((p) => ({ p, k: r.next() })).sort((a, b) => a.k - b.k).map((x) => x.p);
  for (let i = 0; i < Math.min(14, order.length); i++) {
    const p = order[i];
    recent.push({ at: new Date(at), kind: r.pick(kinds), name: p.name || p.email, contactId: p.id });
    at -= r.int(2, 14) * 60_000;
  }
  return { sample: true, today: day, week, recent, tablets: [{ name: "Front desk", lastSeenAt: new Date(now.getTime() - 40_000), online: true }] };
}

export async function frontDesk(ctx: PortalContext): Promise<FrontDesk> {
  if (demoMode() || ctx.settings.sampleData) return sampleDesk(ctx);
  const tz = ctx.settings.timezone;
  return withTenant(scopeOf(ctx), async (tx) => {
    const { rows } = await sql<{ kind: DeskKind; today: string; week: string }>`
      with bounds as (
        select (date_trunc('day', now() at time zone ${tz}) at time zone ${tz}) as day_start,
               (date_trunc('day', now() at time zone ${tz}) at time zone ${tz}) - interval '6 days' as week_start
      )
      select 'checkin' as kind, count(*) filter (where checked_in_at >= day_start) as today, count(*) as week
        from kiosk_check_ins, bounds where checked_in_at >= week_start
      union all
      select case form_type when 'kiosk-pass' then 'pass' else 'tour' end, count(*) filter (where created_at >= day_start), count(*)
        from submissions, bounds where form_type in ('kiosk-pass', 'kiosk-tour') and created_at >= week_start group by form_type
      union all
      select 'waiver', count(*) filter (where signed_at >= day_start), count(*)
        from kiosk_waivers, bounds where signed_at >= week_start`.execute(tx);
    const today = zero();
    const week = zero();
    for (const row of rows) {
      today[row.kind] = Number(row.today);
      week[row.kind] = Number(row.week);
    }
    const recent = await sql<{ at: Date; kind: DeskKind; name: string; email: string; contact_id: string | null }>`
      select * from (
        (select k.checked_in_at as at, 'checkin' as kind, c.name, c.email, c.id as contact_id from kiosk_check_ins k join contacts c on c.id = k.contact_id and c.tenant_id = k.tenant_id order by k.checked_in_at desc limit 20)
        union all
        (select s.created_at, case s.form_type when 'kiosk-pass' then 'pass' else 'tour' end, c.name, c.email, c.id from submissions s join contacts c on c.id = s.contact_id and c.tenant_id = s.tenant_id where s.form_type in ('kiosk-pass', 'kiosk-tour') order by s.created_at desc limit 20)
        union all
        (select w.signed_at, 'waiver', w.signed_name, c.email, c.id from kiosk_waivers w join contacts c on c.id = w.contact_id and c.tenant_id = w.tenant_id order by w.signed_at desc limit 20)
      ) x order by at desc limit 20`.execute(tx);
    const tablets = await tx.selectFrom("kiosk_devices").select(["name", "last_seen_at"]).where("revoked_at", "is", null).orderBy("paired_at").execute();
    return {
      sample: false,
      today,
      week,
      recent: recent.rows.map((e) => ({ at: new Date(e.at), kind: e.kind, name: e.name || e.email, contactId: e.contact_id })),
      tablets: tablets.map((t) => ({ name: t.name, lastSeenAt: t.last_seen_at, online: Date.now() - t.last_seen_at.getTime() < QUIET_MS })),
    };
  });
}

// ---- One person, for their panel in Leads --------------------------------------------

export type PersonAtDesk = { visits30: number; lastVisit: Date | null; waiver: { signedAt: Date; version: number; current: boolean; title: string; signature: string } | null };

export async function personAtDesk(ctx: PortalContext, contactId: string): Promise<PersonAtDesk | null> {
  if (demoMode() || ctx.settings.sampleData) return null;
  return withTenant(scopeOf(ctx), async (tx) => {
    const visits = await tx
      .selectFrom("kiosk_check_ins")
      .select([sql<string>`count(*) filter (where checked_in_at >= now() - interval '30 days')`.as("n"), sql<Date | null>`max(checked_in_at)`.as("last")])
      .where("contact_id", "=", contactId)
      .executeTakeFirst();
    const w = await tx.selectFrom("kiosk_waivers").select(["signed_at", "waiver_version", "title", "signature"]).where("contact_id", "=", contactId).orderBy("signed_at", "desc").limit(1).executeTakeFirst();
    const current = await tx.selectFrom("kiosk_settings").select("waiver_version").executeTakeFirst();
    const n = Number(visits?.n ?? 0);
    if (!n && !visits?.last && !w) return null;
    return {
      visits30: n,
      lastVisit: visits?.last ? new Date(visits.last) : null,
      waiver: w ? { signedAt: w.signed_at, version: w.waiver_version, current: w.waiver_version === (current?.waiver_version ?? 0), title: w.title, signature: w.signature } : null,
    };
  });
}
