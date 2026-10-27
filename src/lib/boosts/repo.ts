import "server-only";
// What the Boosts screen reads: which boosts are on, their settings, what each
// has done in the last 30 days, and anything that stops one from working.
// From the database, or made up while sample data is on and in the demo.
import { sql } from "kysely";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { waiverReady } from "@/lib/kiosk/settings";
import { readKiosk } from "@/lib/kiosk/store";
import { type PortalContext, scopeOf } from "@/lib/portal";
import { salesSender } from "@/lib/sales/emails";
import { getSalesSettings } from "@/lib/sales/store";
import { BOOSTS, type BoostKey, type BoostState } from "./catalog";
import { sampleBoosts } from "./demo";
import { readBoosts } from "./store";

export type BoostStat = { value: number; label: string; help: string; waiting?: number };

export type BoostsView = {
  sample: boolean;
  boosts: Record<BoostKey, BoostState>;
  stats: Record<BoostKey, BoostStat>;
  /** Why a boost that's on can't do its job yet, or null. */
  blocked: Partial<Record<BoostKey, string>>;
  /** Where lead alerts go. */
  alertsTo: string[];
};

const DAY = 86_400_000;

function statsFrom(n: { sent: Record<string, number>; waiting: Record<string, number>; friends: number; streakers: number; waivers: number; leads: number }): Record<BoostKey, BoostStat> {
  const agent = (kind: string, label: string, help: string): BoostStat => ({ value: n.sent[kind] ?? 0, label, help, waiting: n.waiting[kind] ?? 0 });
  return {
    "miss-you": agent("miss-you", "Notes sent", "We miss you emails your team sent from Agents in the last 30 days."),
    "pass-follow-up": agent("pass-follow-up", "Reminders sent", "Free pass reminders your team sent from Agents in the last 30 days."),
    milestones: agent("milestone", "Shout-outs sent", "Milestone emails your team sent from Agents in the last 30 days. The kiosk shows every milestone at check-in either way."),
    streaks: { value: n.streakers, label: "On a streak now", help: "Members who checked in this week and last week, so their streak shows on the kiosk." },
    "review-ask": agent("review-ask", "Asks sent", "Review requests your team sent from Agents in the last 30 days."),
    "bring-a-friend": { value: n.friends, label: "Friends sent", help: "Friends members added at the kiosk in the last 30 days. Each one is in Leads." },
    "waiver-first": { value: n.waivers, label: "Waivers signed", help: "Waivers signed at your kiosk tablets in the last 30 days." },
    "lead-alerts": { value: n.leads, label: "New leads", help: "Free passes, tours, friends and funnel page forms in the last 30 days, not counting spam. With this on, each one emails your team." },
  };
}

function sampleView(): BoostsView {
  return {
    sample: true,
    boosts: sampleBoosts(),
    stats: statsFrom({ sent: { "miss-you": 6, milestone: 4 }, waiting: { "miss-you": 1, milestone: 1 }, friends: 9, streakers: 38, waivers: 27, leads: 23 }),
    blocked: {},
    alertsTo: ["owner@yourclub.com"],
  };
}

export async function boostsView(ctx: PortalContext): Promise<BoostsView> {
  if (demoMode() || ctx.settings.sampleData) return sampleView();
  return withTenant(scopeOf(ctx), async (tx) => {
    const boosts = await readBoosts(tx);
    const since = new Date(Date.now() - 30 * DAY);
    const tasks = await tx
      .selectFrom("agent_tasks")
      .select(["kind", "status", sql<string>`count(*)`.as("n")])
      .where("kind", "in", ["miss-you", "pass-follow-up", "milestone", "review-ask"])
      .where((eb) => eb.or([eb("status", "=", "open"), eb.and([eb("status", "=", "done"), eb("decided_at", ">=", since)])]))
      .groupBy(["kind", "status"])
      .execute();
    const sent: Record<string, number> = {};
    const waiting: Record<string, number> = {};
    for (const t of tasks) (t.status === "done" ? sent : waiting)[t.kind] = Number(t.n);
    const tz = (await tx.selectFrom("settings").select("timezone").executeTakeFirstOrThrow()).timezone;
    const week = sql`(date_trunc('week', now() at time zone ${tz}) at time zone ${tz})`;
    const counts = await sql<{ friends: string; waivers: string; leads: string; streakers: string }>`select
      (select count(*) from submissions where form_type = 'kiosk-referral' and created_at >= ${since}) as friends,
      (select count(*) from kiosk_waivers where signed_at >= ${since}) as waivers,
      (select count(*) from submissions where status = 'received' and form_type in ('kiosk-pass', 'kiosk-tour', 'kiosk-referral', 'landing-page') and created_at >= ${since}) as leads,
      (select count(*) from (select contact_id from kiosk_check_ins where checked_in_at >= ${week} - interval '7 days'
        group by contact_id having bool_or(checked_in_at >= ${week}) and bool_or(checked_in_at < ${week})) x) as streakers`.execute(tx);
    const c = counts.rows[0];
    const kiosk = await readKiosk(tx);
    const sales = await getSalesSettings(tx);
    const sender = await salesSender(tx);
    const blocked: BoostsView["blocked"] = {};
    if (!(kiosk.config.waiver.on && waiverReady(kiosk.waiver))) blocked["waiver-first"] = "Your waiver isn't on yet. Write it and turn it on in Settings, Kiosk, then this works on its own.";
    if (!sender) {
      const why = "Email isn't set up yet, so nothing can send. Add your domain in Settings, Email sending.";
      blocked["lead-alerts"] = why;
      for (const k of ["miss-you", "pass-follow-up", "milestones", "review-ask"] as const) blocked[k] = `${why} Until then, the drafts still show up in Agents.`;
    }
    for (const b of BOOSTS) if (!boosts[b.key].on) delete blocked[b.key];
    return {
      sample: false,
      boosts,
      stats: statsFrom({ sent, waiting, friends: Number(c.friends), streakers: Number(c.streakers), waivers: Number(c.waivers), leads: Number(c.leads) }),
      blocked,
      alertsTo: sales.store.alertEmails,
    };
  });
}
