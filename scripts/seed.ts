// Seeds two made-up companies with people, modules and real (stored) data.
// Runs as the app role, so seeding goes through RLS like everything else.
// pnpm db:seed (pnpm db:reset runs it too)
import { sql } from "kysely";
import pg from "pg";
import { DEV_PEOPLE, DEV_TENANTS } from "@/lib/auth/dev-people";
import { createDb, type Database, withTenant } from "@/lib/db";
import { createTenant } from "@/lib/tenants";
import { describeUrl, loadEnv, requireEnv } from "./lib/env";

const STORED_CONTACTS: Record<string, { name: string; email: string; form: string; message: string; status: string }[]> = {
  [DEV_TENANTS.brightwater.id]: [
    { name: "Mara Quinn", email: "mara@quinnbuilds.com", form: "Quote request", message: "Pricing for a 16 by 32 plaster pool with glow aggregate.", status: "new" },
    { name: "Theo Grant", email: "theo@grantlandscape.co", form: "Dealer inquiry", message: "We install about 40 pools a year in Boise. Interested in trade pricing.", status: "contacted" },
    { name: "", email: "pkshah@outlook.com", form: "Quote request", message: "Can you resurface a 1998 gunite pool?", status: "new" },
    { name: "Hollis Ward", email: "hollis@wardpoolco.com", form: "Dealer inquiry", message: "Need samples for our showroom.", status: "qualified" },
    { name: "June Okafor", email: "june.okafor@gmail.com", form: "Quote request", message: "Spa only, around 8 feet round.", status: "won" },
  ],
  [DEV_TENANTS.ridgeline.id]: [
    { name: "Owen Brooks", email: "owen@brooksdeli.com", form: "Wholesale inquiry", message: "Looking for a house blend for two cafes, about 30 lb a week.", status: "new" },
    { name: "Lena Park", email: "lena@parkhotels.com", form: "Wholesale inquiry", message: "Coffee for 3 hotel lobbies. Do you supply brewers?", status: "contacted" },
    { name: "Sam Ortiz", email: "sam.ortiz@yahoo.com", form: "Event catering", message: "Espresso cart for a wedding on June 6, 120 guests.", status: "new" },
    { name: "Gwen Liu", email: "gwen@liuofficeparks.com", form: "Office coffee", message: "Weekly delivery for 60 people.", status: "qualified" },
    { name: "", email: "orders@summitbakery.com", form: "Wholesale inquiry", message: "Can we get a sample pack?", status: "new" },
    { name: "Rafe Daniels", email: "rafe@danielsfit.com", form: "Office coffee", message: "Cold brew kegs for a gym?", status: "lost" },
  ],
};

