// Writes a Stripe subscription's state into subscriptions and entitlements.
import { sql } from "kysely";
import type Stripe from "stripe";
import { itemForStripePrice } from "@/config/catalog";
import { audit } from "@/lib/audit";
import type { Tx } from "@/lib/db";
import type { EntitlementStatus } from "@/lib/db/types";

export function entitlementStatusFor(subscriptionStatus: string): EntitlementStatus {
  switch (subscriptionStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due"; // still usable while Stripe retries the card
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    default:
      return "expired"; // incomplete, paused: not usable yet
  }
}

export type SubscriptionLike = Pick<Stripe.Subscription, "id" | "status" | "cancel_at_period_end"> & {
  customer: string | { id: string };
  items: { data: { id: string; price: { id: string }; current_period_end?: number }[] };
};

export async function syncSubscription(tx: Tx, sub: SubscriptionLike, eventType = "sync") {
  const periodEnds = sub.items.data.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  const currentPeriodEnd = periodEnds.length ? new Date(Math.max(...periodEnds) * 1000) : null;

  await tx
    .insertInto("subscriptions")
    .values({ stripe_subscription_id: sub.id, status: sub.status, current_period_end: currentPeriodEnd, cancel_at_period_end: sub.cancel_at_period_end })
    .onConflict((oc) =>
      oc.column("stripe_subscription_id").doUpdateSet({ status: sub.status, current_period_end: currentPeriodEnd, cancel_at_period_end: sub.cancel_at_period_end }),
    )
    .execute();

  const status = entitlementStatusFor(sub.status);
  const seen: string[] = [];
  for (const item of sub.items.data) {
    const key = itemForStripePrice(item.price.id);
    if (!key) continue; // a price this app doesn't sell; ignore rather than guess
    seen.push(key);
    await tx
      .insertInto("entitlements")
      .values({ item_key: key, source: "subscription", status, stripe_subscription_id: sub.id, stripe_subscription_item_id: item.id, ends_at: null, note: null })
      .onConflict((oc) =>
        oc
          .columns(["tenant_id", "item_key", "source"])
          .doUpdateSet({ status, stripe_subscription_id: sub.id, stripe_subscription_item_id: item.id, ends_at: null })
          // Only take the row over if it's ours, unowned, or the other subscription's access is already off.
          .where(sql<boolean>`entitlements.stripe_subscription_id is null or entitlements.stripe_subscription_id = ${sub.id} or entitlements.status not in ('active', 'past_due')`),
      )
      .execute();
  }

  // Items removed from this subscription lose access. Their data stays.
  // Scoped to this subscription, so another subscription's items are untouched.
  let removed = tx
    .updateTable("entitlements")
    .set({ status: "canceled" })
    .where("source", "=", "subscription")
    .where("stripe_subscription_id", "=", sub.id)
    .where("status", "!=", "canceled");
  if (seen.length) removed = removed.where("item_key", "not in", seen);
  await removed.execute();

  await audit(tx, { action: "billing.subscription_synced", targetType: "subscription", targetId: sub.id, detail: { event: eventType, status: sub.status, items: seen } });
  return { items: seen, status };
}
