// The search pack: what search engines and AI assistants read about a company.
// Built from its own content: the business details it filled in, its brand kit,
// and its published landing pages. Pure functions, so the screens can preview
// exactly what the public files serve.
import type { EditionKey } from "@/config/editions";
import type { BrandKit } from "@/lib/email/schema";
import type { PageDoc, Section } from "@/lib/pages/schema";
import type { SearchSettings } from "./settings";

export type SearchPage = { slug: string; title: string; doc: PageDoc; publishedAt: Date };
/** An active product, when the company has Sales. Its page is /p/<company>/shop/<slug>. */
export type SearchProduct = { slug: string; name: string; summary: string; price: string; updatedAt: Date };
export type SearchContext = { name: string; tenantSlug: string; site: string | null; base: string; brand: BrandKit; search: SearchSettings; pages: SearchPage[]; products?: SearchProduct[]; edition?: EditionKey };

/** AI crawlers named in robots.txt when a company turns them off. */
export const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot", "Bytespider", "meta-externalagent", "Amazonbot", "cohere-ai"];

export function pageUrl(c: Pick<SearchContext, "base" | "tenantSlug">, slug: string): string {
  return `${c.base}/p/${c.tenantSlug}/${slug}`;
}

export function productPage(c: Pick<SearchContext, "base" | "tenantSlug">, slug: string): string {
  return `${c.base}/p/${c.tenantSlug}/shop/${slug}`;
}

export function filesBase(c: Pick<SearchContext, "base" | "tenantSlug">): string {
  return `${c.base}/p/${c.tenantSlug}`;
}

const xml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const clean = (v: string) => v.replace(/\[Add [^\]]{1,200}\]/g, "").replace(/\s+/g, " ").trim();

export function pageTitle(p: SearchPage, name: string): string {
  const hero = p.doc.sections.find((s) => s.type === "hero");
  return clean(p.doc.seo.title || (hero?.type === "hero" ? hero.headline : "") || p.title || name);
}

export function pageDescription(p: SearchPage): string {
  if (p.doc.seo.description) return clean(p.doc.seo.description);
  const hero = p.doc.sections.find((s) => s.type === "hero");
  const text = p.doc.sections.find((s) => s.type === "text");
  return clean((hero?.type === "hero" ? hero.body : undefined) ?? (text?.type === "text" ? text.body : "") ?? "").slice(0, 160);
}

// ---- sitemap.xml -----------------------------------------------------------------

