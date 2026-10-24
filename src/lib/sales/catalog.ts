// Products and their variants as the editor and imports hand them in. Pure:
// validation, slugs, option combinations. The database layer is products.ts.
// For a Fit Funnels club these are memberships, packs and gear, and the
// messages say so.
import { z } from "zod";
import { type EditionKey, type Say, sayFor } from "@/config/editions";
import { describeIssues } from "@/lib/email/schema";

export const MAX_OPTIONS = 3;
export const MAX_VALUES = 30;
export const MAX_VARIANTS = 100;
export const MAX_PHOTOS = 12;

/** One of this company's uploads, or any https image (imports keep their image addresses). */
export const PHOTO_SRC = /^(\/f\/[0-9a-f-]{36}|https:\/\/[^\s<>"']{4,1000})$/;

const optionSchemaFor = (say: Say) =>
  z.object({
    name: z.string().trim().min(1, say("Name each option, like Size or Color.", "Name each option, like Plan or Classes.")).max(40),
    values: z
      .array(z.string().trim().min(1).max(60))
      .min(1, "Give each option at least one choice.")
      .max(MAX_VALUES)
      .refine((v) => new Set(v.map((x) => x.toLowerCase())).size === v.length, "Each choice can only be listed once."),
  });
export type ProductOption = z.infer<ReturnType<typeof optionSchemaFor>>;

const photoSchema = z.object({
  src: z.string().trim().regex(PHOTO_SRC, "Use an uploaded photo or a full https:// image address."),
  alt: z.string().trim().max(200).default(""),
});
export type ProductPhoto = z.infer<typeof photoSchema>;

const cents = z.number().int().min(0).max(100_000_000);

export const variantInputSchema = z.object({
  id: z.string().uuid().optional(),
  options: z.record(z.string(), z.string()).default({}),
  sku: z.string().trim().max(64).default(""),
  priceCents: cents,
  compareAtCents: cents.nullable().default(null),
  weightOz: z.number().min(0).max(160_000).default(0),
  box: z
    .string()
    .regex(/^[a-z0-9-]{0,40}$/)
    .default(""),
  unitsPerBox: z.number().int().min(1).max(1000).default(1),
  shipsAlone: z.boolean().default(false),
  flatShipCents: cents.nullable().default(null),
  active: z.boolean().default(true),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const productSchemaFor = (say: Say) =>
  z
    .object({
      name: z.string().trim().min(1, say("Give the product a name.", "Give it a name.")).max(160),
      slug: z.string().trim().max(80).regex(SLUG, "Use lowercase letters, numbers and single dashes.").optional(),
      description: z.string().trim().max(20_000).default(""),
      status: z.enum(["active", "draft", "archived"]).default("draft"),
      category: z.string().trim().max(80).default(""),
      taxCode: z
        .string()
        .trim()
        .regex(/^(txcd_[0-9]{8})?$/, "Stripe tax codes look like txcd_99999999.")
        .default(""),
      options: z
        .array(optionSchemaFor(say))
        .max(MAX_OPTIONS, `Up to ${MAX_OPTIONS} options.`)
        .default([])
        .refine((o) => new Set(o.map((x) => x.name.toLowerCase())).size === o.length, "Each option needs its own name."),
      photos: z.array(photoSchema).max(MAX_PHOTOS, `Up to ${MAX_PHOTOS} photos.`).default([]),
      seo: z.object({ title: z.string().trim().max(70).default(""), description: z.string().trim().max(170).default("") }).default({ title: "", description: "" }),
      variants: z.array(variantInputSchema).min(1, say("A product needs a price.", "It needs a price.")).max(MAX_VARIANTS, say(`Up to ${MAX_VARIANTS} variants.`, `Up to ${MAX_VARIANTS} prices.`)),
    })
    .superRefine((p, ctx) => {
      if (!p.options.length && p.variants.length > 1) ctx.addIssue({ code: "custom", message: say("Add an option (like Size) to sell more than one version.", "Add an option (like Plan) to sell it at more than one price."), path: ["variants"] });
      const seen = new Set<string>();
      for (const [i, v] of p.variants.entries()) {
        for (const o of p.options) {
          const chosen = v.options[o.name];
          if (chosen === undefined || !o.values.includes(chosen)) ctx.addIssue({ code: "custom", message: say(`Pick a ${o.name} for every version.`, `Pick a ${o.name} for every price.`), path: ["variants", i, "options"] });
        }
        if (Object.keys(v.options).some((k) => !p.options.some((o) => o.name === k))) ctx.addIssue({ code: "custom", message: say("A version names an option the product doesn't have.", "A price names an option this one doesn't have."), path: ["variants", i, "options"] });
        const sig = variantKey(v.options, p.options);
        if (seen.has(sig)) ctx.addIssue({ code: "custom", message: say("Two versions have the same choices.", "Two prices have the same choices."), path: ["variants", i, "options"] });
        seen.add(sig);
        if (v.compareAtCents !== null && v.compareAtCents <= v.priceCents) ctx.addIssue({ code: "custom", message: "The was price should be higher than the price, or empty.", path: ["variants", i, "compareAtCents"] });
      }
      const skus = p.variants.map((v) => v.sku.toLowerCase()).filter(Boolean);
      if (new Set(skus).size !== skus.length) ctx.addIssue({ code: "custom", message: "Each SKU can only be used once.", path: ["variants"] });
    });
export const productInputSchema = productSchemaFor(sayFor("bison"));
const FIT_PRODUCT_SCHEMA = productSchemaFor(sayFor("fit"));
export type ProductInput = z.infer<typeof productInputSchema>;

export class ProductInputError extends Error {}

export function parseProduct(input: unknown, edition: EditionKey = "bison"): ProductInput {
  const r = (edition === "fit" ? FIT_PRODUCT_SCHEMA : productInputSchema).safeParse(input);
  if (!r.success) throw new ProductInputError(describeIssues(r.error));
  return r.data;
}

/** A stable key for a variant's choices, in the product's option order. */
export function variantKey(options: Record<string, string>, productOptions: ProductOption[]): string {
  return productOptions.map((o) => `${o.name}=${options[o.name] ?? ""}`).join("|");
}

/** "50 lb / Blue". Empty for a product without options. */
export function variantLabel(options: Record<string, string>, productOptions: { name: string }[]): string {
  return productOptions
    .map((o) => options[o.name])
    .filter(Boolean)
    .join(" / ");
}

/** Every combination of the product's options, keeping prices and details of versions that already exist. */
export function expandVariants(options: ProductOption[], existing: VariantInput[], base: Partial<VariantInput> = {}): VariantInput[] {
  const combos: Record<string, string>[] = options.reduce<Record<string, string>[]>((acc, o) => acc.flatMap((c) => o.values.map((v) => ({ ...c, [o.name]: v }))), [{}]);
  const template = existing[0] ?? variantInputSchema.parse({ priceCents: 0, ...base });
  return combos.slice(0, MAX_VARIANTS).map((combo) => {
    const match = existing.find((v) => variantKey(v.options, options) === variantKey(combo, options));
    return match ? { ...match, options: combo } : { ...template, id: undefined, sku: "", options: combo };
  });
}

export function slugify(input: string): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/, "") || "product"
  );
}

/** The lowest and highest price across active versions, for "From $24". */
export function priceRange(variants: { priceCents: number; active: boolean }[]): { min: number; max: number } | null {
  const prices = variants.filter((v) => v.active).map((v) => v.priceCents);
  return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
}

/** Description text as paragraphs and bullet lists. Plain text in, plain blocks out (the page escapes them). */
export type DescriptionBlock = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

export function descriptionBlocks(text: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  for (const chunk of text.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => /^[-*•]\s+/.test(l))) blocks.push({ kind: "ul", items: lines.map((l) => l.replace(/^[-*•]\s+/, "")) });
    else blocks.push({ kind: "p", text: lines.join(" ") });
  }
  return blocks;
}

/** A plain-text summary of the description for search results and social cards. */
export function descriptionSummary(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").replace(/^[-*•]\s+/, "").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 60 ? cut.lastIndexOf(" ") : cut.length)}…`;
}
