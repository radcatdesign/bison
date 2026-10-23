// Discount codes: the rule in one plain sentence, and whether a code works for
// a given order. Pure. Codes are private: Bison Ops checks them, and Stripe
// only ever sees the amount taken off.
import { z } from "zod";
import { describeIssues } from "@/lib/email/schema";
import { formatMoney, formatPercentOff, minorPerMajor, percentOf } from "./money";

export type DiscountUsage = "unlimited" | "single_use" | "per_account";

export type DiscountRule = {
  code: string;
  percentOff: number | null;
  amountOffCents: number | null;
  usage: DiscountUsage;
  /** Only this trade account can use it. */
  tradeAccountId: string | null;
  tradeAccountName?: string | null;
  maxUses: number | null;
  minOrderCents: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  active: boolean;
};

export const CODE = /^[A-Z0-9][A-Z0-9-]{2,39}$/;

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

const cents = z.number().int().min(1).max(100_000_000);

export const discountInputSchema = z
  .object({
    code: z
      .string()
      .transform(normalizeCode)
      .pipe(z.string().regex(CODE, "Codes are 3 to 40 letters, numbers or dashes, starting with a letter or number.")),
    kind: z.enum(["percent", "amount"]),
    value: z.number().positive("Enter how much it takes off."),
    usage: z.enum(["unlimited", "single_use", "per_account"]).default("unlimited"),
    tradeAccountId: z.string().uuid().nullable().default(null),
    maxUses: z.number().int().min(1).max(1_000_000).nullable().default(null),
    minOrderCents: cents.nullable().default(null),
    startsAt: z.coerce.date().nullable().default(null),
    expiresAt: z.coerce.date().nullable().default(null),
    note: z.string().trim().max(500).default(""),
    active: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.kind === "percent" && d.value > 100) ctx.addIssue({ code: "custom", message: "A percent off can't be more than 100.", path: ["value"] });
    if (d.kind === "amount" && (!Number.isInteger(d.value) || d.value > 100_000_000)) ctx.addIssue({ code: "custom", message: "Enter the amount off in cents as a whole number.", path: ["value"] });
    if (d.startsAt && d.expiresAt && d.expiresAt <= d.startsAt) ctx.addIssue({ code: "custom", message: "It has to end after it starts.", path: ["expiresAt"] });
  });
export type DiscountInput = z.infer<typeof discountInputSchema>;

export class DiscountInputError extends Error {}

export function parseDiscount(input: unknown): DiscountInput {
  const r = discountInputSchema.safeParse(input);
  if (!r.success) throw new DiscountInputError(describeIssues(r.error));
  return r.data;
}

export function ruleFromInput(d: DiscountInput, tradeAccountName?: string | null): DiscountRule {
  return {
    code: d.code,
    percentOff: d.kind === "percent" ? d.value : null,
    amountOffCents: d.kind === "amount" ? d.value : null,
    usage: d.usage,
    tradeAccountId: d.tradeAccountId,
    tradeAccountName,
    maxUses: d.maxUses,
    minOrderCents: d.minOrderCents,
    startsAt: d.startsAt,
    expiresAt: d.expiresAt,
    active: d.active,
  };
}

const dateText = (d: Date, timeZone: string) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });

/** "WELCOME10 takes 10% off orders of $50 or more. Each customer can use it once. It works until Dec 31, 2026, and stops after 100 uses." */
export function discountSentence(r: DiscountRule, currency = "usd", timeZone = "America/Los_Angeles"): string {
  const off = r.percentOff !== null ? `${formatPercentOff(r.percentOff)} off` : `${formatMoney(r.amountOffCents ?? 0, currency, { trim: true })} off`;
  const scope = r.minOrderCents ? `orders of ${formatMoney(r.minOrderCents, currency, { trim: true })} or more` : r.percentOff === 100 ? "everything in the order, including shipping" : "any order";
  const parts = [`${r.code} takes ${off} ${scope}${r.tradeAccountId ? `, for ${r.tradeAccountName || "one trade account"} only` : ""}.`];

  const who = r.tradeAccountId ? "That account" : "Each customer";
  if (r.usage === "single_use") parts.push(r.tradeAccountId ? "It works once." : "It works once, for the first person who uses it.");
  else if (r.usage === "per_account") parts.push(`${who} can use it once.`);
  else parts.push(r.tradeAccountId ? "They can use it any number of times." : "Anyone can use it, any number of times.");

  const when: string[] = [];
  if (r.startsAt) when.push(`from ${dateText(r.startsAt, timeZone)}`);
  if (r.expiresAt) when.push(`until ${dateText(r.expiresAt, timeZone)}`);
  const limit = r.maxUses && r.usage !== "single_use" ? `stops after ${r.maxUses.toLocaleString("en-US")} ${r.maxUses === 1 ? "use" : "uses"}` : "";
  if (when.length && limit) parts.push(`It works ${when.join(" ")}, and ${limit}.`);
  else if (when.length) parts.push(`It works ${when.join(" ")}.`);
  else if (limit) parts.push(`It never expires, and ${limit}.`);
  else parts.push("It never expires.");
  if (r.percentOff === 100) parts.push("Orders it covers in full ship free.");
  if (!r.active) parts.push("It's turned off right now.");
  return parts.join(" ");
}

