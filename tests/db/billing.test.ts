// Trials, test billing and the Stripe webhook, against the real database.
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadAccess } from "@/lib/access/entitlements";
import { DEV_PEOPLE } from "@/lib/auth/dev-people";
import { startTrial, subscribe } from "@/lib/billing";
import type { SubscriptionLike } from "@/lib/billing/sync";
import { handleStripeWebhook, type SubscriptionFetcher } from "@/lib/billing/webhook";
import { withTenant } from "@/lib/db";
import type { PortalContext } from "@/lib/portal";
import { createTenant } from "@/lib/tenants";
import { app } from "./helpers";

const SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const signer = new Stripe("sk_test_signature_only");
let tenantId: string;
const customer = `cus_test_${randomUUID().slice(0, 8)}`;

async function contextFor(id: string): Promise<PortalContext> {
  const access = await withTenant({ tenantId: id }, (tx) => loadAccess(tx), app());
  return {
    tenant: { id, name: "Webhook Test Co", slug: "x", industry: "general", edition: "bison", access },
    member: { id: "m", userId: "user_test", email: "owner@webhooktest.com", name: "Owner", role: "owner" },
    settings: { sampleData: false, accent: "#7df9ff", timezone: "UTC" },
    sites: [],
  };
}

function signed(event: object) {
  const payload = JSON.stringify(event);
  return { payload, header: signer.webhooks.generateTestHeaderString({ payload, secret: SECRET }) };
}

// A stand-in for Stripe's API: the webhook reads the current subscription from here.
const stripeState = new Map<string, SubscriptionLike>();
const standInStripe: SubscriptionFetcher = async (id) => {
  const sub = stripeState.get(id);
  if (!sub) throw new Error("No such subscription");
  return structuredClone(sub);
};

function setSubscription(id: string, status: string, prices: string[]): SubscriptionLike {
  const sub = {
    id,
    object: "subscription",
    customer,
    status,
    cancel_at_period_end: false,
    items: { data: prices.map((p, i) => ({ id: `si_${id}_${i}`, price: { id: p }, current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30 })) },
  } as unknown as SubscriptionLike;
  stripeState.set(id, sub);
  return sub;
}

/** An event carrying a snapshot of the subscription, as Stripe sends it. */
function eventFor(type: string, snapshot: SubscriptionLike, id = `evt_${randomUUID()}`) {
  return { id, object: "event", type, data: { object: structuredClone(snapshot) } };
}

const deliver = (event: object, fetcher: SubscriptionFetcher = standInStripe) => {
  const { payload, header } = signed(event);
  return handleStripeWebhook(payload, header, app(), fetcher);
};

beforeAll(async () => {
  ({ tenantId } = await createTenant(
    { name: "Webhook Test Co", domain: `webhooks-${randomUUID().slice(0, 6)}.example.com`, owner: { userId: "user_test", email: "owner@webhooktest.com", name: "Owner" } },
    app(),
  ));
  await withTenant({ tenantId }, (tx) => tx.updateTable("tenants").set({ stripe_customer_id: customer }).execute(), app());
});

afterAll(async () => {
  await app().destroy();
});

describe("trials", () => {
  it("turns an item on for 14 days, once", async () => {
    // startTrial uses the shared app pool; point it at the test database.
    const first = await startTrial(await contextFor(tenantId), "addon:gallery");
    expect(first).toMatchObject({ ok: true });
    const ctx = await contextFor(tenantId);
    expect(ctx.tenant.access.states["addon:gallery"]).toMatchObject({ active: true, via: "trial", trialUsed: true });

    const again = await startTrial(ctx, "addon:gallery");
    expect(again.ok).toBe(false);
  });
});

describe("test billing", () => {
  it("turns an item on without Stripe", async () => {
    const result = await subscribe(await contextFor(tenantId), "addon:push");
    expect(result.ok).toBe(true);
    expect((await contextFor(tenantId)).tenant.access.states["addon:push"]).toMatchObject({ active: true, via: "subscription" });
  });
});