export function buildSitemap(c: SearchContext): string {
  const entry = (loc: string, at: Date) => `  <url>\n    <loc>${xml(loc)}</loc>\n    <lastmod>${at.toISOString().slice(0, 10)}</lastmod>\n  </url>`;
  const products = c.products ?? [];
  const urls = [
    ...c.pages.map((p) => entry(pageUrl(c, p.slug), p.publishedAt)),
    ...(products.length ? [entry(`${filesBase(c)}/shop`, products.reduce((d, p) => (p.updatedAt > d ? p.updatedAt : d), products[0].updatedAt))] : []),
    ...products.map((p) => entry(productPage(c, p.slug), p.updatedAt)),
  ].join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// ---- robots.txt lines for the company's own site ---------------------------------

export function robotsLines(c: SearchContext): string {
  const lines = ["# Add these lines to the robots.txt on your own website.", `Sitemap: ${filesBase(c)}/sitemap.xml`];
  if (!c.search.allowAi) {
    lines.push("", "# You turned off AI crawlers in your search pack.");
    for (const bot of AI_BOTS) lines.push(`User-agent: ${bot}`, "Disallow: /", "");
  }
  return `${lines.join("\n").trim()}\n`;
}

// ---- llms.txt ------------------------------------------------------------------------

function contactLines(c: SearchContext): string[] {
  const s = c.search;
  return [
    c.site ? `- Website: https://${c.site}` : "",
    s.phone ? `- Phone: ${s.phone}` : "",
    s.email ? `- Email: ${s.email}` : "",
    c.brand.address ? `- Address: ${c.brand.address.replace(/\n+/g, ", ")}` : "",
    s.hours ? `- Hours: ${s.hours}` : "",
    s.areas ? `- Areas served: ${s.areas}` : "",
    ...s.profiles.map((p) => `- ${p}`),
  ].filter(Boolean);
}

export function buildLlmsTxt(c: SearchContext): string {
  const s = c.search;
  const out = [`# ${c.name}`, ""];
  if (s.description) out.push(`> ${clean(s.description)}`, "");
  if (s.offerings.length) out.push("What we offer:", "", ...s.offerings.map((o) => `- ${o}`), "");
  const contact = contactLines(c);
  if (contact.length) out.push("## Contact", "", ...contact, "");
  if (c.pages.length) {
    out.push("## Pages", "");
    for (const p of c.pages) {
      const d = pageDescription(p);
      out.push(`- [${pageTitle(p, c.name)}](${pageUrl(c, p.slug)})${d ? `: ${d}` : ""}`);
    }
    out.push("");
  }
  if (c.products?.length) {
    out.push(c.edition === "fit" ? "## Memberships, packs and gear" : "## Products", "");
    for (const p of c.products) out.push(`- [${clean(p.name)}](${productPage(c, p.slug)}): ${p.price}${p.summary ? `. ${clean(p.summary)}` : ""}`);
    out.push("");
  }
  out.push("## Optional", "", `- [Full text of every page](${filesBase(c)}/llms-full.txt)`, "");
  return out.join("\n");
}

function sectionText(s: Section): string {
  const h = (t?: string) => (t ? `### ${clean(t)}\n\n` : "");
  switch (s.type) {
    case "hero":
      return `${s.eyebrow ? `${clean(s.eyebrow)}\n\n` : ""}## ${clean(s.headline)}\n\n${s.body ? `${clean(s.body)}\n` : ""}`;
    case "features":
    case "steps":
      return `${h(s.heading)}${s.type === "features" && s.intro ? `${clean(s.intro)}\n\n` : ""}${s.items.map((i, n) => `${s.type === "steps" ? `${n + 1}.` : "-"} **${clean(i.title)}**: ${clean(i.body)}`).join("\n")}\n`;
    case "stats":
      return `${h(s.heading)}${s.items.map((i) => `- ${clean(i.value)} ${clean(i.label)}`).join("\n")}\n`;
    case "quote":
      return `> ${clean(s.quote)}\n>\n> ${clean(s.name)}${s.role ? `, ${clean(s.role)}` : ""}\n`;
    case "offer":
      return `${h(s.heading)}${s.price ? `${clean(s.price)}\n\n` : ""}${s.bullets.map((b) => `- ${clean(b)}`).join("\n")}${s.note ? `\n\n${clean(s.note)}` : ""}\n`;
    case "faq":
      return `${h(s.heading ?? "Questions")}${s.items.map((i) => `**${clean(i.q)}**\n\n${clean(i.a)}`).join("\n\n")}\n`;
    case "form":
      return `${h(s.heading)}${s.body ? `${clean(s.body)}\n` : ""}`;
    case "cta":
      return `${h(s.headline)}${s.body ? `${clean(s.body)}\n` : ""}`;
    case "text":
      return `${h(s.heading)}${clean(s.body)}\n`;
  }
}

export function buildLlmsFull(c: SearchContext): string {
  const parts = [buildLlmsTxt(c).replace(/\n## Optional[\s\S]*$/, ""), ""];
  for (const p of c.pages) {
    parts.push(`---`, "", `# ${pageTitle(p, c.name)}`, "", `Source: ${pageUrl(c, p.slug)}`, "", ...p.doc.sections.map(sectionText), "");
  }
  return `${parts.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

// ---- Structured data -----------------------------------------------------------------

export function organizationData(c: SearchContext): Record<string, unknown> {
  const s = c.search;
  return {
    "@type": s.businessType,
    "@id": `${filesBase(c)}#business`,
    name: c.name,
    ...(c.site ? { url: `https://${c.site}` } : {}),
    ...(s.description ? { description: clean(s.description) } : {}),
    ...(s.phone ? { telephone: s.phone } : {}),
    ...(s.email ? { email: s.email } : {}),
    ...(c.brand.address ? { address: { "@type": "PostalAddress", streetAddress: c.brand.address.replace(/\n+/g, ", ") } } : {}),
    ...(s.areas ? { areaServed: s.areas } : {}),
    ...(s.profiles.length ? { sameAs: s.profiles } : {}),
    ...(s.offerings.length ? { knowsAbout: s.offerings } : {}),
    ...(c.brand.logo ? { logo: c.brand.logo.src.startsWith("/f/") ? `${c.base}${c.brand.logo.src}` : c.brand.logo.src } : {}),
  };
}

/** JSON-LD for one published page: the business, the page, and its questions when it has some. */
export function pageStructuredData(c: SearchContext, p: SearchPage): Record<string, unknown> {
  const url = pageUrl(c, p.slug);
  const graph: Record<string, unknown>[] = [
    organizationData(c),
    { "@type": "WebPage", "@id": url, url, name: pageTitle(p, c.name), description: pageDescription(p) || undefined, about: { "@id": `${filesBase(c)}#business` }, dateModified: p.publishedAt.toISOString() },
  ];
  const faqs = p.doc.sections.flatMap((s) => (s.type === "faq" ? s.items : []));
  if (faqs.length) graph.push({ "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: clean(f.q), acceptedAnswer: { "@type": "Answer", text: clean(f.a) } })) });
  return { "@context": "https://schema.org", "@graph": graph };
}

/** For a script tag: JSON with < escaped so it can't close the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// ---- Checks --------------------------------------------------------------------------

export type PageCheck = { ok: boolean; text: string };

export function checkPage(p: SearchPage, name: string): PageCheck[] {
  const title = pageTitle(p, name);
  const desc = pageDescription(p);
  return [
    title.length < 15 ? { ok: false, text: `The title is short (${title.length} characters). Aim for 30 to 60, with what you do and where.` } : title.length > 60 ? { ok: false, text: `The title is ${title.length} characters. Search results cut off around 60.` } : { ok: true, text: `Title is ${title.length} characters.` },
    !p.doc.seo.description ? { ok: false, text: "No search description yet, so one is taken from the page. Write your own under Page, then Search, in the page editor." } : desc.length > 160 ? { ok: false, text: "The description is over 160 characters and will be cut off." } : { ok: true, text: `Description is ${desc.length} characters.` },
    p.doc.sections.some((s) => s.type === "faq") ? { ok: true, text: "Has questions and answers, marked up so search and AI tools can quote them." } : { ok: true, text: "Tip: a Questions section gets marked up so search and AI tools can quote your answers." },
  ];
}
