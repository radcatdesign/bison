import "server-only";
// Discount codes in the database: saving them, counting their uses, checking a
// code for a cart, and holding a use while a checkout is open so a single-use
// code can't be spent by two people at once. Welcome codes from Marketing go
// through the same check, with the first-order rule on top.
import { sql } from "kysely";
import { type EditionKey, sayFor } from "@/config/editions";
import type { Tx } from "@/lib/db";
import { checkDiscount, checkWelcomeCode, type DiscountCheck, type DiscountInput, type DiscountRule, normalizeCode } from "./discounts";

export type DiscountRow = DiscountRule & { id: string; note: string; uses: number; held: number; createdAt: Date; amountOffCents: number | null };

export class DiscountError extends Error {}

function ruleOf(r: { code: string; percent_off: string | null; amount_off_cents: number | null; usage: DiscountRule["usage"]; trade_account_id: string | null; max_uses: number | null; min_order_cents: number | null; starts_at: Date | null; expires_at: Date | null; active: boolean }, tradeName?: string | null): DiscountRule {
  return {
    code: r.code,
    percentOff: r.percent_off === null ? null : Number(r.percent_off),
    amountOffCents: r.amount_off_cents,
    usage: r.usage,
    tradeAccountId: r.trade_account_id,
    tradeAccountName: tradeName ?? null,
    maxUses: r.max_uses,
    minOrderCents: r.min_order_cents,
    startsAt: r.starts_at,
    expiresAt: r.expires_at,
    active: r.active,
  };
}

export async function listDiscounts(tx: Tx): Promise<DiscountRow[]> {
  const rows = await tx
    .selectFrom("discounts as d")
    .leftJoin("trade_accounts as t", (j) => j.onRef("t.id", "=", "d.trade_account_id").onRef("t.tenant_id", "=", "d.tenant_id"))
    .select(["d.id", "d.code", "d.percent_off", "d.amount_off_cents", "d.usage", "d.trade_account_id", "d.max_uses", "d.min_order_cents", "d.starts_at", "d.expires_at", "d.active", "d.note", "d.created_at", "t.company"])
    .orderBy("d.created_at", "desc")
    .limit(1000)
    .execute();
  const counts = await tx
    .selectFrom("discount_redemptions")
    .select(["discount_id", sql<string>`count(*) filter (where status = 'used')`.as("used"), sql<string>`count(*) filter (where status = 'reserved' and reserved_until > now())`.as("held")])
    .where("discount_id", "is not", null)
    .groupBy("discount_id")
    .execute();
  return rows.map((r) => {
    const c = counts.find((x) => x.discount_id === r.id);
    return { ...ruleOf(r, r.company), id: r.id, note: r.note, uses: Number(c?.used ?? 0), held: Number(c?.held ?? 0), createdAt: r.created_at };
  });
}

export async function saveDiscount(tx: Tx, d: DiscountInput, id: string | null, actor: string, edition: EditionKey = "bison"): Promise<string> {
  const say = sayFor(edition);
  if (d.tradeAccountId) {
    const t = await tx.selectFrom("trade_accounts").select("id").where("id", "=", d.tradeAccountId).executeTakeFirst();
    if (!t) throw new DiscountError(say("That trade account isn't here anymore.", "That corporate account isn't here anymore."));
  }
  const offer = await tx.selectFrom("offer_codes").select("id").where("code", "=", d.code).executeTakeFirst();
  if (offer) throw new DiscountError(say(`${d.code} is already a welcome offer code. Pick another code.`, `${d.code} is already an intro offer code. Pick another code.`));
  const values = {
    code: d.code,
    percent_off: d.kind === "percent" ? d.value : null,
    amount_off_cents: d.kind === "amount" ? d.value : null,
    usage: d.usage,
    trade_account_id: d.tradeAccountId,
    max_uses: d.usage === "single_use" ? 1 : d.maxUses,
    min_order_cents: d.minOrderCents,
    starts_at: d.startsAt,
    expires_at: d.expiresAt,
    note: d.note,
    active: d.active,
  };
  try {
    if (id) {
      const row = await tx.updateTable("discounts").set(values).where("id", "=", id).returning("id").executeTakeFirst();
      if (!row) throw new DiscountError("That code isn't here anymore.");
      return row.id;
    }
    return (await tx.insertInto("discounts").values({ ...values, created_by: actor }).returning("id").executeTakeFirstOrThrow()).id;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new DiscountError(`There's already a code called ${d.code}.`);
    throw err;
  }
}

