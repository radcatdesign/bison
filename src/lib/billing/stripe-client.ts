import Stripe from "stripe";

let client: Stripe | null = null;

/** The Bison Ops platform account (bills tenants). Tenant checkout uses Connect in Phase 2. */
export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set. Use BILLING_PROVIDER=fake to work without Stripe.");
    client = new Stripe(key, { appInfo: { name: "Bison Ops" } });
  }
  return client;
}

/** Signature checks need no API key, so tests and the webhook route can verify without one. */
export function webhookVerifier(): Stripe {
  return client ?? new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_signature_only");
}
