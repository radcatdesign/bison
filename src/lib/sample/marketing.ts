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

const FIRST = ["Avery", "Jordan", "Maya", "Luis", "Priya", "Noah", "Hana", "Marcus", "Elena", "Theo", "Imani", "Grace", "Diego", "Nora", "Kenji", "Ruth", "Omar", "Tessa", "Wes", "Lila", "Felix", "Sasha", "Andre", "June", "Caleb", "Rosa", "Ezra", "Mina", "Jonah", "Iris", "Paloma", "Reza", "Cleo", "Arlo", "Nadia"];
const LAST = ["Bennett", "Okafor", "Nguyen", "Alvarez", "Shah", "Fischer", "Tanaka", "Reid", "Moreno", "Hart", "Kowalski", "Price", "Delgado", "Brooks", "Ito", "Sullivan", "Haddad", "Larsen", "Ford", "Castillo", "Weiss", "Park", "Rowe", "Quinn", "Mendez", "Ochoa", "Lind"];
const MAIL = ["gmail.com", "outlook.com", "icloud.com", "yahoo.com", "proton.me"];
const DAY = 86_400_000;

const LISTS: Record<string, string[]> = {
  pools: ["Homeowners", "Pool builders", "Spring sale"],
  coffee: ["Home brewers", "Wholesale", "Subscribers"],
  general: ["Customers", "Leads"],
};

export function sampleLists(tenant: SampleTenant): SampleList[] {
  return (LISTS[tenant.industry] ?? LISTS.general).map((name, i) => ({ id: `sample-list-${tenant.id.slice(0, 8)}-${i}`, name }));
}

export function sampleSubscribers(tenant: SampleTenant, now = new Date()): SampleSubscriber[] {
  const rand = seeded(`${tenant.id}:${tenant.name}:subscribers`);
  const preset = presetFor(tenant.industry);
  const lists = sampleLists(tenant);
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
    const listIds = lists.filter((_, li) => (li === 0 ? type === preset.signupTypes[0]?.value : li === 1 ? type && type !== preset.signupTypes[0]?.value : rand.chance(0.2))).map((l) => l.id);
    out.push({
      id: `sample-sub-${tenant.id.slice(0, 8)}-${i}`,
      email,
      name: rand.chance(0.15) ? "" : `${first} ${last}`,
      kind: type,
      status,
      source,
      sourceDetail: source === "page" ? "page:spring-sale" : source === "import" ? "Imported" : "",
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
