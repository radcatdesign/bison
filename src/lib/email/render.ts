// Turns an email document and a brand kit into the HTML and plain text that
// actually go out. Table layout, inline styles and email-safe fonts, so it
// holds up in Gmail, Apple Mail and Outlook. Columns sit side by side on wide
// screens and stack on phones without needing media query support.
//
// Pure string building, no React, so the same code renders in the builder's
// preview, in the send job and in tests. Every bit of text is escaped here.
import { type BrandKit, EMAIL_FONTS, type EmailCard, type EmailDoc, type EmailImage, type EmailSection, type EmailSectionOf, firstNameOf } from "./schema";

export type RenderOptions = {
  doc: EmailDoc;
  brand: BrandKit;
  subject: string;
  preheader?: string;
  /** Who it's for. Left out in previews, where {first name} shows the fallback. */
  person?: { name?: string | null; email?: string } | null;
  /** This person's welcome offer code. Offer sections are left out without one. */
  offer?: { code: string; terms: string } | null;
  /** The one-click unsubscribe page for this send. */
  unsubscribeUrl?: string | null;
  /** Where /f/ uploads are served from, for absolute image addresses. */
  baseUrl: string;
  /** The builder's canvas: marks sections for selection and shows what's missing. */
  builder?: { selectedId: string | null; sampleCode?: string; outlines?: boolean } | null;
  /** Adds utm tags to links that point at these hosts, so visits from email show up in Analytics. */
  utm?: { source: string; campaign: string; hosts: string[] } | null;
};

export type RenderedEmail = { html: string; text: string };

const WIDTH = 600;
const PAD = 32;
const INNER = WIDTH - PAD * 2;

// ---- Escaping -------------------------------------------------------------------

export function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const PLACEHOLDER = /\[Add [^\]]{1,80}\]/g;
const INLINE = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)|\*\*([^*\n]{1,500})\*\*|\{(first name|business name)\}/gi;
const SAFE_LINK = /^(https?:\/\/|mailto:|tel:)/i;

type Ctx = {
  o: RenderOptions;
  brand: BrandKit;
  firstName: string;
  head: string;
  body: string;
  radius: number;
  builder: boolean;
};

function tagged(url: string, ctx: Ctx): string {
  const utm = ctx.o.utm;
  if (!utm || !/^https?:/i.test(url)) return url;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (!utm.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return url;
    if (!u.searchParams.has("utm_source")) u.searchParams.set("utm_source", utm.source);
    if (!u.searchParams.has("utm_medium")) u.searchParams.set("utm_medium", "email");
    if (!u.searchParams.has("utm_campaign")) u.searchParams.set("utm_campaign", utm.campaign);
    return u.toString();
  } catch {
    return url;
  }
}

function merge(name: string, ctx: Ctx): string {
  return name.toLowerCase() === "first name" ? ctx.firstName : ctx.brand.businessName;
}

/** Escapes plain text; in the builder, unfilled [Add ...] placeholders are marked yellow. */
function plain(text: string, ctx: Ctx): string {
  if (!ctx.builder) return esc(text);
  let out = "";
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    out += esc(text.slice(last, m.index));
    out += `<mark style="background-color:#ffe58a;color:#4a3b00;padding:0 2px;border-radius:3px;">${esc(m[0])}</mark>`;
    last = (m.index ?? 0) + m[0].length;
  }
  return out + esc(text.slice(last));
}

/** **bold**, [links](https://...) and merge tags, in one line of text. */
function inline(text: string, ctx: Ctx, linkColor: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    out += plain(text.slice(last, m.index), ctx);
    last = (m.index ?? 0) + m[0].length;
    if (m[1] !== undefined) {
      const url = m[2];
      if (SAFE_LINK.test(url)) out += `<a href="${esc(tagged(url, ctx))}" target="_blank" style="color:${linkColor};text-decoration:underline;">${inline(m[1], ctx, linkColor)}</a>`;
      else out += plain(m[0], ctx);
    } else if (m[3] !== undefined) {
      out += `<strong>${inline(m[3], ctx, linkColor)}</strong>`;
    } else if (m[4] !== undefined) {
      out += esc(merge(m[4], ctx));
    }
  }
  return out + plain(text.slice(last), ctx);
}