export type DiscountContext = {
  subtotalCents: number;
  email: string | null;
  tradeAccountId: string | null;
  now: Date;
  /** Uses so far, paid or held by a checkout in progress, not counting this cart. */
  usesTotal: number;
  /** Uses by this buyer (email or trade account), not counting this cart. */
  usesByBuyer: number;
};

export type DiscountCheck = { ok: true; amountCents: number; freeShipping: boolean; label: string } | { ok: false; message: string };

/** Whether a code works for this order, and what it takes off. Messages are written for the shopper. */
export function checkDiscount(r: DiscountRule, c: DiscountContext, currency = "usd", timeZone = "America/Los_Angeles"): DiscountCheck {
  if (!r.active) return { ok: false, message: "That code isn't valid." };
  if (r.startsAt && c.now < r.startsAt) return { ok: false, message: `That code starts on ${dateText(r.startsAt, timeZone)}.` };
  if (r.expiresAt && c.now >= r.expiresAt) return { ok: false, message: "That code has expired." };
  if (r.tradeAccountId && r.tradeAccountId !== c.tradeAccountId) return { ok: false, message: "That code is for a trade account. Sign in to your trade account to use it." };
  if (r.usage === "single_use" && c.usesTotal >= 1) return { ok: false, message: "That code has already been used." };
  if (r.maxUses && c.usesTotal >= r.maxUses) return { ok: false, message: "That code has been used as many times as it can be." };
  if (r.usage === "per_account" && c.usesByBuyer >= 1) return { ok: false, message: "You've already used that code." };
  if (r.minOrderCents && c.subtotalCents < r.minOrderCents) return { ok: false, message: `Add ${formatMoney(r.minOrderCents - c.subtotalCents, currency)} more to use that code. It's for orders of ${formatMoney(r.minOrderCents, currency, { trim: true })} or more.` };
  const amountCents = r.percentOff !== null ? percentOf(c.subtotalCents, r.percentOff) : Math.min(c.subtotalCents, r.amountOffCents ?? 0);
  const label = r.percentOff !== null ? `${r.code}, ${formatPercentOff(r.percentOff)} off` : `${r.code}, ${formatMoney(r.amountOffCents ?? 0, currency, { trim: true })} off`;
  return { ok: true, amountCents, freeShipping: c.subtotalCents > 0 && amountCents >= c.subtotalCents, label };
}

/** A welcome code from Marketing: one per signup, for that person's first order only. */
export type WelcomeCode = { code: string; email: string; kind: "percent" | "amount"; value: number; expiresAt: Date | null; redeemedAt: Date | null };

export function checkWelcomeCode(w: WelcomeCode, c: { subtotalCents: number; email: string | null; now: Date; paidOrdersForEmail: number; heldElsewhere: boolean }, currency = "usd"): DiscountCheck {
  if (w.redeemedAt || c.heldElsewhere) return { ok: false, message: "That code has already been used." };
  if (w.expiresAt && c.now >= w.expiresAt) return { ok: false, message: "That code has expired." };
  if (c.email && c.email !== w.email) return { ok: false, message: "That welcome code works with the email address it was sent to." };
  if (c.paidOrdersForEmail > 0) return { ok: false, message: "Welcome codes are for a first order." };
  const value = Number(w.value);
  // Welcome offers are set in whole currency units, like $15.
  const off = Math.round(value * minorPerMajor(currency));
  const amountCents = w.kind === "percent" ? percentOf(c.subtotalCents, value) : Math.min(c.subtotalCents, off);
  const label = w.kind === "percent" ? `${w.code}, ${formatPercentOff(value)} off` : `${w.code}, ${formatMoney(off, currency, { trim: true })} off`;
  return { ok: true, amountCents, freeShipping: c.subtotalCents > 0 && amountCents >= c.subtotalCents, label };
}
