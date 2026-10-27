// Boosts: club tools a Fit Funnels club can switch on. Each one changes real
// behavior: the agents draft new kinds of work, the kiosk says or does more,
// or the team gets an email. Pure: names, what each does, and its settings.

export type BoostKey = "miss-you" | "pass-follow-up" | "milestones" | "streaks" | "review-ask" | "bring-a-friend" | "waiver-first" | "lead-alerts";
export type BoostCategory = "keep" | "grow" | "desk" | "reputation";

export const CATEGORIES: Record<BoostCategory, { name: string; note: string }> = {
  keep: { name: "Keep members coming", note: "Catch people before they drift away." },
  grow: { name: "Bring in new people", note: "Turn walk-ins and friends into members." },
  desk: { name: "Run the front desk", note: "A smoother check-in for members and staff." },
  reputation: { name: "Build your name", note: "Get the word out from happy members." },
};

export type BoostSettings = {
  /** Days without a visit before a member counts as drifting. */
  days?: number;
  /** Visits before asking for a review. */
  visits?: number;
  /** Where reviews go, like the club's Google review page. */
  link?: string;
};

export type BoostSpec = {
  key: BoostKey;
  name: string;
  category: BoostCategory;
  pitch: string;
  /** What happens once it's on, step by step. */
  how: string[];
  /** Who does the work, for the card. */
  by: "Front desk agent" | "Kiosk" | "Email to your team";
  defaults: BoostSettings;
  /** A setting a club must give before it can go on. */
  needs?: "link";
};

export const DAY_CHOICES = [10, 14, 21, 30] as const;
export const VISIT_CHOICES = [3, 5, 10] as const;
export const PASS_DAY_CHOICES = [2, 3, 5, 7] as const;
export const MILESTONES = [10, 25, 50, 100, 250, 500, 1000] as const;

export const BOOSTS: BoostSpec[] = [
  {
    key: "miss-you",
    name: "We miss you",
    category: "keep",
    pitch: "When a regular stops coming in, your front desk agent writes them a friendly note to come back.",
    how: ["Watches check-ins for members who came in at least twice", "Spots anyone who hasn't been in for the number of days you pick", "Drafts a short, warm email in Agents for you to send"],
    by: "Front desk agent",
    defaults: { days: 14 },
  },
  {
    key: "pass-follow-up",
    name: "Free pass follow-through",
    category: "grow",
    pitch: "Someone claimed a free pass but never came in. Your front desk agent reminds them it's waiting.",
    how: ["Looks at free passes claimed at the kiosk or on your funnel pages", "If they haven't checked in after the days you pick, drafts a reminder", "You send it from Agents with one click"],
    by: "Front desk agent",
    defaults: { days: 3 },
  },
  {
    key: "milestones",
    name: "Milestone shout-outs",
    category: "keep",
    pitch: "Celebrate visit 10, 25, 50, 100 and up, right on the kiosk screen, with a note from the team after.",
    how: ["The kiosk's check-in screen says when someone hits a milestone", "Your front desk agent drafts a congratulations email", "Milestones: 10, 25, 50, 100, 250, 500 and 1,000 visits"],
    by: "Kiosk",
    defaults: {},
  },
  {
    key: "streaks",
    name: "Check-in streaks",
    category: "keep",
    pitch: "Show members how many weeks in a row they've made it in. Small wins keep people showing up.",
    how: ["Counts the weeks in a row each member has checked in", "Shows it on the kiosk at check-in once it's 2 weeks or more", "Nothing to set up"],
    by: "Kiosk",
    defaults: {},
  },
  {
    key: "review-ask",
    name: "Review requests",
    category: "reputation",
    pitch: "After a member's first few visits, your front desk agent asks them for a review while they're happy.",
    how: ["Waits for the number of visits you pick", "Drafts a short ask with your review link", "Each member is asked once"],
    by: "Front desk agent",
    defaults: { visits: 5, link: "" },
    needs: "link",
  },
  {
    key: "bring-a-friend",
    name: "Bring a friend",
    category: "grow",
    pitch: "Members add a friend at the kiosk. The friend lands in Leads with a note saying who sent them.",
    how: ["Adds a Bring a friend button to the kiosk", "The member gives their phone or email, then their friend's name and email", "The friend shows up in Leads, and your front desk agent drafts a welcome that mentions who sent them"],
    by: "Kiosk",
    defaults: {},
  },
  {
    key: "waiver-first",
    name: "Waiver before the floor",
    category: "desk",
    pitch: "Anyone who checks in without a signed waiver goes straight to signing it, instead of being asked.",
    how: ["Needs your waiver on in Settings, Kiosk", "At check-in, anyone without a signed waiver goes right to signing it", "Members who've signed see nothing new"],
    by: "Kiosk",
    defaults: {},
  },
  {
    key: "lead-alerts",
    name: "Instant lead alerts",
    category: "desk",
    pitch: "Your team gets an email the moment someone claims a free pass, books a tour or is sent by a friend.",
    how: ["Goes to the alert emails in Membership sales, Checkout, or to your owners and admins", "Says who it is, how to reach them and what they asked for", "Sends from your email domain once it's set up"],
    by: "Email to your team",
    defaults: {},
  },
];