function inlineText(text: string, ctx: Ctx): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    out += text.slice(last, m.index);
    last = (m.index ?? 0) + m[0].length;
    if (m[1] !== undefined) out += SAFE_LINK.test(m[2]) ? `${inlineText(m[1], ctx)} (${tagged(m[2], ctx)})` : m[0];
    else if (m[3] !== undefined) out += inlineText(m[3], ctx);
    else if (m[4] !== undefined) out += merge(m[4], ctx);
  }
  return out + text.slice(last);
}

/** Paragraphs split on blank lines; lines starting with "- " become a list. */
function blocks(body: string): { kind: "p" | "ul"; lines: string[] }[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim()))
    .filter((lines) => lines.length)
    .map((lines) => (lines.every((l) => /^\s*[-*] /.test(l)) ? { kind: "ul" as const, lines: lines.map((l) => l.replace(/^\s*[-*] /, "")) } : { kind: "p" as const, lines }));
}

function richText(body: string, ctx: Ctx, opts: { size?: number; color?: string; align?: "left" | "center"; last?: boolean } = {}): string {
  const size = opts.size ?? 16;
  const line = Math.round(size * 1.6);
  const color = opts.color ?? ctx.brand.colors.text;
  const parts = blocks(body);
  return parts
    .map((b, i) => {
      const margin = i === parts.length - 1 && opts.last !== false ? 0 : 16;
      const style = `margin:0 0 ${margin}px;font-family:${ctx.body};font-size:${size}px;line-height:${line}px;color:${color};text-align:${opts.align ?? "left"};`;
      if (b.kind === "ul") {
        return `<ul style="${style}padding:0 0 0 22px;">${b.lines.map((l) => `<li style="margin:0 0 6px;">${inline(l, ctx, ctx.brand.colors.accent)}</li>`).join("")}</ul>`;
      }
      return `<p style="${style}">${b.lines.map((l) => inline(l, ctx, ctx.brand.colors.accent)).join("<br>")}</p>`;
    })
    .join("");
}

function textBlocks(body: string, ctx: Ctx): string {
  return blocks(body)
    .map((b) => (b.kind === "ul" ? b.lines.map((l) => `- ${inlineText(l, ctx)}`).join("\n") : b.lines.map((l) => inlineText(l, ctx)).join("\n")))
    .join("\n\n");
}

// ---- Pieces -----------------------------------------------------------------------

function imageUrl(image: EmailImage, ctx: Ctx): string {
  return image.src.startsWith("/f/") ? `${ctx.o.baseUrl.replace(/\/$/, "")}${image.src}` : image.src;
}

function img(image: EmailImage | null, alt: string, slot: number, ctx: Ctx, opts: { radius?: number; href?: string } = {}): string {
  if (!image) {
    if (!ctx.builder) return "";
    const h = Math.round(slot * 0.56);
    return `<div style="height:${h}px;max-width:${slot}px;background-color:#eceef2;border:2px dashed #c3c8d0;border-radius:${opts.radius ?? 0}px;font-family:${ctx.body};font-size:14px;line-height:${h}px;color:#6b7280;text-align:center;">Add a photo</div>`;
  }
  const w = Math.min(slot, image.width);
  const h = Math.round((image.height / image.width) * w);
  const tag = `<img src="${esc(imageUrl(image, ctx))}" width="${w}" height="${h}" alt="${esc(alt)}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;border-radius:${opts.radius ?? 0}px;">`;
  return opts.href ? `<a href="${esc(tagged(opts.href, ctx))}" target="_blank">${tag}</a>` : tag;
}

function heading(text: string, ctx: Ctx, opts: { size?: number; align?: "left" | "center"; margin?: number } = {}): string {
  const size = opts.size ?? 22;
  return `<h2 style="margin:0 0 ${opts.margin ?? 12}px;font-family:${ctx.head};font-size:${size}px;line-height:${Math.round(size * 1.25)}px;font-weight:bold;color:${ctx.brand.colors.headings};text-align:${opts.align ?? "left"};">${inline(text, ctx, ctx.brand.colors.headings)}</h2>`;
}