/** Deleting a code that has been used keeps the orders; the code just stops working. */
export async function deleteDiscount(tx: Tx, id: string): Promise<void> {
  await tx.deleteFrom("discounts").where("id", "=", id).execute();
}

export type CodeContext = { subtotalCents: number; email: string | null; tradeAccountId: string | null; cartId: string | null; now: Date; currency: string; timeZone: string; edition?: EditionKey };

export type CodeResult = (DiscountCheck & { code: string; discountId: string | null; offerCodeId: string | null }) | null;

/** Checks a code for this cart. Null when the cart has no code. */
export async function checkCode(tx: Tx, rawCode: string, c: CodeContext): Promise<CodeResult> {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  // Uses that count: spent, or held by a checkout that's still open. This cart's own hold doesn't count against it.
  const countUses = async (filter: { discountId?: string; offerCodeId?: string; email?: string | null; tradeAccountId?: string | null }): Promise<number> => {
    let q = tx
      .selectFrom("discount_redemptions")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where((eb) => eb.or([eb("status", "=", "used"), eb.and([eb("status", "=", "reserved"), eb("reserved_until", ">", c.now)])]));
    if (filter.discountId) q = q.where("discount_id", "=", filter.discountId);
    if (filter.offerCodeId) q = q.where("offer_code_id", "=", filter.offerCodeId);
    if (filter.email !== undefined || filter.tradeAccountId !== undefined) {
      const email = filter.email ?? null;
      const trade = filter.tradeAccountId ?? null;
      q = q.where((eb) => eb.or([...(email ? [eb("email", "=", email)] : []), ...(trade ? [eb("trade_account_id", "=", trade)] : [])]));
    }
    if (c.cartId) q = q.where((eb) => eb.or([eb("cart_id", "is", null), eb("cart_id", "!=", c.cartId!)]));
    return Number((await q.executeTakeFirstOrThrow()).n);
  };

  const d = await tx.selectFrom("discounts").selectAll().where("code", "=", code).executeTakeFirst();
  if (d) {
    const total = await countUses({ discountId: d.id });
    const byBuyer = d.usage === "per_account" && (c.email || c.tradeAccountId) ? await countUses({ discountId: d.id, email: c.email, tradeAccountId: c.tradeAccountId }) : 0;
    const r = checkDiscount(ruleOf(d), { subtotalCents: c.subtotalCents, email: c.email, tradeAccountId: c.tradeAccountId, now: c.now, usesTotal: total, usesByBuyer: byBuyer }, c.currency, c.timeZone, c.edition);
    return { ...r, code, discountId: d.id, offerCodeId: null };
  }

  const w = await tx.selectFrom("offer_codes").selectAll().where("code", "=", code).executeTakeFirst();
  if (w) {
    const held = await countUses({ offerCodeId: w.id });
    const email = c.email ?? null;
    const paid = email ? await tx.selectFrom("orders").select((eb) => eb.fn.countAll<string>().as("n")).where("email", "=", email).where("status", "!=", "canceled").executeTakeFirstOrThrow() : { n: "0" };
    const r = checkWelcomeCode({ code: w.code, email: w.email, kind: w.discount_kind, value: Number(w.discount), expiresAt: w.expires_at, redeemedAt: w.redeemed_at }, { subtotalCents: c.subtotalCents, email, now: c.now, paidOrdersForEmail: Number(paid.n), heldElsewhere: held > 0 }, c.currency, c.edition);
    return { ...r, code, discountId: null, offerCodeId: w.id };
  }
  return { ok: false, message: "That code isn't valid.", code, discountId: null, offerCodeId: null };
}

