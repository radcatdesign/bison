import "server-only";
// Connecting a company's Stripe account, keeping its status current, and
// handling the events Stripe sends about it: paid checkouts, expired
// checkouts, paid invoices, refunds and account changes. Events only say what
// changed; the current state is always read fresh from Stripe, so late,
// repeated or out-of-order events can't record the wrong thing.
import { sql } from "kysely";
import { audit } from "@/lib/audit";
import { type Database, db, type TenantScope, withTenant } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { checkoutExpired, recordCheckout } from "./checkout";
import { invoicePaid } from "./estimates";
import { syncRefunds } from "./orders";
import { type PaymentsProvider, paymentsProvider } from "./payments";
import { NO_PAYMENTS, type PaymentsConnection, readPayments, writePayments } from "./store";

export class ConnectError extends Error {}

/** Re-reads the account (and whether Stripe Tax is on) from Stripe and saves it. */
export async function refreshPayments(tenantId: string, database: Database = db(), payments: PaymentsProvider | null = paymentsProvider()): Promise<PaymentsConnection> {
  const current = await withTenant({ tenantId, userId: "system:stripe" }, (tx) => readPayments(tx), database);
  if (!current.accountId || !payments) return current;
  let next: PaymentsConnection;
  try {
    const a = await payments.account(current.accountId);
    const tax = a.chargesEnabled ? await payments.tax(current.accountId) : current.tax;
    next = { accountId: current.accountId, chargesEnabled: a.chargesEnabled, needsAction: a.needsAction, status: a.status, tax, checkedAt: new Date(), error: null };
  } catch (err) {
    next = { ...current, error: err instanceof Error ? err.message.slice(0, 300) : "Stripe didn't answer." };
  }
  await withTenant({ tenantId, userId: "system:stripe" }, (tx) => writePayments(tx, next), database);
  return next;
}

/** Makes the company's connected account the first time, then returns a fresh link into Stripe's onboarding. */
export async function onboardingUrl(scope: TenantScope, input: { email: string; businessName: string; website: string | null }, database: Database = db(), payments: PaymentsProvider | null = paymentsProvider()): Promise<string> {
  if (!payments) throw new ConnectError("Payments aren't switched on for this Bison Ops server yet.");
  let conn = await withTenant(scope, (tx) => readPayments(tx), database);
  if (!conn.accountId) {
    const accountId = await payments.createAccount({ email: input.email, businessName: input.businessName, country: "US", website: input.website });
    conn = { ...NO_PAYMENTS, accountId, status: "pending" };
    await withTenant(
      scope,
      async (tx) => {
        // Two clicks at once: keep whichever account was saved first.
        const again = await readPayments(tx);
        if (again.accountId) {
          conn = again;
          return;
        }
        await writePayments(tx, conn);
        await audit(tx, { action: "payments.account_created", targetType: "integration", targetId: "stripe", detail: { accountId } });
      },
      database,
    );
  }
  const base = `${appUrl()}/settings/payments`;
  return payments.onboardingLink(conn.accountId!, { refreshUrl: `${base}/connect`, returnUrl: `${base}?back=1` });
}

/** Forgets the connection. The Stripe account itself stays the company's. */
export async function disconnectPayments(scope: TenantScope, database: Database = db()): Promise<void> {
  await withTenant(
    scope,
    async (tx) => {
      await tx.deleteFrom("integrations").where("provider", "=", "stripe").execute();
      await audit(tx, { action: "payments.disconnected", targetType: "integration", targetId: "stripe" });
    },
    database,
  );
}

// ---- Events ------------------------------------------------------------------------------

export type ConnectEvent = { id: string; type: string; account: string | null; objectId: string; paymentIntentId?: string | null };

export type EventResult = { status: number; body: string; followUp?: { kind: "order"; tenantId: string; orderId: string } };

export const HANDLED = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired", "invoice.paid", "charge.refunded", "account.updated"]);

export async function resolveConnectTenant(accountId: string, database: Database = db()): Promise<string | null> {
  const r = await sql<{ id: string | null }>`select resolve_tenant_by_connect_account(${accountId}) as id`.execute(database);
  return r.rows[0]?.id ?? null;
}

export async function handleConnectEvent(e: ConnectEvent, database: Database = db(), payments: PaymentsProvider | null = paymentsProvider()): Promise<EventResult> {
  if (!HANDLED.has(e.type)) return { status: 200, body: "Ignored." };
  if (!e.account) return { status: 200, body: "Not a connected account event." };
  const tenantId = await resolveConnectTenant(e.account, database);
  // Unknown account: answer 200 so Stripe stops retrying something we'll never match.
  if (!tenantId) return { status: 200, body: "No company for this account." };
  // Every handler below is safe to run twice (orders are keyed to their checkout or
  // invoice), so a repeat delivery just finds the work done. The event is logged
  // after it succeeds, so a failure is retried by Stripe.

  let result: EventResult = { status: 200, body: "Done." };
  try {
    if (e.type === "checkout.session.completed" || e.type === "checkout.session.async_payment_succeeded") {
      const order = await recordCheckout(tenantId, e.objectId, database, payments, "skip");
      result = order ? { status: 200, body: `Order #${order.number}.`, ...(order.created ? { followUp: { kind: "order" as const, tenantId, orderId: order.orderId } } : {}) } : { status: 200, body: "Not paid yet." };
    } else if (e.type === "checkout.session.expired") {
      await checkoutExpired(tenantId, e.objectId, database);
    } else if (e.type === "invoice.paid") {
      const r = await invoicePaid(tenantId, e.objectId, database, payments, "now");
      result = { status: 200, body: r ? "Recorded." : "Not one of ours." };
    } else if (e.type === "charge.refunded" && e.paymentIntentId) {
      const order = await withTenant({ tenantId, userId: "system:stripe" }, (tx) => tx.selectFrom("orders").select("id").where("stripe_payment_intent_id", "=", e.paymentIntentId!).executeTakeFirst(), database);
      if (order) await syncRefunds(tenantId, order.id, database, payments);
    } else if (e.type === "account.updated") {
      await refreshPayments(tenantId, database, payments);
    }
  } catch (err) {
    console.error("Stripe Connect event failed", e.type, err);
    return { status: 502, body: "Couldn't process it. Stripe will retry." };
  }
  await withTenant({ tenantId, userId: "system:stripe" }, (tx) => tx.insertInto("webhook_events").values({ provider: "stripe-connect", event_id: e.id }).onConflict((oc) => oc.doNothing()).execute(), database);
  return result;
}