function button(label: string, href: string, ctx: Ctx, opts: { align?: "left" | "center"; style?: "solid" | "outline"; size?: "md" | "sm" } = {}): string {
  const c = ctx.brand.colors;
  const solid = (opts.style ?? "solid") === "solid";
  const pad = opts.size === "sm" ? "10px 18px" : "14px 28px";
  const font = opts.size === "sm" ? 14 : 16;
  const bg = solid ? c.accent : c.body;
  const color = solid ? c.buttonText : c.accent;
  const border = solid ? "" : `border:2px solid ${c.accent};`;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${opts.align ?? "left"}" style="margin:${opts.align === "center" ? "0 auto" : "0"};">` +
    `<tr><td align="center" bgcolor="${bg}" style="border-radius:${ctx.radius}px;background-color:${bg};${border}mso-padding-alt:${pad};">` +
    `<a href="${esc(tagged(href, ctx))}" target="_blank" style="display:inline-block;padding:${pad};font-family:${ctx.body};font-size:${font}px;line-height:20px;font-weight:bold;color:${color};text-decoration:none;border-radius:${ctx.radius}px;">${plain(label, ctx)}</a>` +
    `</td></tr></table>`
  );
}

/** A content row, padded like the rest of the email. */
function row(section: EmailSection, inner: string, ctx: Ctx, opts: { pad?: string; bg?: string } = {}): string {
  const mark = ctx.builder ? ` data-section="${esc(section.id)}"${ctx.o.builder?.selectedId === section.id ? " data-selected" : ""}` : "";
  return `<tr><td class="bo-px"${mark} style="padding:${opts.pad ?? `0 ${PAD}px 24px`};${opts.bg ? `background-color:${opts.bg};` : ""}">${inner}</td></tr>`;
}

