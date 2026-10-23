// A landing page is a small JSON document: a theme, search details and a list
// of sections. The editor, the agent and the public page all share this shape,
// and everything that comes in (from the browser or from the agent) is checked
// against it before it's saved or shown. Works in the browser and on the server.
import { z } from "zod";

export const PAGE_DOC_VERSION = 1;
export const MAX_SECTIONS = 16;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();

/**
 * Links a page may use: web pages, email, phone, or a section on the same page.
 * Anything else (javascript:, data:, relative paths) is refused.
 */
export const SAFE_HREF = /^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:[+\d\s().-]{3,30}|#[a-z0-9][a-z0-9-]{0,39})$/i;

export const ctaSchema = z.object({
  label: text(40),
  href: z.string().trim().max(300).regex(SAFE_HREF, "Use a web address, an email (mailto:), a phone number (tel:) or a section like #form."),
});
export type Cta = z.infer<typeof ctaSchema>;

const sectionId = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, "Section ids are lowercase letters, numbers and dashes.");

/** "kind" is the "I am a..." question, with the choices set in Marketing > Subscribers. */
export const FORM_FIELDS = ["name", "email", "phone", "company", "message", "kind"] as const;
export type FormField = (typeof FORM_FIELDS)[number];

export const heroSchema = z.object({
  id: sectionId,
  type: z.literal("hero"),
  eyebrow: optionalText(60),
  headline: text(120),
  body: optionalText(400),
  primary: ctaSchema.optional(),
  secondary: ctaSchema.optional(),
  align: z.enum(["left", "center"]).default("left"),
  art: z.enum(["glow", "grid", "orbs", "none"]).default("glow"),
});

const item = z.object({ title: text(80), body: text(280) });

export const featuresSchema = z.object({
  id: sectionId,
  type: z.literal("features"),
  heading: optionalText(100),
  intro: optionalText(300),
  items: z.array(item).min(1).max(6),
});

export const stepsSchema = z.object({
  id: sectionId,
  type: z.literal("steps"),
  heading: optionalText(100),
  items: z.array(item).min(2).max(6),
});

export const statsSchema = z.object({
  id: sectionId,
  type: z.literal("stats"),
  heading: optionalText(100),
  items: z.array(z.object({ value: text(20), label: text(60) })).min(2).max(4),
});

export const quoteSchema = z.object({
  id: sectionId,
  type: z.literal("quote"),
  quote: text(400),
  name: text(80),
  role: optionalText(80),
});

export const offerSchema = z.object({
  id: sectionId,
  type: z.literal("offer"),
  heading: text(100),
  price: optionalText(30),
  note: optionalText(160),
  bullets: z.array(text(120)).max(8).default([]),
  cta: ctaSchema.optional(),
});

export const faqSchema = z.object({
  id: sectionId,
  type: z.literal("faq"),
  heading: optionalText(100),
  items: z.array(z.object({ q: text(160), a: text(600) })).min(1).max(10),
});

export const formSchema = z.object({
  id: sectionId,
  type: z.literal("form"),
  heading: text(100),
  body: optionalText(300),
  fields: z
    .array(z.enum(FORM_FIELDS))
    .min(1)
    .max(6)
    .refine((f) => f.includes("email"), "A form needs an email field so you can reply.")
    .refine((f) => new Set(f).size === f.length, "Each field can only appear once."),
  submit: text(40),
  success: text(200),
  /** Also adds people who send it to the email list (with Marketing). */
  subscribe: z.boolean().optional(),
});

export const ctaSectionSchema = z.object({
  id: sectionId,
  type: z.literal("cta"),
  headline: text(120),
  body: optionalText(240),
  cta: ctaSchema,
});

export const textSchema = z.object({
  id: sectionId,
  type: z.literal("text"),
  heading: optionalText(100),
  body: text(2000),
});

export const sectionSchema = z.discriminatedUnion("type", [
  heroSchema,
  featuresSchema,
  stepsSchema,
  statsSchema,
  quoteSchema,
  offerSchema,
  faqSchema,
  formSchema,
  ctaSectionSchema,
  textSchema,
]);
export type Section = z.infer<typeof sectionSchema>;
export type SectionType = Section["type"];
export type SectionOf<T extends SectionType> = Extract<Section, { type: T }>;

