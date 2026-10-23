// One-click unsubscribe (RFC 8058). Mail apps like Gmail and Apple Mail post
// here from their own Unsubscribe button, named in each email's
// List-Unsubscribe header. It unsubscribes right away and answers 200.
import { demoMode } from "@/lib/env";
import { unsubscribeByToken } from "@/lib/marketing/unsubscribe";
import { allow, clientIp } from "@/lib/rate-limit";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (demoMode()) return new Response("Not found.", { status: 404 });
  const { token } = await params;
  if (!allow(`unsub:${clientIp(req)}`, 60, 60_000)) return new Response("Too many requests.", { status: 429 });
  const ok = await unsubscribeByToken(token, "one-click");
  return new Response(ok ? "Unsubscribed." : "This link isn't valid.", { status: ok ? 200 : 404 });
}

/** Opening the address in a browser goes to the page with a button instead. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return Response.redirect(new URL(`/u/${encodeURIComponent(token)}`, _req.url), 303);
}
