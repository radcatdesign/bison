import { timingSafeEqual } from "node:crypto";
import { sql } from "kysely";
import { db } from "@/lib/db";
import { runEmailWork } from "@/lib/marketing/worker";
import { runPageTestWork } from "@/lib/pages/tests";
import { runSalesWork } from "@/lib/sales/job";

export const maxDuration = 300;

// Vercel Cron, once a day (vercel.json). Keeps event partitions ahead of time,
// removes events past each tenant's retention, and runs the email, sales and
// A/B test jobs as a backstop for setups where they can't run every few minutes.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Not allowed.", { status: 401 });
  const { rows: created } = await sql<{ n: number }>`select ensure_event_partitions(2) as n`.execute(db());
  const { rows: purged } = await sql<{ n: string }>`select purge_expired_events() as n`.execute(db());
  const email = await runEmailWork({ budgetMs: 170_000 });
  const sales = await runSalesWork({ budgetMs: 60_000 });
  // Tests set to end on their own are judged here, once a day, never every few minutes.
  const pageTests = await runPageTestWork({ budgetMs: 30_000, autoEnd: true });
  return Response.json({ partitionsCreated: created[0]?.n ?? 0, eventsRemoved: Number(purged[0]?.n ?? 0), email, sales, pageTests });
}