describe("Stripe webhook", () => {
  it("rejects a bad or missing signature", async () => {
    const { payload } = signed(eventFor("customer.subscription.updated", setSubscription("sub_a", "active", ["price_test_sales"])));
    expect((await handleStripeWebhook(payload, "t=1,v1=nope", app(), standInStripe)).status).toBe(400);
    expect((await handleStripeWebhook("{}", null, app(), standInStripe)).status).toBe(400);
  });

  it("syncs a subscription into entitlements", async () => {
    const sub = setSubscription("sub_a", "active", ["price_test_sales", "price_test_marketing"]);
    expect(await deliver(eventFor("customer.subscription.created", sub))).toEqual({ status: 200, body: "Synced." });
    const access = (await contextFor(tenantId)).tenant.access;
    expect(access.items.has("module:sales")).toBe(true);
    expect(access.items.has("module:marketing")).toBe(true);
  });

  it("processes each event once", async () => {
    const event = eventFor("customer.subscription.updated", setSubscription("sub_a", "active", ["price_test_sales", "price_test_marketing"]));
    expect((await deliver(event)).body).toBe("Synced.");
    expect((await deliver(event)).body).toBe("Already processed.");
  });

  it("uses Stripe's current state, so a late or replayed event can't turn access back on", async () => {
    const activeSnapshot = setSubscription("sub_late", "active", ["price_test_assistant"]);
    const lateUpdate = eventFor("customer.subscription.updated", activeSnapshot);
    // The subscription is canceled before the "active" update finally arrives.
    const canceled = setSubscription("sub_late", "canceled", ["price_test_assistant"]);
    await deliver(eventFor("customer.subscription.deleted", canceled));
    await deliver(lateUpdate);
    expect((await contextFor(tenantId)).tenant.access.items.has("module:assistant")).toBe(false);
  });

  it("keeps access while a card is retried, and turns off items removed from that subscription", async () => {
    await deliver(eventFor("customer.subscription.updated", setSubscription("sub_a", "past_due", ["price_test_sales"])));
    const access = (await contextFor(tenantId)).tenant.access;
    expect(access.states["module:sales"]).toMatchObject({ active: true, pastDue: true });
    expect(access.items.has("module:marketing")).toBe(false);
  });

  it("never cancels another subscription's items", async () => {
    await deliver(eventFor("customer.subscription.created", setSubscription("sub_b", "active", ["price_test_calculator"])));
    // An event for sub_a with no prices this app knows must not touch sub_b.
    await deliver(eventFor("customer.subscription.updated", setSubscription("sub_a", "active", ["price_unknown"])));
    const access = (await contextFor(tenantId)).tenant.access;
    expect(access.items.has("addon:calculator")).toBe(true);
    expect(access.items.has("module:sales")).toBe(false);
  });

  it("asks Stripe to retry when it can't read the subscription", async () => {
    const event = eventFor("customer.subscription.updated", setSubscription("sub_a", "active", ["price_test_sales"]));
    const down: SubscriptionFetcher = async () => {
      throw new Error("Stripe is down");
    };
    expect((await deliver(event, down)).status).toBe(502);
    // The retry succeeds because nothing was recorded the first time.
    expect((await deliver(event)).body).toBe("Synced.");
  });

  it("ignores customers it doesn't know and events it doesn't handle", async () => {
    const stranger = { ...setSubscription("sub_x", "active", ["price_test_sales"]), customer: "cus_nobody" };
    expect((await deliver(eventFor("customer.subscription.updated", stranger))).body).toBe("No tenant for this customer.");
    expect((await deliver({ id: `evt_${randomUUID()}`, object: "event", type: "invoice.paid", data: { object: {} } })).body).toBe("Ignored.");
  });

  it("never touches another tenant", async () => {
    const access = await withTenant({ tenantId: DEV_PEOPLE[0].tenantId }, (tx) => loadAccess(tx), app());
    expect(access.items.has("module:sales")).toBe(false);
  });
});
