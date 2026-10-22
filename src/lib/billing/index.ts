// Starting trials and subscriptions. Two providers share one interface:
//   fake:   grants the item straight away (local work, demos, tests)
//   stripe: Stripe Checkout for the first item, then adds items with proration
import { CATALOG, type PaidItemKey, stripePriceFor } from "@/config/catalog";
import { daysLeft } from "@/lib/access/entitlements";
import { audit } from "@/lib/audit";
import { withTenant } from "@/lib/db";
import { appUrl, billingProviderName } from "@/lib/env";
import { type PortalContext, scopeOf } from "@/lib/portal";
import { stripe } from "./stripe-client";

export type BillingResult = { ok: true; message: string; redirectUrl?: string } | { ok: false; message: string };

export async function startTrial(ctx: PortalContext, key: PaidItemKey): Promise<BillingResult> {
  const item = CATALOG[key];
  const state = ctx.tenant.access.states[key];
  if (state.active) return { ok: false, message: `${item.name} is already on.` };
  if (state.trialUsed) return { ok: false, message: `You've already tried ${item.name}. Subscribe to turn it back on.` };

  const endsAt = new Date(Date.now() + item.trialDays * 86_400_000);
  await withTenant(scopeOf(ctx), async (tx) => {
    await tx.insertInto("entitlements").values({ item_key: key, source: "trial", ends_at: endsAt, stripe_subscription_item_id: null, note: null }).execute();
    await audit(tx, { action: "billing.trial_started", targetType: "item", targetId: key, detail: { ends_at: endsAt.toISOString() } });
  });
  return { ok: true, message: `${item.name} is on for ${daysLeft(endsAt)} days. No card needed.` };
}

export async function subscribe(ctx: PortalContext, key: PaidItemKey): Promise<BillingResult> {
  const item = CATALOG[key];
  if (ctx.tenant.access.states[key].via === "subscription") return { ok: false, message: `You already subscribe to ${item.name}.` };
  return billingProviderName() === "stripe" ? subscribeWithStripe(ctx, key) : subscribeFake(ctx, key);
}

async function subscribeFake(ctx: PortalContext, key: PaidItemKey): Promise<BillingResult> {
  await withTenant(scopeOf(ctx), async (tx) => {
    await tx
      .insertInto("entitlements")
      .values({ item_key: key, source: "subscription", status: "active", stripe_subscription_item_id: null, ends_at: null, note: "Test billing, no Stripe" })
      .onConflict((oc) => oc.columns(["tenant_id", "item_key", "source"]).doUpdateSet({ status: "active", ends_at: null }))
      .execute();
    await audit(tx, { action: "billing.subscribed", targetType: "item", targetId: key, detail: { provider: "fake" } });
  });
  return { ok: true, message: `${CATALOG[key].name} is on. (Test billing: no card was charged.)` };
}

async function subscribeWithStripe(ctx: PortalContext, key: PaidItemKey): Promise<BillingResult> {
  const price = stripePriceFor(key);
  if (!price) return { ok: false, message: `${CATALOG[key].name} has no Stripe price yet. Set ${CATALOG[key].stripePriceEnv} and try again.` };

  const state = await withTenant(scopeOf(ctx), async (tx) => {
    const tenant = await tx.selectFrom("tenants").select(["stripe_customer_id"]).executeTakeFirstOrThrow();
    const sub = await tx
      .selectFrom("subscriptions")
      .select(["stripe_subscription_id"])
      .where("status", "in", ["active", "trialing", "past_due"])
      .orderBy("created_at", "desc")
      .executeTakeFirst();
    return { customerId: tenant.stripe_customer_id, subscriptionId: sub?.stripe_subscription_id ?? null };
  });

  let customerId = state.customerId;
  if (!customerId) {
    const customer = await stripe().customers.create(
      { name: ctx.tenant.name, email: ctx.member.email, metadata: { tenant_id: ctx.tenant.id } },
      { idempotencyKey: `customer-${ctx.tenant.id}` },
    );
    customerId = customer.id;
    await withTenant(scopeOf(ctx), (tx) => tx.updateTable("tenants").set({ stripe_customer_id: customerId }).execute());
  }

  if (state.subscriptionId) {
    // Add to the existing subscription; the webhook confirms and syncs entitlements.
    // Idempotent per subscription and item, so a double click can't add and bill it twice.
    await stripe().subscriptionItems.create(
      { subscription: state.subscriptionId, price, quantity: 1, proration_behavior: "create_prorations" },
      { idempotencyKey: `add-${state.subscriptionId}-${key}` },
    );
    await withTenant(scopeOf(ctx), (tx) => audit(tx, { action: "billing.item_added", targetType: "item", targetId: key }));
    return { ok: true, message: `${CATALOG[key].name} was added to your plan. It turns on as soon as Stripe confirms.` };
  }

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: ctx.tenant.id,
    line_items: [{ price, quantity: 1 }],
    metadata: { tenant_id: ctx.tenant.id, item_key: key },
    subscription_data: { metadata: { tenant_id: ctx.tenant.id } },
    success_url: `${appUrl()}/settings/billing?done=${encodeURIComponent(key)}`,
    cancel_url: `${appUrl()}/settings/billing?item=${encodeURIComponent(key)}`,
  });
  if (!session.url) return { ok: false, message: "Stripe didn't return a checkout page. Try again in a minute." };
  return { ok: true, message: "Opening Stripe checkout.", redirectUrl: session.url };
}
