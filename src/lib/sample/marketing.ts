// Made-up subscribers, lists and email results for sample mode and the demo.
// Same company, same list, every time. Never written to the database.
import type { SubscriberSource, SubscriberStatus } from "@/lib/db/types";
import { presetFor } from "./industries";
import { seeded } from "./random";

export type SampleTenant = { id: string; name: string; industry: string };

export type SampleSubscriber = {
  id: string;
  email: string;
  name: string;
  kind: string;
  status: SubscriberStatus;
  source: SubscriberSource;
  sourceDetail: string;
  subscribedAt: Date;
  unsubscribedAt: Date | null;
  listIds: string[];
};

export type SampleList = { id: string; name: string };

export const FIRST = ["Avery", "Jordan", "Maya", "Luis", "Priya", "Noah", "Hana", "Marcus", "Elena", "Theo", "Imani", "Grace", "Diego", "Nora", "Kenji", "Ruth", "Omar", "Tessa", "Wes", "Lila", "Felix", "Sasha", "Andre", "June", "Caleb", "Rosa", "Ezra", "Mina", "Jonah", "Iris", "Paloma", "Reza", "Cleo", "Arlo", "Nadia"];
export const LAST = ["Bennett", "Okafor", "Nguyen", "Alvarez", "Shah", "Fischer", "Tanaka", "Reid", "Moreno", "Hart", "Kowalski", "Price", "Delgado", "Brooks", "Ito", "Sullivan", "Haddad", "Larsen", "Ford", "Castillo", "Weiss", "Park", "Rowe", "Quinn", "Mendez", "Ochoa", "Lind"];
export const MAIL = ["gmail.com", "outlook.com", "icloud.com", "yahoo.com", "proton.me"];
const DAY = 86_400_000;

const LISTS: Record<string, string[]> = {
  pools: ["Homeowners", "Pool builders", "Spring sale"],
  coffee: ["Home brewers", "Wholesale", "Subscribers"],
  general: ["Customers", "Leads"],
};

/** Clubs' lists follow what people said they are: members, people trying the club, companies. */
type ClubList = { name: string; kinds?: string[]; share?: number };
const CLUB_LISTS: Record<string, ClubList[]> = {
  gym: [{ name: "Members", kinds: ["member"] }, { name: "Trial leads", kinds: ["thinking-about-joining"] }, { name: "Corporate", share: 0.12 }],
  studio: [{ name: "Members", kinds: ["member"] }, { name: "New riders", kinds: ["new-rider"] }, { name: "Corporate and teams", kinds: ["company"] }],
};

/** The funnel page most made-up signups came from. */
const SIGNUP_PAGE: Record<string, string> = { gym: "page:free-pass", studio: "page:first-ride" };

export function sampleLists(tenant: SampleTenant): SampleList[] {
  return (CLUB_LISTS[tenant.industry]?.map((l) => l.name) ?? LISTS[tenant.industry] ?? LISTS.general).map((name, i) => ({ id: `sample-list-${tenant.id.slice(0, 8)}-${i}`, name }));
}

export function sampleSubscribers(tenant: SampleTenant, now = new Date()): SampleSubscriber[] {
  const rand = seeded(`${tenant.id}:${tenant.name}:subscribers`);
  const preset = presetFor(tenant.industry);
  const lists = sampleLists(tenant);
  const club = CLUB_LISTS[tenant.industry];
  const total = rand.int(780, 1340);
  const today = Math.floor(now.getTime() / DAY) * DAY;
  const used = new Set<string>();
  const out: SampleSubscriber[] = [];
  for (let i = 0; i < total; i++) {
    const first = rand.pick(FIRST);
    const last = rand.pick(LAST);
    let email = `${first.toLowerCase()}.${last.toLowerCase()}@${rand.pick(MAIL)}`;
    if (used.has(email)) email = email.replace("@", `${rand.int(2, 999)}@`);
    used.add(email);
    // Newest first: a few a day lately, thinning out over about two years.
    const age = Math.floor(Math.pow(i / total, 1.6) * 720 * DAY + rand.next() * DAY);
    const subscribedAt = new Date(today - age + rand.int(8, 20) * 3_600_000);
    const type = rand.chance(0.85) ? rand.pick(preset.signupTypes).value : "";
    const gone = i > 6 && rand.chance(0.06);
    const status: SubscriberStatus = gone ? (rand.chance(0.15) ? "bounced" : "unsubscribed") : "subscribed";
    const source: SubscriberSource = rand.chance(0.55) ? "page" : rand.chance(0.5) ? "import" : rand.chance(0.6) ? "form" : "manual";
    const listIds = club
      ? lists
          .filter((_, li) => {
            const l = club[li];
            return l.kinds ? l.kinds.includes(type) : rand.chance(l.share ?? 0.2);
          })
          .map((l) => l.id)
      : lists.filter((_, li) => (li === 0 ? type === preset.signupTypes[0]?.value : li === 1 ? type && type !== preset.signupTypes[0]?.value : rand.chance(0.2))).map((l) => l.id);
    out.push({
      id: `sample-sub-${tenant.id.slice(0, 8)}-${i}`,
      email,
      name: rand.chance(0.15) ? "" : `${first} ${last}`,
      kind: type,
      status,
      source,
      sourceDetail: source === "page" ? (SIGNUP_PAGE[tenant.industry] ?? "page:spring-sale") : source === "import" ? "Imported" : "",
      subscribedAt,
      unsubscribedAt: gone ? new Date(Math.min(now.getTime() - DAY / 2, subscribedAt.getTime() + rand.int(5, 200) * DAY)) : null,
      listIds,
    });
  }
  return out;
}

export type SampleSendStats = { recipients: number; delivered: number; bounced: number; complained: number; unsubscribed: number };

/** Results for a newsletter that went out, sized to the sample list. */
export function sampleSendStats(seed: string, recipients: number): SampleSendStats {
  const rand = seeded(seed);
  const bounced = Math.round(recipients * (0.004 + rand.next() * 0.008));
  const complained = rand.chance(0.4) ? 1 : 0;
  return { recipients, delivered: recipients - bounced, bounced, complained, unsubscribed: Math.round(recipients * (0.002 + rand.next() * 0.004)) };
}

/** The newsletter that already went out in the demo, in the company's own words. */
export function sampleSentNewsletter(industry: string): { subject: string; preheader: string; headline: string; filler: string } {
  if (industry === "gym") return { subject: "October at the club: new classes on the schedule", preheader: "What's new on the floor, in the pool and in the studio.", headline: "New on the schedule this month", filler: "More at the front desk" };
  if (industry === "studio") return { subject: "October rides: new time slots and a team challenge", preheader: "New classes, new playlists, and who's teaching what.", headline: "New rides this month", filler: "More on the schedule" };
  return { subject: "October news: night swims are back", preheader: "Three projects we loved this month.", headline: "Night swims are back", filler: "More on our site" };
}

/** What a made-up subscriber's history shows: the series they were in and the email it sent. */
export function sampleSeriesHistory(industry: string): { series: string; subject: string } {
  if (industry === "gym" || industry === "studio") return { series: "New lead follow-up", subject: "Thanks for asking about the club" };
  return { series: "Welcome series", subject: "Welcome! Here's what to expect" };
}