export const SECTION_TYPES = ["hero", "features", "steps", "stats", "quote", "offer", "faq", "form", "cta", "text"] as const satisfies readonly SectionType[];

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero",
  features: "Features",
  steps: "Steps",
  stats: "Numbers",
  quote: "Customer quote",
  offer: "Offer",
  faq: "Questions",
  form: "Form",
  cta: "Call to action",
  text: "Text",
};

export const themeSchema = z.object({
  mode: z.enum(["light", "dark"]).default("light"),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Colors look like #3b5bff.")
    .transform((c) => c.toLowerCase())
    .default("#3b5bff"),
  font: z.enum(["modern", "editorial", "technical"]).default("modern"),
  corners: z.enum(["soft", "sharp", "round"]).default("soft"),
});
export type PageTheme = z.infer<typeof themeSchema>;

export const pageDocSchema = z
  .object({
    version: z.literal(PAGE_DOC_VERSION),
    theme: themeSchema,
    seo: z.object({ title: z.string().trim().max(70).default(""), description: z.string().trim().max(160).default("") }),
    sections: z.array(sectionSchema).max(MAX_SECTIONS, `A page can have up to ${MAX_SECTIONS} sections.`),
  })
  .superRefine((doc, ctx) => {
    const seen = new Set<string>();
    doc.sections.forEach((s, i) => {
      if (seen.has(s.id)) ctx.addIssue({ code: "custom", path: ["sections", i, "id"], message: `Two sections share the id "${s.id}".` });
      seen.add(s.id);
    });
  });
export type PageDoc = z.infer<typeof pageDocSchema>;

export class PageDocError extends Error {}

/** Checks a page from the browser or the agent. Throws PageDocError with a plain message. */
export function parsePageDoc(input: unknown): PageDoc {
  const result = pageDocSchema.safeParse(input);
  if (!result.success) throw new PageDocError(describeIssues(result.error));
  return result.data;
}

export function parseSection(input: unknown): Section {
  const result = sectionSchema.safeParse(input);
  if (!result.success) throw new PageDocError(describeIssues(result.error));
  return result.data;
}

export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 4)
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join(" ");
}

export function emptyPageDoc(accent = "#3b5bff"): PageDoc {
  return { version: PAGE_DOC_VERSION, theme: { mode: "light", accent, font: "modern", corners: "soft" }, seo: { title: "", description: "" }, sections: [] };
}

// ---- Placeholders ------------------------------------------------------------
// The agent never invents quotes, reviews or numbers. It writes [Add ...] instead,
// and a page can't be published while any are left.

export const PLACEHOLDER = /\[Add [^\]]{1,80}\]/g;

export function findPlaceholders(doc: PageDoc): { sectionId: string; text: string }[] {
  const found: { sectionId: string; text: string }[] = [];
  const walk = (sectionId: string, value: unknown) => {
    if (typeof value === "string") {
      for (const m of value.matchAll(PLACEHOLDER)) found.push({ sectionId, text: m[0] });
    } else if (Array.isArray(value)) value.forEach((v) => walk(sectionId, v));
    else if (value && typeof value === "object") Object.values(value).forEach((v) => walk(sectionId, v));
  };
  for (const s of doc.sections) walk(s.id, s);
  return found;
}

// ---- Slugs ---------------------------------------------------------------------

export function slugifyPage(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "page"
  );
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A short page name from a brief: "A spring sale page for glow aggregate, 15% off" becomes "Spring sale: glow aggregate". */
export function titleFromBrief(brief: string): string {
  let t = brief.split(/[.!?\n,;]/)[0].trim();
  t = t.replace(/^(please\s+)?(build|make|create|draft|design)\s+(me\s+)?/i, "");
  t = t.replace(/^(a|an|the|our|my)\s+/i, "");
  t = t.replace(/\s*\b(landing\s+)?page\s+(for|about|to|on)\s+(our|the|a|an|my)?\s*/i, ": ");
  t = t.replace(/\s*\b(landing\s+)?page\b\s*/i, " ").replace(/\s{2,}/g, " ").replace(/^:\s*/, "").trim();
  t = t.length > 60 ? `${t.slice(0, 60).replace(/\s+\S*$/, "")}` : t;
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Untitled page";
}
