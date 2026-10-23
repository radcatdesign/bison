// The stand-in's outbox: every email "sent" while EMAIL_PROVIDER=stand-in, kept
// in this server's memory. For tests and local work only; it answers 404 on
// Vercel and whenever real sending is set up.
import { devOutboxAllowed } from "@/lib/env";
import { clearOutbox, readOutbox } from "@/lib/email/provider";
import { runEmailWork } from "@/lib/marketing/worker";

export async function GET(req: Request) {
  if (!devOutboxAllowed()) return new Response("Not found.", { status: 404 });
  const to = new URL(req.url).searchParams.get("to")?.toLowerCase();
  return Response.json(readOutbox().filter((e) => !to || e.to === to));
}

export async function DELETE() {
  if (!devOutboxAllowed()) return new Response("Not found.", { status: 404 });
  clearOutbox();
  return new Response(null, { status: 204 });
}

/** Runs the email job now, as cron would. */
export async function POST() {
  if (!devOutboxAllowed()) return new Response("Not found.", { status: 404 });
  return Response.json(await runEmailWork({ budgetMs: 20_000 }));
}
