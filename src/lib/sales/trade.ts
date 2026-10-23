import "server-only";
// Trade (wholesale) accounts: buyers apply, the team approves, and approved
// accounts buy at tier prices that step down as their 12-month spend grows.
// Buyers sign in with an emailed link; the shop then prices everything for
// their account. Links and sessions carry the account's session_version, so
// pausing or declining an account signs it out everywhere.
import { sql } from "kysely";
import { CATALOG } from "@/config/catalog";
import { checkLink, signLink } from "@/lib/email/tokens";
import { isUuid, type Tx } from "@/lib/db";
import type { TradeStatus } from "@/lib/db/types";
import { appUrl } from "@/lib/env";
import { type Tier, tierFor } from "./settings";
import type { TradeRow } from "./types";

export const TRADE_LINK_DAYS = 1;
export const TRADE_SESSION_DAYS = 30;
export const tradeLimit = () => CATALOG["module:sales"].limits.tradeAccounts ?? 500;

export class TradeError extends Error {}

/** Spend over the last 12 months: after discounts and refunds, before tax and shipping. */
export async function spendByAccount(tx: Tx, accountIds: string[], now = new Date()): Promise<Map<string, { spendCents: number; orders: number }>> {
  const out = new Map<string, { spendCents: number; orders: number }>();
  const ids = accountIds.filter(isUuid);
  if (!ids.length) return out;
  const since = new Date(now.getTime() - 365 * 86_400_000);
  const rows = await tx
    .selectFrom("orders")
    .select(["trade_account_id", sql<string>`coalesce(sum(greatest(subtotal_cents - discount_cents - refunded_cents, 0)), 0)`.as("spend"), sql<string>`count(*)`.as("n")])
    .where("trade_account_id", "in", ids)
    .where("paid_at", ">=", since)
    .where("status", "!=", "canceled")
    .groupBy("trade_account_id")
    .execute();
  for (const r of rows) if (r.trade_account_id) out.set(r.trade_account_id, { spendCents: Number(r.spend), orders: Number(r.n) });
  return out;
}

export type TradeBuyer = { id: string; company: string; email: string; tier: Tier; spendCents: number };

/** The tier an approved account buys at right now, or null. */
export async function tradeBuyer(tx: Tx, accountId: string, tiers: Tier[], now = new Date()): Promise<TradeBuyer | null> {
  if (!isUuid(accountId)) return null;
  const a = await tx.selectFrom("trade_accounts").select(["id", "company", "email", "status", "tier_override"]).where("id", "=", accountId).executeTakeFirst();
  if (!a || a.status !== "approved") return null;
  const spend = (await spendByAccount(tx, [a.id], now)).get(a.id)?.spendCents ?? 0;
  return { id: a.id, company: a.company, email: a.email, tier: tierFor(tiers, spend, a.tier_override), spendCents: spend };
}

export async function listTrade(tx: Tx, status: TradeStatus | "all" = "all"): Promise<TradeRow[]> {
  let q = tx.selectFrom("trade_accounts").selectAll().orderBy("created_at", "desc").limit(1000);
  if (status !== "all") q = q.where("status", "=", status);
  const rows = await q.execute();
  const spend = await spendByAccount(
    tx,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    id: r.id,
    company: r.company,
    contactName: r.contact_name,
    email: r.email,
    phone: r.phone,
    website: r.website,
    status: r.status,
    details: (r.details ?? {}) as Record<string, string>,
    note: r.note,
    tierOverride: r.tier_override,
    spendCents: spend.get(r.id)?.spendCents ?? 0,
    orderCount: spend.get(r.id)?.orders ?? 0,
    appliedAt: r.created_at,
    decidedAt: r.decided_at,
  }));
}

export type TradeApplication = { company: string; name: string; email: string; phone: string; website: string; details: Record<string, string> };

