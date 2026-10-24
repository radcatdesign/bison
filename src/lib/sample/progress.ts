// Made-up progress for the public demo: a company a few weeks in, with some
// achievements earned and the latest XP, in each edition's words.
import type { EditionKey } from "@/config/editions";
import type { Progress, XpEvent } from "@/lib/progress/store";
import type { AchievementKey, XpKind } from "@/lib/progress/rules";

const DAY = 86_400_000;

const EVENTS: Record<EditionKey, [XpKind, string, number, number][]> = {
  bison: [
    ["newsletter-sent", "Three new glow colors are here", 5, 1],
    ["campaign-lead", "Spring launch", 5, 2],
    ["page-published", "Glow that lasts all night", 3, 3],
    ["graphic", "Instagram square", 1, 3],
    ["graphic", "Launch hero", 1, 4],
    ["filed", "Builder pricing", 1, 4],
    ["filed", "Glow that lasts all night", 1, 4],
    ["campaign", "Spring launch", 2, 5],
    ["series-on", "Spring builder follow-up", 3, 6],
    ["page-published", "Builder pricing", 3, 8],
    ["campaign", "Holiday sale", 2, 9],
    ["filed", "Holiday sale", 1, 9],
    ["filed", "Our biggest sale of the year", 1, 9],
    ["graphic", "Story", 1, 10],
    ["filed", "Spring builder follow-up", 1, 11],
    ["filed", "Three new glow colors are here", 1, 11],
  ],
  fit: [
    ["campaign-lead", "New Year challenge", 5, 1],
    ["newsletter-sent", "The New Year challenge is open", 5, 1],
    ["page-published", "Six-week challenge", 3, 2],
    ["graphic", "Lobby screen", 1, 2],
    ["graphic", "Instagram square", 1, 3],
    ["filed", "Six-week challenge", 1, 3],
    ["filed", "Free trial pass", 1, 3],
    ["campaign", "New Year challenge", 2, 4],
    ["kiosk-paired", "Front desk", 3, 6],
    ["series-on", "Challenge sign-up follow-up", 3, 7],
    ["campaign-wrapped", "Summer corporate push", 2, 9],
    ["page-published", "Corporate wellness", 3, 12],
    ["campaign", "Summer corporate push", 2, 14],
    ["filed", "Challenge sign-up follow-up", 1, 4],
    ["filed", "The New Year challenge is open", 1, 4],
    ["graphic", "Story", 1, 3],
  ],
};

const EARNED: Record<EditionKey, [AchievementKey, number][]> = {
  bison: [
    ["first-campaign", 9],
    ["all-in-one", 4],
    ["launch-day", 3],
    ["hit-send", 1],
    ["autopilot", 6],
    ["first-lead", 2],
  ],
  fit: [
    ["first-campaign", 14],
    ["all-in-one", 3],
    ["launch-day", 2],
    ["hit-send", 1],
    ["autopilot", 7],
    ["first-lead", 1],
    ["wrap-party", 9],
    ["front-desk", 6],
  ],
};

export function sampleProgress(edition: EditionKey, now = new Date()): Progress {
  const recent: XpEvent[] = EVENTS[edition].map(([kind, label, points, daysAgo]) => ({ kind, label, points, at: new Date(now.getTime() - daysAgo * DAY - points * 3_600_000) })).sort((a, b) => b.at.getTime() - a.at.getTime());
  const byKind = new Map<XpKind, { count: number; points: number }>();
  for (const e of recent) {
    const k = byKind.get(e.kind) ?? { count: 0, points: 0 };
    byKind.set(e.kind, { count: k.count + 1, points: k.points + e.points });
  }
  return {
    xp: recent.reduce((n, e) => n + e.points, 0),
    recent,
    earned: new Map(EARNED[edition].map(([key, daysAgo]) => [key, new Date(now.getTime() - daysAgo * DAY)])),
    byKind,
  };
}
