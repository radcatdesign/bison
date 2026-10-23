// An email is a small JSON document: a list of typed sections plus a couple of
// settings. Newsletters, series steps and saved templates all use it, the
// builder edits it, and the renderer turns it into email-safe HTML. Everything
// coming in is checked against these schemas first. Works in the browser too.
import { z } from "zod";

export const EMAIL_DOC_VERSION = 1;
export const MAX_EMAIL_SECTIONS = 30;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Colors look like #3b5bff.")
  .transform((c) => c.toLowerCase());

/** Links in emails: web pages, email and phone. Nothing else. */
export const EMAIL_HREF = /^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:[+\d\s().-]{3,30})$/i;
const href = z.string().trim().max(500).regex(EMAIL_HREF, "Use a full web address (https://...), an email (mailto:) or a phone number (tel:).");

export const emailButtonSchema = z.object({ label: text(50), href });
export type EmailButton = z.infer<typeof emailButtonSchema>;

/**
 * An image: one of the company's uploads (/f/<id>), any https image, or, in the
 * demo only, an inline picture kept in the visitor's browser.
 */
export const IMAGE_SRC = /^(\/f\/[0-9a-f-]{36}|https:\/\/[^\s<>"']+|data:image\/(png|jpeg|gif);base64,[A-Za-z0-9+/=]+)$/;
export const emailImageSchema = z.object({
  src: z.string().max(700_000).regex(IMAGE_SRC, "That image address can't be used in an email."),
  width: z.number().int().min(1).max(4000),
  height: z.number().int().min(1).max(8000),
});
export type EmailImage = z.infer<typeof emailImageSchema>;

const id = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, "Section ids are lowercase letters, numbers and dashes.");

export const textSectionSchema = z.object({
  id,
  type: z.literal("text"),
  heading: optionalText(150),
  body: z.string().trim().max(5000).default(""),
  align: z.enum(["left", "center"]).default("left"),
});

export const photoSectionSchema = z.object({
  id,
  type: z.literal("photo"),
  image: emailImageSchema.nullable().default(null),
  alt: z.string().trim().max(200).default(""),
  caption: optionalText(200),
  href: href.optional(),
  width: z.enum(["full", "inset"]).default("inset"),
});

export const photoTextSectionSchema = z.object({
  id,
  type: z.literal("photo-text"),
  image: emailImageSchema.nullable().default(null),
  alt: z.string().trim().max(200).default(""),
  heading: optionalText(150),
  body: z.string().trim().max(2000).default(""),
  side: z.enum(["left", "right"]).default("left"),
  button: emailButtonSchema.optional(),
});

export const headerPhotoSectionSchema = z.object({
  id,
  type: z.literal("header-photo"),
  image: emailImageSchema.nullable().default(null),
  alt: z.string().trim().max(200).default(""),
  heading: optionalText(150),
  body: optionalText(1000),
});

export const cardSchema = z.object({
  image: emailImageSchema.nullable().default(null),
  alt: z.string().trim().max(200).default(""),
  heading: text(100),
  body: optionalText(500),
  button: emailButtonSchema.optional(),
});
export type EmailCard = z.infer<typeof cardSchema>;

export const cardsSectionSchema = z.object({
  id,
  type: z.literal("cards"),
  columns: z.union([z.literal(2), z.literal(3)]).default(2),
  cards: z.array(cardSchema).min(2).max(6),
});

export const buttonSectionSchema = z.object({
  id,
  type: z.literal("button"),
  label: text(50),
  href,
  align: z.enum(["left", "center"]).default("left"),
  style: z.enum(["solid", "outline"]).default("solid"),
});

export const highlightSectionSchema = z.object({
  id,
  type: z.literal("highlight"),
  heading: optionalText(150),
  body: z.string().trim().max(2000).default(""),
  button: emailButtonSchema.optional(),
});

export const dividerSectionSchema = z.object({
  id,
  type: z.literal("divider"),
  style: z.enum(["line", "space"]).default("line"),
});

/** The welcome offer's code, for people who have one. Left out of the email for everyone else. */
export const offerSectionSchema = z.object({
  id,
  type: z.literal("offer"),
  heading: text(150),
  body: optionalText(600),
});

export const emailSectionSchema = z.discriminatedUnion("type", [
  textSectionSchema,
  photoSectionSchema,
  photoTextSectionSchema,
  headerPhotoSectionSchema,
  cardsSectionSchema,
  buttonSectionSchema,
  highlightSectionSchema,
  dividerSectionSchema,
  offerSectionSchema,
]);
export type EmailSection = z.infer<typeof emailSectionSchema>;
export type EmailSectionType = EmailSection["type"];
export type EmailSectionOf<T extends EmailSectionType> = Extract<EmailSection, { type: T }>;

export const EMAIL_SECTION_TYPES = ["text", "photo", "photo-text", "header-photo", "cards", "button", "highlight", "divider", "offer"] as const satisfies readonly EmailSectionType[];

export const EMAIL_SECTION_LABELS: Record<EmailSectionType, string> = {
  text: "Text",
  photo: "Photo",
  "photo-text": "Photo and text",
  "header-photo": "Header photo",
  cards: "Cards",
  button: "Button",
  highlight: "Highlight box",
  divider: "Divider",
  offer: "Welcome offer code",
};

export const EMAIL_SECTION_NOTES: Record<EmailSectionType, string> = {
  text: "A heading and paragraphs",
  photo: "One photo, with an optional link",
  "photo-text": "A photo beside text; stacks on phones",
  "header-photo": "A wide photo with a heading under it",
  cards: "Two or three side by side, with photos",
  button: "One clear next step",
  highlight: "A tinted box for the thing not to miss",
  divider: "A line or some space",
  offer: "Shows each new subscriber their own code",
};

export const emailDocSchema = z
  .object({
    version: z.literal(EMAIL_DOC_VERSION),
    sections: z.array(emailSectionSchema).max(MAX_EMAIL_SECTIONS, `An email can have up to ${MAX_EMAIL_SECTIONS} sections.`),
    /** Show the brand kit's sign-off at the end. */
    signOff: z.boolean().default(true),
    /** What {first name} becomes when there's no name on file. */
    fallbackName: z.string().trim().max(40).default("there"),
  })
  .superRefine((doc, ctx) => {
    const seen = new Set<string>();
    doc.sections.forEach((s, i) => {
      if (seen.has(s.id)) ctx.addIssue({ code: "custom", path: ["sections", i, "id"], message: `Two sections share the id "${s.id}".` });
      seen.add(s.id);
    });
  });
export type EmailDoc = z.infer<typeof emailDocSchema>;

export class EmailDocError extends Error {}

export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 4)
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join(" ");
}