/**
 * Locks a code's row until the transaction ends, so checking how often it's
 * been used and holding a use happen as one step. Two checkouts with the same
 * single-use code wait for each other instead of both getting it.
 */
export async function lockCode(tx: Tx, rawCode: string): Promise<void> {
  const code = normalizeCode(rawCode);
  if (!code) return;
  const d = await tx.selectFrom("discounts").select("id").where("code", "=", code).forUpdate().executeTakeFirst();
  if (!d) await tx.selectFrom("offer_codes").select("id").where("code", "=", code).forUpdate().executeTakeFirst();
}

/** Holds a use of the code for this cart until the checkout ends. */
export async function holdCode(tx: Tx, r: NonNullable<CodeResult>, h: { cartId: string; email: string | null; tradeAccountId: string | null; amountCents: number; until: Date }): Promise<void> {
  if (!r.ok) return;
  await tx.updateTable("discount_redemptions").set({ status: "released" }).where("cart_id", "=", h.cartId).where("status", "=", "reserved").execute();
  await tx
    .insertInto("discount_redemptions")
    .values({ discount_id: r.discountId, offer_code_id: r.offerCodeId, code: r.code, status: "reserved", reserved_until: h.until, email: h.email, trade_account_id: h.tradeAccountId, cart_id: h.cartId, amount_cents: h.amountCents })
    .execute();
}

/**
 * The paid order spends the held use. If there's no hold left (the checkout
 * outlived it), the use is written anyway, so a paid code always counts.
 * Welcome codes are marked used on their own row too.
 */
export async function spendHeldCode(tx: Tx, cartId: string, orderId: string, paid?: { code: string | null; email: string | null; tradeAccountId: string | null; amountCents: number }): Promise<void> {
  const rows = await tx.updateTable("discount_redemptions").set({ status: "used", order_id: orderId, reserved_until: null }).where("cart_id", "=", cartId).where("status", "=", "reserved").returning(["offer_code_id"]).execute();
  let offerIds = rows.map((r) => r.offer_code_id);
  if (!rows.length && paid?.code && paid.amountCents > 0) {
    const code = normalizeCode(paid.code);
    const already = await tx.selectFrom("discount_redemptions").select("id").where("order_id", "=", orderId).executeTakeFirst();
    if (code && !already) {
      const d = await tx.selectFrom("discounts").select("id").where("code", "=", code).executeTakeFirst();
      const w = d ? undefined : await tx.selectFrom("offer_codes").select("id").where("code", "=", code).executeTakeFirst();
      if (d || w) {
        await tx.insertInto("discount_redemptions").values({ discount_id: d?.id ?? null, offer_code_id: w?.id ?? null, code, status: "used", reserved_until: null, email: paid.email, trade_account_id: paid.tradeAccountId, cart_id: cartId, order_id: orderId, amount_cents: paid.amountCents }).execute();
        offerIds = [w?.id ?? null];
      }
    }
  }
  for (const id of offerIds) if (id) await tx.updateTable("offer_codes").set({ redeemed_at: new Date(), redeemed_note: "Used at checkout" }).where("id", "=", id).where("redeemed_at", "is", null).execute();
}

export async function releaseHeldCode(tx: Tx, cartId: string): Promise<void> {
  await tx.updateTable("discount_redemptions").set({ status: "released" }).where("cart_id", "=", cartId).where("status", "=", "reserved").execute();
}

/** Holds that outlived their checkout. */
export async function releaseStaleHolds(tx: Tx, now = new Date()): Promise<number> {
  const r = await tx.updateTable("discount_redemptions").set({ status: "released" }).where("status", "=", "reserved").where("reserved_until", "<", now).executeTakeFirst();
  return Number(r.numUpdatedRows);
}
