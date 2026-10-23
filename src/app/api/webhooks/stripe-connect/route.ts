import { after } from "next/server";
import type Stripe from "stripe";
import { webhookVerifier } from "@/lib/billing/stripe-client";
import { handleConnectEvent } from "@/lib/sales/connect";
import { afterOrderPaid } from "@/lib/sales/orders";

// Stripe Connect events from companies' own Stripe accounts: paid and expired
// checkouts, paid invoices, refunds and account changes. Signature checked
// before anything else, with the Connect endpoint's own secret.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) return new Response("STRIPE_CONNECT_WEBHOOK_SECRET is not set.", { status: 500 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing Stripe-Signature header.", { status: 400 });
  let event: Stripe.Event;
  try {
    event = webhookVerifier().webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return new Response("Signature check failed.", { status: 400 });
  }
  const object = event.data.object as { id?: string; payment_intent?: string | { id: string } | null };
  const pi = object.payment_intent;
  const result = await handleConnectEvent({ id: event.id, type: event.type, account: event.account ?? null, objectId: String(object.id ?? ""), paymentIntentId: typeof pi === "string" ? pi : (pi?.id ?? null) });
  // Telling the team and sending to ShipStation happens after Stripe has its answer.
  const follow = result.followUp;
  if (follow) after(() => afterOrderPaid(follow.tenantId, follow.orderId));
  return new Response(result.body, { status: result.status });
}
