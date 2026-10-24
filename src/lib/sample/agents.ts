// Made-up agent work for the public demo and sample data, in each edition's
// words, so the Agents screen shows the team at work.
import type { EditionKey } from "@/config/editions";
import { campaignPlan, cartNudge, leadReply, weeklyRead } from "@/lib/agents/drafts";
import type { WeekNumbers } from "@/lib/agents/roster";
import type { Task } from "@/lib/agents/store";
import { sampleUuid } from "./sales";

const HOUR = 3_600_000;

export const SAMPLE_WEEK: Record<EditionKey, { week: WeekNumbers; before: WeekNumbers }> = {
  bison: { week: { visitors: 520, leads: 11, checkIns: 0, joins: 3 }, before: { visitors: 470, leads: 8, checkIns: 0, joins: 2 } },
  fit: { week: { visitors: 420, leads: 7, checkIns: 380, joins: 2 }, before: { visitors: 455, leads: 9, checkIns: 360, joins: 3 } },
};

export function sampleTasks(tenant: { id: string; name: string; edition: EditionKey; slug: string }, now = new Date()): Task[] {
  const e = tenant.edition;
  const club = tenant.name;
  const at = (h: number) => new Date(now.getTime() - h * HOUR);
  const id = (k: string) => sampleUuid(`${tenant.id}:agent:${k}`);
  const base = { status: "open" as const, result: "", decidedBy: "", decidedAt: null };
  const read = weeklyRead(e, SAMPLE_WEEK[e].week, SAMPLE_WEEK[e].before, [
    { kind: "lead-reply", count: 2 },
    { kind: "cart-nudge", count: 1 },
    { kind: "campaign-plan", count: 1 },
  ]);
  const plan = campaignPlan(e, now);
  const leads: { name: string; email: string; formType: string; fields: Record<string, string> }[] =
    e === "fit"
      ? [
          { name: "Priya Shah", email: "priya.shah@gmail.com", formType: "kiosk-pass", fields: {} },
          { name: "Marcus Reid", email: "marcus.reid@outlook.com", formType: "kiosk-tour", fields: { when: "Evening" } },
        ]
      : [
          { name: "Elena Moreno", email: "elena@desertoasisbuilders.com", formType: "landing-page", fields: { message: "Do you ship to Phoenix, and how long does it take?" } },
          { name: "Noah Fischer", email: "noah.fischer@gmail.com", formType: "landing-page", fields: {} },
        ];
  const tasks: Task[] = [
    ...leads.map((l, i) => ({ ...base, id: id(`lead-${i}`), agent: "frontdesk" as const, kind: "lead-reply" as const, title: `Write back to ${l.name}`, summary: l.formType === "kiosk-pass" ? "Claimed a free pass at the front desk." : l.formType === "kiosk-tour" ? "Asked for a tour at the front desk." : "Sent a form and hasn't heard back yet.", draft: leadReply(e, club, l) as unknown as Record<string, unknown>, createdAt: at(2 + i * 3) })),
    { ...base, id: id("cart"), agent: "memberships", kind: "cart-nudge", title: e === "fit" ? "Nudge Grace Bennett to finish joining" : "Nudge Wes Park about their cart", summary: e === "fit" ? "Left Unlimited monthly behind." : "Left Glow aggregate behind.", draft: cartNudge(e, club, { email: e === "fit" ? "grace.bennett@icloud.com" : "wes@highlineoutdoor.com", name: e === "fit" ? "Grace Bennett" : "Wes Park", item: e === "fit" ? "Unlimited monthly" : "Glow aggregate", shopUrl: `https://example.com/p/${tenant.slug}/shop` }) as unknown as Record<string, unknown>, createdAt: at(20) },
    { ...base, id: id("plan"), agent: "marketing", kind: "campaign-plan", title: `Plan: ${plan.name}`, summary: "Nothing's running right now. Here's a campaign to get going, with what to make for it.", draft: plan as unknown as Record<string, unknown>, createdAt: at(26) },
    { ...base, id: id("read"), agent: "coach", kind: "weekly-read", title: "Your week in numbers", summary: read.lines[0], draft: read as unknown as Record<string, unknown>, createdAt: at(30) },
  ];
  return tasks;
}