export function parseEmailDoc(input: unknown): EmailDoc {
  const result = emailDocSchema.safeParse(input);
  if (!result.success) throw new EmailDocError(describeIssues(result.error));
  return result.data;
}

export function emptyEmailDoc(): EmailDoc {
  return { version: EMAIL_DOC_VERSION, sections: [], signOff: true, fallbackName: "there" };
}

/** Pictures kept in a demo visitor's browser can't go out in real email. */
export function hasInlineImages(doc: EmailDoc): boolean {
  const walk = (v: unknown): boolean =>
    typeof v === "string" ? v.startsWith("data:") : Array.isArray(v) ? v.some(walk) : v && typeof v === "object" ? Object.values(v).some(walk) : false;
  return walk(doc.sections);
}

/** Every upload an email uses, so they can be checked as the company's own. */
export function fileIdsIn(doc: EmailDoc): string[] {
  const ids = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      const m = /^\/f\/([0-9a-f-]{36})$/.exec(v);
      if (m) ids.add(m[1]);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(doc.sections);
  return [...ids];
}

// ---- Placeholders ------------------------------------------------------------
// Same rule as pages: [Add ...] marks something only the company knows, and an
// email can't go out while any are left.

const PLACEHOLDER = /\[Add [^\]]{1,80}\]/g;

export function findEmailPlaceholders(doc: EmailDoc, subject = ""): { sectionId: string | null; text: string }[] {
  const found: { sectionId: string | null; text: string }[] = [];
  for (const m of subject.matchAll(PLACEHOLDER)) found.push({ sectionId: null, text: m[0] });
  const walk = (sectionId: string, value: unknown) => {
    if (typeof value === "string") {
      if (value.startsWith("data:")) return;
      for (const m of value.matchAll(PLACEHOLDER)) found.push({ sectionId, text: m[0] });
    } else if (Array.isArray(value)) value.forEach((v) => walk(sectionId, v));
    else if (value && typeof value === "object") Object.values(value).forEach((v) => walk(sectionId, v));
  };
  for (const s of doc.sections) walk(s.id, s);
  return found;
}

// ---- Brand kit ------------------------------------------------------------------

