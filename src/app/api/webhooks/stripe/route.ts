import { handleStripeWebhook } from "@/lib/billing/webhook";

// Stripe Billing events for Bison Ops subscriptions. Signature checked before anything else.
export async function POST(req: Request) {
  const result = await handleStripeWebhook(await req.text(), req.headers.get("stripe-signature"));
  return new Response(result.body, { status: result.status });
}
