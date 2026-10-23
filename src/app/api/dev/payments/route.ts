// The stand-in for Stripe's checkout, for tests and local work: the shop's
// checkout page posts here to "pay". It answers 404 on Vercel and whenever real
// Stripe is set up.
import { z } from "zod";
import { handleConnectEvent } from "@/lib/sales/connect";
import { afterOrderPaid } from "@/lib/sales/orders";
import { devPaymentsAllowed, PaymentsError, standInPay, standInStore } from "@/lib/sales/payments";

const body = z.object({ sessionId: z.string().min(5).max(200), option: z.string().max(80).nullable().default(null), phone: z.string().max(40).default("") });

export async function POST(req: Request) {
  if (!devPaymentsAllowed()) return new Response("Not found.", { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, message: "Bad request." }, { status: 400 });
  let accountId: string;
  try {
    accountId = standInStore().checkouts.get(parsed.data.sessionId)?.accountId ?? "";
    standInPay(parsed.data.sessionId, parsed.data.option, parsed.data.phone);
  } catch (err) {
    return Response.json({ ok: false, message: err instanceof PaymentsError ? err.message : "That didn't work." }, { status: 400 });
  }
  const r = await handleConnectEvent({ id: `evt_standin_${parsed.data.sessionId}`, type: "checkout.session.completed", account: accountId, objectId: parsed.data.sessionId });
  if (r.followUp) await afterOrderPaid(r.followUp.tenantId, r.followUp.orderId);
  return Response.json({ ok: r.status === 200, message: r.body });
}