/** Fonts every email app has. Each is a full stack so there's always a close match. */
export const EMAIL_FONTS = {
  arial: { label: "Arial", stack: "Arial, Helvetica, sans-serif" },
  helvetica: { label: "Helvetica", stack: "Helvetica, Arial, sans-serif" },
  verdana: { label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  tahoma: { label: "Tahoma", stack: "Tahoma, Verdana, Segoe, sans-serif" },
  trebuchet: { label: "Trebuchet MS", stack: "'Trebuchet MS', 'Lucida Grande', Tahoma, sans-serif" },
  georgia: { label: "Georgia", stack: "Georgia, 'Times New Roman', Times, serif" },
  palatino: { label: "Palatino", stack: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif" },
  times: { label: "Times New Roman", stack: "'Times New Roman', Times, serif" },
  courier: { label: "Courier New", stack: "'Courier New', Courier, monospace" },
} as const;
export type EmailFont = keyof typeof EMAIL_FONTS;
const fontKey = z.enum(Object.keys(EMAIL_FONTS) as [EmailFont, ...EmailFont[]]);

export const BRAND_COLOR_KEYS = ["accent", "buttonText", "headings", "text", "smallPrint", "headerBar", "headerText", "background", "body", "highlight", "lines"] as const;
export type BrandColorKey = (typeof BRAND_COLOR_KEYS)[number];

export const BRAND_COLOR_LABELS: Record<BrandColorKey, { label: string; note: string }> = {
  accent: { label: "Accent", note: "Buttons and links" },
  buttonText: { label: "Button text", note: "Words on buttons" },
  headings: { label: "Headings", note: "Section headings" },
  text: { label: "Text", note: "Paragraphs" },
  smallPrint: { label: "Small print", note: "The footer and captions" },
  headerBar: { label: "Header bar", note: "Behind your logo" },
  headerText: { label: "Header text", note: "Your name when there's no logo" },
  background: { label: "Background", note: "Around the email" },
  body: { label: "Email", note: "Behind the content" },
  highlight: { label: "Highlight box", note: "Tinted boxes and codes" },
  lines: { label: "Lines", note: "Dividers and borders" },
};

export const brandKitSchema = z.object({
  businessName: text(80),
  /** The name people see in their inbox. */
  fromName: text(80),
  logo: emailImageSchema.nullable().default(null),
  logoWidth: z.number().int().min(40).max(280).default(140),
  headerAlign: z.enum(["left", "center"]).default("left"),
  colors: z.object(Object.fromEntries(BRAND_COLOR_KEYS.map((k) => [k, hex])) as Record<BrandColorKey, typeof hex>),
  fonts: z.object({ headings: fontKey, body: fontKey }),
  buttonShape: z.enum(["square", "rounded", "pill"]).default("rounded"),
  signOff: z.string().trim().max(300).default(""),
  /** The postal address every marketing email must show. Sending waits until it's filled in. */
  address: z.string().trim().max(300).default(""),
  footerNote: z.string().trim().max(300).default(""),
  replyTo: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(254)]).default(""),
});
export type BrandKit = z.infer<typeof brandKitSchema>;

export function defaultBrandKit(businessName: string, accent = "#3b5bff", domain?: string): BrandKit {
  const name = businessName.trim().slice(0, 80) || "Your company";
  return {
    businessName: name,
    fromName: name,
    logo: null,
    logoWidth: 140,
    headerAlign: "left",
    colors: {
      accent: accent.toLowerCase(),
      buttonText: "#ffffff",
      headings: "#14161a",
      text: "#33373d",
      smallPrint: "#7a8089",
      headerBar: "#ffffff",
      headerText: "#14161a",
      background: "#f2f3f5",
      body: "#ffffff",
      highlight: "#f4f6fb",
      lines: "#e3e6ea",
    },
    fonts: { headings: "helvetica", body: "helvetica" },
    buttonShape: "rounded",
    signOff: `Thanks,\nThe ${name} team`,
    address: "",
    footerNote: domain ? `You're getting this because you signed up at ${domain}.` : "You're getting this because you signed up with us.",
    replyTo: "",
  };
}

/** Reads a stored brand kit, filling anything missing or broken from the defaults. */
export function readBrandKit(stored: unknown, fallback: BrandKit): BrandKit {
  if (!stored || typeof stored !== "object" || Object.keys(stored).length === 0) return fallback;
  const raw = stored as Record<string, unknown>;
  const merged = { ...fallback, ...raw, colors: { ...fallback.colors, ...(raw.colors as object) }, fonts: { ...fallback.fonts, ...(raw.fonts as object) } };
  const parsed = brandKitSchema.safeParse(merged);
  return parsed.success ? parsed.data : fallback;
}

export class BrandKitError extends Error {}

export function parseBrandKit(input: unknown): BrandKit {
  const result = brandKitSchema.safeParse(input);
  if (!result.success) throw new BrandKitError(describeIssues(result.error));
  return result.data;
}

// ---- Merge tags ------------------------------------------------------------------

export const MERGE_TAGS = [
  { tag: "{first name}", note: "Their first name, or the fallback you set" },
  { tag: "{business name}", note: "Your business name from the brand kit" },
] as const;

export function firstNameOf(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first && !first.includes("@") ? first.slice(0, 40) : null;
}