/** A public application. An existing account keeps its status; a declined one applies again. */
export async function applyForTrade(tx: Tx, a: TradeApplication): Promise<{ id: string; created: boolean; status: TradeStatus }> {
  const existing = await tx.selectFrom("trade_accounts").select(["id", "status"]).where("email", "=", a.email).executeTakeFirst();
  const contact = await tx
    .insertInto("contacts")
    .values({ email: a.email, name: a.name, phone: a.phone })
    .onConflict((oc) => oc.columns(["tenant_id", "email"]).doUpdateSet({ last_seen_at: sql`now()`, is_new: true, name: sql`coalesce(nullif(contacts.name, ''), excluded.name)`, phone: sql`coalesce(nullif(contacts.phone, ''), excluded.phone)` }))
    .returning("id")
    .executeTakeFirstOrThrow();
  await tx
    .insertInto("submissions")
    .values({ contact_id: contact.id, form_key: "trade:apply", form_type: "Trade application", fields: JSON.stringify({ company: a.company, name: a.name, email: a.email, phone: a.phone, website: a.website, ...a.details }), alert: "{}" })
    .execute();
  if (existing) {
    if (existing.status !== "declined") return { id: existing.id, created: false, status: existing.status };
    await tx.updateTable("trade_accounts").set({ status: "applied", company: a.company, contact_name: a.name, phone: a.phone, website: a.website, details: JSON.stringify(a.details), decided_at: null, decided_by: "" }).where("id", "=", existing.id).execute();
    return { id: existing.id, created: false, status: "applied" };
  }
  const { n } = await tx.selectFrom("trade_accounts").select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
  if (Number(n) >= tradeLimit()) throw new TradeError("We can't take new trade applications right now. Please contact us directly.");
  const row = await tx
    .insertInto("trade_accounts")
    .values({ company: a.company, contact_name: a.name, email: a.email, phone: a.phone, website: a.website, details: JSON.stringify(a.details), contact_id: contact.id })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { id: row.id, created: true, status: "applied" };
}

/** Approve, decline or pause. Anything but approved signs the buyer out everywhere. */
export async function decideTrade(tx: Tx, id: string, status: Exclude<TradeStatus, "applied">, actor: string): Promise<{ email: string; company: string; name: string; version: number } | null> {
  const row = await tx
    .updateTable("trade_accounts")
    .set({ status, decided_at: new Date(), decided_by: actor, ...(status === "approved" ? {} : { session_version: sql`session_version + 1` }) })
    .where("id", "=", id)
    .returning(["email", "company", "contact_name", "session_version"])
    .executeTakeFirst();
  return row ? { email: row.email, company: row.company, name: row.contact_name, version: row.session_version } : null;
}

// ---- Signing in on the shop ---------------------------------------------------------------

export function tradeLinkUrl(tenantSlug: string, accountId: string, version: number, issuedAt = Date.now()): string {
  return `${appUrl()}/p/${tenantSlug}/trade/enter?t=${encodeURIComponent(signLink(`trade-link:v${version}`, accountId, issuedAt))}`;
}

export function tradeSessionToken(accountId: string, version: number, issuedAt = Date.now()): string {
  return signLink(`trade-session:v${version}`, accountId, issuedAt);
}

export const tradeCookieName = (tenantSlug: string) => `bo_trade_${tenantSlug.replace(/[^a-z0-9-]/g, "")}`;

/** The approved account behind a sign-in link or session, or null. */
export async function checkTradeToken(tx: Tx, kind: "link" | "session", token: unknown, now = Date.now()): Promise<{ id: string; version: number } | null> {
  if (typeof token !== "string") return null;
  const id = /^\d{1,4}\.([0-9a-f-]{36})\./.exec(token)?.[1];
  if (!id || !isUuid(id)) return null;
  const a = await tx.selectFrom("trade_accounts").select(["status", "session_version"]).where("id", "=", id).executeTakeFirst();
  if (!a || a.status !== "approved") return null;
  const r = checkLink(`trade-${kind}:v${a.session_version}`, token, kind === "link" ? TRADE_LINK_DAYS : TRADE_SESSION_DAYS, now);
  if (!r || r.expired || r.id !== id) return null;
  return { id, version: a.session_version };
}
