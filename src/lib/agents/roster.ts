// The agents, in each edition's words, and what each kind of work is called.
// Pure. Fit Funnels clubs get a front desk, memberships, marketing and a coach;
// Bison Ops companies get the same jobs as a general team: customer care,
// sales, marketing and strategy.
import type { EditionKey } from "@/config/editions";
import type { FeatureKey } from "@/config/features";
import type { Action } from "@/config/roles";
import type { AgentKey } from "@/lib/db/types";

export type AgentSpec = { key: AgentKey; name: string; role: string; about: string };

export const AGENT_KEYS: AgentKey[] = ["frontdesk", "memberships", "marketing", "coach"];

export function agentsFor(edition: EditionKey): AgentSpec[] {
  return edition === "fit"
    ? [
        { key: "frontdesk", name: "Front desk", role: "Leads and walk-ins", about: "Writes back to new leads and free passes, and keeps an eye on the kiosk." },
        { key: "memberships", name: "Memberships", role: "Joins and quotes", about: "Follows up with people who didn't finish joining and corporate quotes that went quiet." },
        { key: "marketing", name: "Marketing", role: "Campaigns and email", about: "Plans the next campaign, drafts newsletters and points out pages that aren't ready." },
        { key: "coach", name: "Coach", role: "Weekly read", about: "Reads your numbers every week and says what's working and what to do next." },
      ]
    : [
        { key: "frontdesk", name: "Customer care", role: "New leads", about: "Writes back to new leads while they're still interested." },
        { key: "memberships", name: "Sales", role: "Carts and estimates", about: "Follows up on carts left behind and estimates that went quiet." },
        { key: "marketing", name: "Marketing", role: "Campaigns and email", about: "Plans the next campaign, drafts newsletters and points out pages that aren't ready." },
        { key: "coach", name: "Strategy", role: "Weekly read", about: "Reads your numbers every week and says what's working and what to do next." },
      ];
}

export type TaskKind = "lead-reply" | "kiosk-quiet" | "cart-nudge" | "estimate-nudge" | "fill-placeholders" | "newsletter-draft" | "campaign-plan" | "weekly-read";

/** What each kind of work needs: the plan feature, the role action to approve it, and the button. */
export const KINDS: Record<TaskKind, { agent: AgentKey; feature: FeatureKey; action: Action | null; approve: string; email: boolean }> = {
  "lead-reply": { agent: "frontdesk", feature: "contacts", action: "contacts.edit", approve: "Send it", email: true },
  "kiosk-quiet": { agent: "frontdesk", feature: "kiosk", action: null, approve: "Got it", email: false },
  "cart-nudge": { agent: "memberships", feature: "sales.abandoned", action: "sales.edit", approve: "Send it", email: true },
  "estimate-nudge": { agent: "memberships", feature: "sales.estimates", action: "sales.edit", approve: "Send it", email: true },
  "fill-placeholders": { agent: "marketing", feature: "marketing.pages", action: null, approve: "Got it", email: false },
  "newsletter-draft": { agent: "marketing", feature: "marketing.newsletters", action: "marketing.edit", approve: "Make the draft", email: false },
  "campaign-plan": { agent: "marketing", feature: "marketing.campaigns", action: "marketing.edit", approve: "Make the campaign", email: false },
  "weekly-read": { agent: "coach", feature: "analytics", action: null, approve: "Got it", email: false },
};

export const isTaskKind = (v: unknown): v is TaskKind => typeof v === "string" && v in KINDS;

// ---- How busy the gym looks ----------------------------------------------------------

export type Crowd = { guests: number; mood: "quiet" | "steady" | "busy" | "packed"; activity: number; previous: number };
export type WeekNumbers = { visitors: number; leads: number; checkIns: number; joins: number };

/** One number for a week of marketing: every 50 visitors, 2 leads, 100 check-ins or 1 join is one guest on the floor. */
export const activityOf = (w: WeekNumbers) => w.visitors / 50 + w.leads / 2 + w.checkIns / 100 + w.joins;

/** People on the gym floor for the last 7 days of activity, 0 to 30. */
export function crowdFor(week: WeekNumbers, before: WeekNumbers): Crowd {
  const activity = activityOf(week);
  const guests = Math.max(0, Math.min(30, Math.round(activity)));
  const mood = guests <= 3 ? "quiet" : guests <= 11 ? "steady" : guests <= 21 ? "busy" : "packed";
  return { guests, mood, activity: Math.round(activity * 10) / 10, previous: Math.round(activityOf(before) * 10) / 10 };
}
