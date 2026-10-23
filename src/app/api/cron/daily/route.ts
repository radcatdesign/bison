import { timingSafeEqual } from "node:crypto";
import { sql } from "kysely";
import { db } from "@/lib/db";
import { runEmailWork } from "@/lib/marketing/worker";

export const maxDuration = 300;

// Vercel Cron, once a day (vercel.json). Keeps event partitions ahead of time,
// removes events past each tenant's retention, and runs the email job as a
// backstop for setups where it can't run every few minutes.
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
  const email = await runEmailWork({ budgetMs: 200_000 });
  return Response.json({ partitionsCreated: created[0]?.n ?? 0, eventsRemoved: Number(purged[0]?.n ?? 0), email });
}
