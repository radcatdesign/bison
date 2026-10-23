// What the estimate builder sends to the server. Pure, so the builder and the
// server check it the same way.
import { z } from "zod";
import { type EditionKey, sayFor } from "@/config/editions";
import { describeIssues } from "@/lib/email/schema";
import { addressSchema } from "./settings";

export const MAX_ESTIMATE_LINES = 100;

export const estimateLineSchema = z.object({
  id: z.string().trim().min(1).max(40),
  productId: z.string().uuid().nullable().default(null),
  variantId: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1, "Every line needs a name.").max(200),
  detail: z.string().trim().max(500).default(""),
  qty: z
    .number()
    .positive("Quantities have to be more than zero.")
    .max(100_000)
    .refine((n) => Math.round(n * 100) === n * 100, "Quantities can have up to two decimals."),
  unitCents: z.number().int().min(0).max(100_000_000),
});

export const estimateInputSchema = z.object({
  title: z.string().trim().max(160).default(""),
  client: z.object({
    name: z.string().trim().max(120).default(""),
    email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Use a full email address for the client.").max(254)]).default(""),
    company: z.string().trim().max(120).default(""),
    phone: z.string().trim().max(40).default(""),
    address: addressSchema.partial().default({}),
  }),
  tradeAccountId: z.string().uuid().nullable().default(null),
  items: z.array(estimateLineSchema).max(MAX_ESTIMATE_LINES, `Up to ${MAX_ESTIMATE_LINES} lines.`).default([]),
  discount: z.union([z.object({ kind: z.literal("percent"), value: z.number().min(0).max(100) }), z.object({ kind: z.literal("amount"), value: z.number().int().min(0).max(100_000_000) }), z.object({}).strict()]).default({}),
  shippingCents: z.number().int().min(0).max(100_000_000).default(0),
  notes: z.string().trim().max(5000).default(""),
  internalNote: z.string().trim().max(5000).default(""),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
});
export type EstimateInput = z.infer<typeof estimateInputSchema>;

export class EstimateInputError extends Error {}

export function parseEstimate(input: unknown): EstimateInput {
  const r = estimateInputSchema.safeParse(input);
  if (!r.success) throw new EstimateInputError(describeIssues(r.error));
  return r.data;
}

/** What's missing before an estimate can go to the client. */
export function sendProblems(e: EstimateInput, edition: EditionKey = "bison"): string[] {
  const out: string[] = [];
  if (!e.client.email) out.push(sayFor(edition)("Add the client's email.", "Add the email of the person you're quoting."));
  if (!e.items.length) out.push("Add at least one line.");
  if (e.items.some((i) => /\[Add [^\]]+\]/.test(`${i.name} ${i.detail}`)) || /\[Add [^\]]+\]/.test(e.notes)) out.push("Fill in the yellow spots.");
  return out;
}

export const ESTIMATE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  changes_requested: "Changes requested",
  approved: "Approved",
  declined: "Declined",
  invoiced: "Invoiced",
  paid: "Paid",
  void: "Void",
};

/** Estimates the team can still change. */
export const EDITABLE = new Set(["draft", "sent", "viewed", "changes_requested", "declined"]);
