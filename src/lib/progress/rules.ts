// XP, levels and achievements: what earns XP, what each achievement asks for,
// and the level math. Pure, so the screens, the sync and the tests agree.
import { type EditionKey, sayFor } from "@/config/editions";

export const XP_PER_LEVEL = 10;

export type Level = { level: number; xp: number; into: number; toNext: number };

/** Level 1 at 0 XP, then one level every 10 XP. */
export function levelFor(xp: number): Level {
  const total = Math.max(0, Math.floor(xp));
  const into = total % XP_PER_LEVEL;
  return { level: Math.floor(total / XP_PER_LEVEL) + 1, xp: total, into, toNext: XP_PER_LEVEL - into };
}

export type XpKind = "campaign" | "filed" | "graphic" | "page-published" | "newsletter-sent" | "series-on" | "campaign-lead" | "campaign-wrapped" | "test-ended" | "first-sale" | "kiosk-paired" | "agent-done" | "boost-on";

export type XpRule = { kind: XpKind; points: number; title: string; how: string; editions?: EditionKey[] };

export function xpRules(edition: EditionKey): XpRule[] {
  const say = sayFor(edition);
  const page = say("landing page", "funnel page");
  return [
    { kind: "campaign", points: 2, title: "Start a campaign", how: "Each campaign you make in Marketing, Campaigns." },
    { kind: "filed", points: 1, title: "Fill a campaign", how: `Each ${page}, newsletter or email series you add to a campaign, once each.` },
    { kind: "graphic", points: 1, title: "Add a graphic", how: "Each graphic you upload to a campaign." },
    { kind: "page-published", points: 3, title: say("Publish a page", "Publish a funnel page"), how: `Each ${page} you put live, once each.` },
    { kind: "newsletter-sent", points: 5, title: "Send a newsletter", how: "Each newsletter that goes out." },
    { kind: "series-on", points: 3, title: "Turn on a series", how: "Each email series you turn on, once each. The starter series doesn't count." },
    { kind: "campaign-lead", points: 5, title: say("Get a lead from a campaign", "Get a lead from a campaign"), how: `The first form send on any ${page} in a campaign, once per campaign.` },
    { kind: "campaign-wrapped", points: 2, title: "Wrap up a campaign", how: "Archive a campaign with something in it, once per campaign." },
    { kind: "test-ended", points: 5, title: "Finish an A/B test", how: "Each test you end and keep a version from." },
    { kind: "first-sale", points: 5, title: say("Make your first sale", "Sell your first membership"), how: say("Your first paid order through your shop or an estimate.", "Your first paid purchase through your club's store or a quote.") },
    { kind: "kiosk-paired", points: 3, title: "Set up the front desk", how: "Pair your first kiosk tablet.", editions: ["fit"] },
    { kind: "boost-on", points: 2, title: "Turn on a boost", how: "Each boost you turn on in Boosts, the first time only.", editions: ["fit"] },
    { kind: "agent-done", points: 1, title: "Approve an agent's work", how: "Each piece of work you send or approve from Agents." },
  ].filter((r) => !r.editions || r.editions.includes(edition)) as XpRule[];
}

export type AchievementKey =
  | "first-campaign"
  | "all-in-one"
  | "launch-day"
  | "hit-send"
  | "autopilot"
  | "first-lead"
  | "busy-season"
  | "wrap-party"
  | "test-and-learn"
  | "brand-ready"
  | "first-sale"
  | "front-desk"
  | "power-up"
  | "level-5"
  | "level-10";

export type Achievement = { key: AchievementKey; name: string; note: string; editions?: EditionKey[] };

export function achievementsFor(edition: EditionKey): Achievement[] {
  const say = sayFor(edition);
  const page = say("landing page", "funnel page");
  const list: Achievement[] = [
    { key: "first-campaign", name: "Plan of attack", note: "Make your first campaign." },
    { key: "all-in-one", name: "All in one place", note: `Have a campaign with a ${page}, an email and a graphic in it.` },
    { key: "launch-day", name: "Launch day", note: `Publish a ${page} that's in a campaign.` },
    { key: "hit-send", name: "Hit send", note: "Send your first newsletter." },
    { key: "autopilot", name: "On autopilot", note: "Turn on an email series." },
    { key: "first-lead", name: "First bite", note: `Get a form send on a ${page} in a campaign.` },
    { key: "busy-season", name: "Busy season", note: "Run 3 campaigns at once." },
    { key: "wrap-party", name: "Wrap party", note: "Archive a campaign once it's done." },
    { key: "test-and-learn", name: "Test and learn", note: "Finish an A/B test." },
    { key: "brand-ready", name: "Looking sharp", note: "Add your logo and postal address to the brand kit." },
    { key: "first-sale", name: say("Open for business", "Doors open"), note: say("Take your first paid order.", "Sell your first membership or pack.") },
    { key: "front-desk", name: "Front and center", note: "Pair a kiosk tablet at your front desk.", editions: ["fit"] },
    { key: "power-up", name: "Powered up", note: "Have 3 boosts on at once.", editions: ["fit"] },
    { key: "level-5", name: "Picking up speed", note: "Reach level 5." },
    { key: "level-10", name: "Hitting your stride", note: "Reach level 10." },
  ];
  return list.filter((a) => !a.editions || a.editions.includes(edition));
}
