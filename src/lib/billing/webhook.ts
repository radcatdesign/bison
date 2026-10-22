// Stripe webhook handling, separate from the route so tests can call it directly.
// Events can arrive late, twice or out of order, so the event only says *which*
// subscription changed. Its current state is always read fresh from Stripe.
import type Stripe from "stripe";
import { type Database, db, resolveTenantByStripeCustomer, withTenant } from "@/lib/db";
import { stripe, webhookVerifier } from "./stripe-client";
import { type SubscriptionLike, syncSubscription } from "./sync";

export type WebhookResult = { status: number; body: string };
export type SubscriptionFetcher = (subscriptionId: string) => Promise<SubscriptionLike>;

const SUBSCRIPTION_EVENTS = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]);

const fetchFromStripe: SubscriptionFetcher = (id) => stripe().subscriptions.retrieve(id);

const customerIdOf = (c: string | { id: string }) => (typeof c === "string" ? c : c.id);

export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
  database: Database = db(),
  fetchSubscription: SubscriptionFetcher = fetchFromStripe,
): Promise<WebhookResult> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return { status: 500, body: "STRIPE_WEBHOOK_SECRET is not set." };
  if (!signature) return { status: 400, body: "Missing Stripe-Signature header." };

  let event: Stripe.Event;
  try {
    event = webhookVerifier().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return { status: 400, body: "Signature check failed." };
  }

  if (!SUBSCRIPTION_EVENTS.has(event.type)) return { status: 200, body: "Ignored." };

  const stale = event.data.object as Stripe.Subscription;
  const customerId = customerIdOf(stale.customer);
  const tenantId = await resolveTenantByStripeCustomer(customerId, database);
  // Unknown customer: answer 200 so Stripe stops retrying something we'll never match.
  if (!tenantId) return { status: 200, body: "No tenant for this customer." };

  let fresh: SubscriptionLike;
  try {
    fresh = await fetchSubscription(stale.id);
  } catch (err) {
    console.error("Couldn't read subscription from Stripe", err);
    return { status: 502, body: "Couldn't read the subscription from Stripe. Stripe will retry." };
  }
  if (customerIdOf(fresh.customer) !== customerId) return { status: 400, body: "Subscription and customer don't match." };

  return withTenant(
    { tenantId, userId: "system:stripe" },
    async (tx) => {
      // Dedupe in the same transaction as the work, so a failed run can be retried.
      const inserted = await tx.insertInto("webhook_events").values({ provider: "stripe", event_id: event.id }).onConflict((oc) => oc.doNothing()).executeTakeFirst();
      if (!inserted.numInsertedOrUpdatedRows) return { status: 200, body: "Already processed." };
      await syncSubscription(tx, fresh, event.type);
      return { status: 200, body: "Synced." };
    },
    database,
  );
}
