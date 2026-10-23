import { timingSafeEqual } from "node:crypto";
import { runEmailWork } from "@/lib/marketing/worker";

// The email job: scheduled newsletters, series steps and retries. Wants to run
// every 5 minutes. On Vercel Pro, add it to vercel.json crons; on the free plan
// (daily cron only), point a free scheduler at it with the CRON_SECRET bearer
// token. The daily job runs it too, as a backstop.
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function run(req: Request) {
  if (!authorized(req)) return new Response("Not allowed.", { status: 401 });
  return Response.json(await runEmailWork({ budgetMs: 240_000 }));
}

export const GET = run;
export const POST = run;