export const boostSpec = (key: BoostKey) => BOOSTS.find((b) => b.key === key)!;
export const isBoostKey = (v: unknown): v is BoostKey => typeof v === "string" && BOOSTS.some((b) => b.key === v);

/** A boost's settings, cleaned: anything odd falls back to the default. */
export function readBoostSettings(key: BoostKey, raw: unknown): BoostSettings {
  const d = boostSpec(key).defaults;
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: BoostSettings = {};
  if (d.days !== undefined) {
    const allowed: readonly number[] = key === "pass-follow-up" ? PASS_DAY_CHOICES : DAY_CHOICES;
    out.days = allowed.includes(Number(v.days)) ? Number(v.days) : d.days;
  }
  if (d.visits !== undefined) out.visits = (VISIT_CHOICES as readonly number[]).includes(Number(v.visits)) ? Number(v.visits) : d.visits;
  if (d.link !== undefined) out.link = typeof v.link === "string" && /^https:\/\/[^\s<>"']{4,500}$/.test(v.link.trim()) ? v.link.trim() : "";
  return out;
}

export type BoostState = { on: boolean; settings: BoostSettings; firstOnAt: Date | null; updatedAt: Date | null };

/** The milestone this many visits lands on, if any. */
export const milestoneAt = (visits: number) => (MILESTONES as readonly number[]).includes(visits) ? visits : null;

/**
 * Weeks in a row with at least one visit, counting back from this week.
 * `weeks` are week starts (yyyy-mm-dd, Mondays) with a visit, any order.
 */
export function streakWeeks(weeks: string[], thisWeek: string): number {
  const have = new Set(weeks);
  let n = 0;
  const d = new Date(`${thisWeek}T00:00:00Z`);
  while (have.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 7);
  }
  return n;
}

/** Someone who just became a lead, for the team's alert. */
export type LeadNote = { kind: "pass" | "tour" | "friend" | "page"; name: string; email: string; phone: string; detail: string };

/** The alert's subject and lines. */
export function leadAlertText(n: LeadNote): { subject: string; lines: string[] } {
  const who = n.name || n.email;
  const what = { pass: "claimed a free pass at the kiosk", tour: "asked for a tour at the kiosk", friend: "was sent by a friend at the kiosk", page: "filled in a form on a funnel page" }[n.kind];
  return {
    subject: `New lead: ${who} ${what}`,
    lines: [`${who} ${what}.`, [`Email: ${n.email}`, n.phone ? `Phone: ${n.phone}` : ""].filter(Boolean).join("\n"), n.detail].filter(Boolean),
  };
}
