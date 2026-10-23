// The stand-in for Stripe's onboarding, for tests and local work. Opening the
// link finishes onboarding at once and goes back to Bison Ops, as Stripe would.
import { handleConnectEvent } from "@/lib/sales/connect";
import { devPaymentsAllowed, standInOnboard } from "@/lib/sales/payments";
import { appUrl } from "@/lib/env";

export async function GET(req: Request) {
  if (!devPaymentsAllowed()) return new Response("Not found.", { status: 404 });
  const url = new URL(req.url);
  const account = url.searchParams.get("account") ?? "";
  if (!account.startsWith("acct_standin_")) return new Response("No such account.", { status: 404 });
  if (url.searchParams.get("view")) return new Response(`Stand-in Stripe Dashboard for ${account}. Nothing here is real.`, { headers: { "content-type": "text/plain; charset=utf-8" } });
  standInOnboard(account, { tax: url.searchParams.get("tax") === "1" ? true : undefined });
  await handleConnectEvent({ id: `evt_standin_acct_${Date.now()}`, type: "account.updated", account, objectId: account });
  const back = url.searchParams.get("return") ?? "";
  const target = back.startsWith(appUrl()) ? back : `${appUrl()}/settings/payments?back=1`;
  return Response.redirect(target, 303);
}
