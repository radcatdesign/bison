import { timingSafeEqual } from "node:crypto";
import { runEmailWork } from "@/lib/marketing/worker";
import { runPageTestWork } from "@/lib/pages/tests";
import { runSalesWork } from "@/lib/sales/job";

// The email job: scheduled newsletters, series steps and retries, then the
// sales job (left-behind carts, code holds, fulfillment retries), then the A/B
// test job (tests set to end on their own, old visit rows). Wants to run
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
  const email = await runEmailWork({ budgetMs: 200_000 });
  const sales = await runSalesWork({ budgetMs: 60_000 });
  const pageTests = await runPageTestWork({ budgetMs: 20_000 });
  return Response.json({ ...email, sales, pageTests });
}

export const GET = run;
export const POST = run;