/** Two or three columns that sit side by side, and stack on narrow screens. */
function columns(cells: string[], ctx: Ctx, opts: { outer: number; gap: number; widths?: number[] }): string {
  const n = cells.length;
  const avail = WIDTH - opts.outer * 2;
  const widths = opts.widths ?? cells.map(() => Math.floor(avail / n));
  const half = opts.gap / 2;
  let out = `<!--[if mso]><table role="presentation" width="${avail}" cellpadding="0" cellspacing="0" border="0"><tr><![endif]-->`;
  cells.forEach((cell, i) => {
    const w = widths[i];
    const padL = i === 0 ? 0 : half;
    const padR = i === n - 1 ? 0 : half;
    out += `<!--[if mso]><td width="${w}" valign="top"><![endif]-->`;
    out += `<div class="bo-col" style="display:inline-block;width:100%;max-width:${w}px;vertical-align:top;font-size:16px;">`;
    out += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="bo-colpad" style="padding:0 ${padR}px 16px ${padL}px;text-align:left;">${cell}</td></tr></table>`;
    out += `</div>`;
    out += `<!--[if mso]></td><![endif]-->`;
  });
  return out + `<!--[if mso]></tr></table><![endif]-->`;
}

// ---- Sections -----------------------------------------------------------------------

function textSection(s: EmailSectionOf<"text">, ctx: Ctx): string {
  const body = s.body ? richText(s.body, ctx, { align: s.align }) : ctx.builder && !s.heading ? `<p style="margin:0;font-family:${ctx.body};color:#9aa0a8;">Write something here.</p>` : "";
  return row(s, (s.heading ? heading(s.heading, ctx, { align: s.align, margin: s.body ? 12 : 0 }) : "") + body, ctx);
}

function photoSection(s: EmailSectionOf<"photo">, ctx: Ctx): string {
  const full = s.width === "full";
  const slot = full ? WIDTH : INNER;
  const caption = s.caption ? `<p style="margin:10px 0 0;font-family:${ctx.body};font-size:13px;line-height:19px;color:${ctx.brand.colors.smallPrint};text-align:${full ? "center" : "left"};">${plain(s.caption, ctx)}</p>` : "";
  const image = img(s.image, s.alt, slot, ctx, { radius: full ? 0 : 6, href: s.href });
  if (!image && !caption) return "";
  return row(s, image + (full && caption ? `<div style="padding:0 ${PAD}px;">${caption}</div>` : caption), ctx, { pad: full ? "0 0 24px" : undefined });
}

function photoTextSection(s: EmailSectionOf<"photo-text">, ctx: Ctx): string {
  const outer = PAD;
  const widths = [Math.floor((WIDTH - outer * 2) / 2), Math.ceil((WIDTH - outer * 2) / 2)];
  const photo = img(s.image, s.alt, widths[0] - 12, ctx, { radius: 6 });
  const words =
    (s.heading ? heading(s.heading, ctx, { size: 20 }) : "") +
    (s.body ? richText(s.body, ctx, { last: !s.button }) : "") +
    (s.button ? `<div style="padding-top:4px;">${button(s.button.label, s.button.href, ctx, { size: "sm" })}</div>` : "");
  const cells = s.side === "left" ? [photo, words] : [words, photo];
  // Columns stack in source order on phones, so the photo always comes first there.
  const html = s.side === "left" ? `<div style="font-size:0;">${columns(cells, ctx, { outer, gap: 24, widths })}</div>` : columnsRtl(cells, ctx, { outer, gap: 24, widths });
  return row(s, html, ctx, { pad: `0 ${outer}px 8px` });
}

/** Photo on the right on wide screens, still first when stacked. */
function columnsRtl(cells: string[], ctx: Ctx, opts: { outer: number; gap: number; widths: number[] }): string {
  return `<div dir="rtl" style="font-size:0;">${columns([cells[1], cells[0]].map((c) => `<div dir="ltr">${c}</div>`), ctx, { ...opts, widths: [...opts.widths].reverse() })}</div>`;
}

function headerPhotoSection(s: EmailSectionOf<"header-photo">, ctx: Ctx): string {
  const image = img(s.image, s.alt, WIDTH, ctx);
  const words = s.heading || s.body ? `<div class="bo-px" style="padding:24px ${PAD}px 0;">${s.heading ? `<h1 class="bo-h1" style="margin:0 0 ${s.body ? 12 : 0}px;font-family:${ctx.head};font-size:30px;line-height:36px;font-weight:bold;color:${ctx.brand.colors.headings};">${inline(s.heading, ctx, ctx.brand.colors.headings)}</h1>` : ""}${s.body ? richText(s.body, ctx, { size: 17 }) : ""}</div>` : "";
  return row(s, image + words, ctx, { pad: "0 0 24px" });
}

function card(c: EmailCard, slot: number, ctx: Ctx): string {
  return (
    (c.image || ctx.builder ? `<div style="padding-bottom:12px;">${img(c.image, c.alt, slot, ctx, { radius: 6 })}</div>` : "") +
    heading(c.heading, ctx, { size: 17, margin: c.body || c.button ? 8 : 0 }) +
    (c.body ? richText(c.body, ctx, { size: 15, last: !c.button }) : "") +
    (c.button ? `<div style="padding-top:4px;">${button(c.button.label, c.button.href, ctx, { size: "sm" })}</div>` : "")
  );
}

function cardsSection(s: EmailSectionOf<"cards">, ctx: Ctx): string {
  const outer = 24;
  const gap = 16;
  const avail = WIDTH - outer * 2;
  const colWidth = Math.floor(avail / s.columns);
  const slot = s.columns === 2 ? colWidth - gap / 2 : colWidth - gap;
  let html = "";
  for (let i = 0; i < s.cards.length; i += s.columns) {
    const cells = s.cards.slice(i, i + s.columns).map((c) => card(c, slot, ctx));
    while (cells.length < s.columns) cells.push("");
    html += `<div style="font-size:0;text-align:left;">${columns(cells, ctx, { outer, gap, widths: cells.map(() => colWidth) })}</div>`;
  }
  return row(s, html, ctx, { pad: `0 ${outer}px 8px` });
}

function buttonSection(s: EmailSectionOf<"button">, ctx: Ctx): string {
  return row(s, button(s.label, s.href, ctx, { align: s.align, style: s.style }), ctx, { pad: `4px ${PAD}px 28px` });
}

function highlightSection(s: EmailSectionOf<"highlight">, ctx: Ctx): string {
  const c = ctx.brand.colors;
  const inner =
    (s.heading ? heading(s.heading, ctx, { size: 19, margin: s.body || s.button ? 8 : 0 }) : "") +
    (s.body ? richText(s.body, ctx, { last: !s.button }) : "") +
    (s.button ? `<div style="padding-top:6px;">${button(s.button.label, s.button.href, ctx, { size: "sm" })}</div>` : "");
  const box = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${c.highlight}" style="background-color:${c.highlight};border-radius:8px;padding:20px 24px;">${inner}</td></tr></table>`;
  return row(s, box, ctx);
}

function dividerSection(s: EmailSectionOf<"divider">, ctx: Ctx): string {
  if (s.style === "space") return row(s, `<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>`, ctx, { pad: `0 ${PAD}px 16px` });
  return row(s, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${ctx.brand.colors.lines};height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr></table>`, ctx, { pad: `4px ${PAD}px 28px` });
}

function offerSection(s: EmailSectionOf<"offer">, ctx: Ctx): string {
  const offer = ctx.o.offer ?? (ctx.builder ? { code: ctx.o.builder?.sampleCode ?? "WELCOME-7KQ2F", terms: "Each new subscriber sees their own code here. People without one don't see this box." } : null);
  if (!offer) return "";
  const c = ctx.brand.colors;
  const inner =
    heading(s.heading, ctx, { size: 19, align: "center", margin: 10 }) +
    (s.body ? richText(s.body, ctx, { align: "center", last: false }) : "") +
    `<div style="margin:0 auto 12px;padding:12px 18px;display:inline-block;border:2px dashed ${c.accent};border-radius:8px;font-family:'Courier New',Courier,monospace;font-size:22px;line-height:28px;font-weight:bold;letter-spacing:2px;color:${c.headings};">${esc(offer.code)}</div>` +
    `<p style="margin:0;font-family:${ctx.body};font-size:13px;line-height:19px;color:${c.smallPrint};">${plain(offer.terms, ctx)}</p>`;
  return row(s, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${c.highlight}" style="background-color:${c.highlight};border-radius:8px;padding:24px;text-align:center;">${inner}</td></tr></table>`, ctx);
}

function section(s: EmailSection, ctx: Ctx): string {
  switch (s.type) {
    case "text":
      return textSection(s, ctx);
    case "photo":
      return photoSection(s, ctx);
    case "photo-text":
      return photoTextSection(s, ctx);
    case "header-photo":
      return headerPhotoSection(s, ctx);
    case "cards":
      return cardsSection(s, ctx);
    case "button":
      return buttonSection(s, ctx);
    case "highlight":
      return highlightSection(s, ctx);
    case "divider":
      return dividerSection(s, ctx);
    case "offer":
      return offerSection(s, ctx);
  }
}

// ---- Plain text -----------------------------------------------------------------------

function sectionText(s: EmailSection, ctx: Ctx): string {
  const btn = (b?: { label: string; href: string }) => (b ? `${b.label}: ${tagged(b.href, ctx)}` : "");
  const join = (...parts: string[]) => parts.filter(Boolean).join("\n\n");
  switch (s.type) {
    case "text":
      return join(s.heading ? inlineText(s.heading, ctx).toUpperCase() : "", textBlocks(s.body, ctx));
    case "photo":
      return join(s.caption ?? (s.alt ? `[${s.alt}]` : ""), s.href ? tagged(s.href, ctx) : "");
    case "photo-text":
    case "highlight":
      return join(s.heading ? inlineText(s.heading, ctx).toUpperCase() : "", textBlocks(s.body, ctx), btn(s.button));
    case "header-photo":
      return join(s.heading ? inlineText(s.heading, ctx).toUpperCase() : "", s.body ? textBlocks(s.body, ctx) : "");
    case "cards":
      return s.cards.map((c) => join(inlineText(c.heading, ctx), c.body ? textBlocks(c.body, ctx) : "", btn(c.button))).join("\n\n");
    case "button":
      return btn(s);
    case "divider":
      return s.style === "line" ? "----" : "";
    case "offer":
      return ctx.o.offer ? join(inlineText(s.heading, ctx).toUpperCase(), s.body ? textBlocks(s.body, ctx) : "", `Your code: ${ctx.o.offer.code}`, ctx.o.offer.terms) : "";
  }
}

// ---- The whole email ------------------------------------------------------------------

export function renderEmail(o: RenderOptions): RenderedEmail {
  const brand = o.brand;
  const c = brand.colors;
  const radius = brand.buttonShape === "pill" ? 999 : brand.buttonShape === "rounded" ? 8 : 0;
  const ctx: Ctx = {
    o,
    brand,
    firstName: firstNameOf(o.person?.name) ?? (o.doc.fallbackName || "there"),
    head: EMAIL_FONTS[brand.fonts.headings].stack,
    body: EMAIL_FONTS[brand.fonts.body].stack,
    radius,
    builder: Boolean(o.builder),
  };

  const logo = brand.logo
    ? `<img src="${esc(imageUrl(brand.logo, ctx))}" width="${brand.logoWidth}" height="${Math.round((brand.logo.height / brand.logo.width) * brand.logoWidth)}" alt="${esc(brand.businessName)}" style="display:${brand.headerAlign === "center" ? "inline-block" : "block"};width:${brand.logoWidth}px;max-width:100%;height:auto;border:0;">`
    : `<span style="font-family:${ctx.head};font-size:20px;line-height:26px;font-weight:bold;color:${c.headerText};">${esc(brand.businessName)}</span>`;

  const sections = o.doc.sections.map((s) => section(s, ctx)).join("");
  // A wide photo first sits right under the header bar.
  const first = o.doc.sections[0];
  const flushTop = first?.type === "header-photo" || (first?.type === "photo" && first.width === "full");
  const empty = ctx.builder && !o.doc.sections.length ? `<tr><td class="bo-px" style="padding:48px ${PAD}px;font-family:${ctx.body};font-size:15px;line-height:22px;color:#9aa0a8;text-align:center;">This email is empty. Add a section to start.</td></tr>` : "";
  const signOff = o.doc.signOff && brand.signOff ? `<tr><td class="bo-px" style="padding:0 ${PAD}px 32px;">${richText(brand.signOff, ctx)}</td></tr>` : "";
  const address = brand.address ? esc(brand.address).replace(/\n/g, "<br>") : ctx.builder ? plain("[Add your postal address in the brand kit]", ctx) : "";
  const unsub = o.unsubscribeUrl ?? "#";

  const footer =
    `<p style="margin:0 0 8px;font-family:${ctx.body};font-size:12px;line-height:18px;color:${c.smallPrint};">${esc(brand.businessName)}${address ? `<br>${address}` : ""}</p>` +
    (brand.footerNote ? `<p style="margin:0 0 8px;font-family:${ctx.body};font-size:12px;line-height:18px;color:${c.smallPrint};">${esc(brand.footerNote)}</p>` : "") +
    `<p style="margin:0;font-family:${ctx.body};font-size:12px;line-height:18px;color:${c.smallPrint};"><a href="${esc(unsub)}" target="_blank" style="color:${c.smallPrint};text-decoration:underline;">Unsubscribe</a></p>`;

  const builderStyle = ctx.builder && o.builder?.outlines !== false
    ? `<style>[data-section]{cursor:pointer;transition:box-shadow .12s}[data-section]:hover{box-shadow:inset 0 0 0 2px rgba(59,91,255,.35)}[data-section][data-selected]{box-shadow:inset 0 0 0 2px #3b5bff}a{pointer-events:none}</style>`
    : "";
  const preheader = o.preheader ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(o.preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>` : "";

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, address=no, email=no, date=no, url=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(o.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
body{margin:0;padding:0;width:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
a{color:${c.accent}}
@media (max-width:620px){
.bo-px{padding-left:20px!important;padding-right:20px!important}
.bo-col{display:block!important;width:100%!important;max-width:100%!important}
.bo-colpad{padding-left:0!important;padding-right:0!important}
.bo-h1{font-size:26px!important;line-height:32px!important}
}
</style>
${builderStyle}</head>
<body style="margin:0;padding:0;background-color:${c.background};">
${preheader}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.background}" style="background-color:${c.background};">
<tr><td align="center" style="padding:24px 10px;">
<!--[if mso]><table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${WIDTH}px;margin:0 auto;">
<tr><td class="bo-px" align="${brand.headerAlign}" bgcolor="${c.headerBar}" style="background-color:${c.headerBar};padding:22px ${PAD}px;border-radius:10px 10px 0 0;text-align:${brand.headerAlign};">${logo}</td></tr>
<tr><td bgcolor="${c.body}" style="background-color:${c.body};padding-top:${flushTop ? 0 : 28}px;border-radius:0 0 10px 10px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${sections}${empty}${signOff}
</table>
</td></tr>
<tr><td class="bo-px" align="center" style="padding:24px ${PAD}px 8px;text-align:center;">${footer}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  const textParts = [
    o.doc.sections.map((s) => sectionText(s, ctx)).filter(Boolean).join("\n\n"),
    o.doc.signOff && brand.signOff ? textBlocks(brand.signOff, ctx) : "",
    ["--", brand.businessName, brand.address, brand.footerNote, `Unsubscribe: ${unsub}`].filter(Boolean).join("\n"),
  ];
  const text = textParts.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  return { html, text };
}

/** {first name} and {business name} in a subject line or preheader. Plain text, no markup. */
export function mergeLine(text: string, values: { name?: string | null; business: string; fallback?: string }): string {
  const first = firstNameOf(values.name) ?? (values.fallback || "there");
  return text.replace(/\{(first name|business name)\}/gi, (_, tag: string) => (tag.toLowerCase() === "first name" ? first : values.business));
}