function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function seedTenant(database: Database, key: keyof typeof DEV_TENANTS, log: (m: string) => void) {
  const t = DEV_TENANTS[key];
  const people = DEV_PEOPLE.filter((p) => p.tenantId === t.id);
  const [owner, ...rest] = people;

  const { siteId } = await createTenant(
    {
      id: t.id,
      name: t.name,
      domain: t.domain,
      industry: t.industry,
      sampleData: t.sampleData,
      owner: { userId: owner.userId, email: owner.email, name: owner.name, role: owner.role },
    },
    database,
  );

  await withTenant(
    { tenantId: t.id, userId: owner.userId },
    async (tx) => {
      for (const p of rest) {
        await tx.insertInto("members").values({ user_id: p.userId, email: p.email, name: p.name, role: p.role }).execute();
      }

      if (key === "brightwater") {
        await tx.insertInto("entitlements").values({ item_key: "module:marketing", source: "grant", stripe_subscription_item_id: null, ends_at: null, note: "Seed data" }).execute();
        await tx
          .insertInto("entitlements")
          .values({ item_key: "addon:calculator", source: "trial", stripe_subscription_item_id: null, ends_at: new Date(Date.now() + 9 * 86_400_000), note: "Seed data" })
          .execute();
      }

      const now = Date.now();
      for (const [i, c] of STORED_CONTACTS[t.id].entries()) {
        const seen = new Date(now - (i * 2 + 1) * 3_600_000 * 7);
        const contact = await tx
          .insertInto("contacts")
          .values({ email: c.email, name: c.name, status: c.status as never, is_new: c.status === "new", first_seen_at: seen, last_seen_at: seen })
          .returning("id")
          .executeTakeFirstOrThrow();
        await tx
          .insertInto("submissions")
          .values({
            contact_id: contact.id,
            site_id: siteId,
            form_key: c.form.toLowerCase().replace(/\s+/g, "-"),
            form_type: c.form,
            fields: JSON.stringify({ name: c.name, email: c.email, message: c.message }),
            spam_reason: null,
            alert: JSON.stringify({}),
            created_at: seen,
          })
          .execute();
      }

      // About four weeks of traffic so the overview has real numbers.
      await sql`select ensure_event_partitions(2, 2)`.execute(tx);
      const rand = prng(key === "brightwater" ? 7 : 11);
      const paths = key === "brightwater" ? ["/", "/glow-aggregate", "/gallery", "/dealers", "/quote"] : ["/", "/shop", "/wholesale", "/cafes", "/about"];
      const rows = [];
      for (let day = 27; day >= 0; day--) {
        const visits = 14 + Math.floor(rand() * 18) + (day % 7 < 2 ? -6 : 0);
        for (let v = 0; v < visits; v++) {
          const visitId = `v_seed_${day}_${v}`;
          const visitor = `h_${Math.floor(rand() * 400)}`;
          const start = now - day * 86_400_000 - Math.floor(rand() * 80_000_000);
          const pages = 1 + Math.floor(rand() * rand() * 5);
          const returning = rand() < 0.25;
          let last = "/";
          for (let p = 0; p < pages; p++) {
            const at = new Date(Math.min(start + p * 45_000, now - 60_000));
            last = paths[Math.floor(rand() * paths.length)];
            rows.push({ occurred_at: at, site_id: siteId, visit_id: visitId, visitor_hash: visitor, browser_id: null, type: "pageview" as const, path: last, name: null, label: null, props: JSON.stringify({ returning }) });
          }
          const activeMs = pages === 1 && rand() < 0.5 ? Math.floor(rand() * 9_000) : 15_000 + Math.floor(rand() * 150_000);
          rows.push({ occurred_at: new Date(Math.min(start + pages * 45_000, now - 30_000)), site_id: siteId, visit_id: visitId, visitor_hash: visitor, browser_id: null, type: "leave" as const, path: last, name: null, label: null, props: JSON.stringify({ active_ms: activeMs }) });
        }
      }
      for (let i = 0; i < rows.length; i += 500) await tx.insertInto("events").values(rows.slice(i, i + 500)).execute();
      await tx.updateTable("sites").set({ first_event_at: rows[0]?.occurred_at ?? null }).where("id", "=", siteId).execute();
      log(`Seeded ${t.name}: ${people.length} people, ${STORED_CONTACTS[t.id].length} contacts, ${rows.length} events`);
    },
    database,
  );
}

export async function seed(appUrl: string, log = console.log, ownerUrl = process.env.DATABASE_MIGRATE_URL) {
  const database = createDb(appUrl, 2);
  try {
    await seedTenant(database, "brightwater", log);
    await seedTenant(database, "ridgeline", log);
  } finally {
    await database.destroy();
  }
  // Verifying a domain is system work the app role can't do, so the seed does it as the owner.
  if (ownerUrl) {
    const owner = new pg.Client({ connectionString: ownerUrl });
    await owner.connect();
    try {
      await owner.query("update sites set verified_at = now() where domain = any($1)", [Object.values(DEV_TENANTS).map((t) => t.domain)]);
    } finally {
      await owner.end();
    }
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  loadEnv();
  const url = requireEnv("DATABASE_URL");
  console.log(`Seeding ${describeUrl(url)}`);
  seed(url).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
