// The offline page agent. Used when Claude isn't connected (tests, local work,
// and the demo until an API key is set). It understands a brief for a new page
// and short, direct changes. It never makes up facts: anything only the business
// knows becomes an [Add ...] placeholder.
import { SAMPLE_SITES } from "@/lib/sample/sites";
import { applyOp, type PageOp } from "../ops";
import { findPlaceholders, type PageDoc, type Section, type SectionType } from "../schema";
import { starterSection } from "../templates";
import type { AgentInput, AgentResult, Emit } from "./types";

type Intent = "quote" | "book" | "signup" | "trade" | "buy" | "contact";

const INTENTS: { intent: Intent; test: RegExp; cta: string; formHeading: string; submit: string; fields: string[]; success: string }[] = [
  { intent: "quote", test: /\b(quote|quotes|estimate|pric(e|ing) (my|your)|bid)\b/, cta: "Get a quote", formHeading: "Get a quote", submit: "Send my request", fields: ["name", "email", "phone", "message"], success: "Thanks. We'll come back to you with a price soon." },
  { intent: "book", test: /\b(book|booking|call|consult(ation)?|demo|appointment|schedule|visit)\b/, cta: "Book a call", formHeading: "Book a call", submit: "Request a time", fields: ["name", "email", "phone"], success: "Thanks. We'll be in touch to find a time." },
  { intent: "trade", test: /\b(wholesale|dealer|dealers|trade|reseller|stockist)\b/, cta: "Apply for trade pricing", formHeading: "Apply for trade pricing", submit: "Send application", fields: ["name", "email", "company", "message"], success: "Thanks. We'll review your application and get back to you." },
  { intent: "signup", test: /\b(sign ?up|waitlist|wait list|join|newsletter|notify|launch list|early access)\b/, cta: "Join the list", formHeading: "Join the list", submit: "Join", fields: ["name", "email"], success: "You're on the list. We'll be in touch." },
  { intent: "buy", test: /\b(buy|shop|order|purchase|preorder|pre-order)\b/, cta: "Order now", formHeading: "Place an order", submit: "Send my order", fields: ["name", "email", "message"], success: "Thanks. We'll confirm your order by email." },
];
const CONTACT = { intent: "contact" as Intent, cta: "Get in touch", formHeading: "Get in touch", submit: "Send", fields: ["name", "email", "message"], success: "Thanks. We'll get back to you soon." };

const COLORS: Record<string, string> = {
  blue: "#3b5bff",
  navy: "#1e3a8a",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  green: "#16a34a",
  lime: "#65a30d",
  purple: "#7c3aed",
  violet: "#8b5cf6",
  pink: "#ec4899",
  red: "#e5484d",
  orange: "#f97316",
  yellow: "#eab308",
  gold: "#c99a2e",
  black: "#111111",
};

const TYPE_WORDS: { type: SectionType; test: RegExp }[] = [
  { type: "faq", test: /\b(faq|faqs|questions)\b/ },
  { type: "form", test: /\b(form|sign ?up form|contact form|quote form)\b/ },
  { type: "quote", test: /\b(testimonial|testimonials|review|reviews|customer quote|quote from)\b/ },
  { type: "offer", test: /\b(offer|pricing|price box|deal|discount)\b/ },
  { type: "steps", test: /\b(steps|how it works|process)\b/ },
  { type: "stats", test: /\b(stats|numbers|figures)\b/ },
  { type: "features", test: /\b(features|benefits|reasons|why us)\b/ },
  { type: "cta", test: /\b(cta|call to action|banner)\b/ },
  { type: "text", test: /\b(text|paragraph|about section|story)\b/ },
  { type: "hero", test: /\bhero\b/ },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}`);
const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();

function intentOf(text: string) {
  return INTENTS.find((i) => i.test.test(text)) ?? CONTACT;
}

function offerOf(text: string): string | null {
  const pct = text.match(/(\d{1,2})\s?%\s*off/);
  if (pct) return `${pct[1]}% off`;
  const dollars = text.match(/\$(\d{1,5})\s*off/);
  if (dollars) return `$${dollars[1]} off`;
  // "Free" is only a deal when the brief talks about one; a free consultation is just the ask.
  const free = text.match(/\bfree ([a-z]+(?: [a-z]+)?)/);
  if (free && /\b(offer|deal|promo|promotion|sale|with every|with any)\b/.test(text) && !/\b(free (to|for|of)|feel free)\b/.test(text)) return `Free ${free[1]}`;
  return null;
}

/** The thing the page is about, from phrases like "a page for our spring glow aggregate sale". */
function topicOf(brief: string, industry: string): { topic: string; explicit: boolean } {
  const m =
    brief.match(/\b(?:page|landing page|site)\s+(?:for|about|promoting|to promote|selling|to sell|announcing|on)\s+(?:our|the|a|an|my)?\s*([^.,;!?\n]{3,60})/i) ??
    brief.match(/\b(?:page|landing page|site)\s+to\s+(?:book|get|join|order|request|apply for|sign up for|reserve)\s+(?:our|the|a|an|my)?\s*([^.,;!?\n]{3,60})/i) ??
    brief.match(/\b(?:promote|promoting|sell|selling|announce|announcing|launch|launching)\s+(?:our|the|a|an|my)?\s*([^.,;!?\n]{3,60})/i);
  let topic = m?.[1]?.trim() ?? "";
  topic = topic.replace(/\b(with|that|which|and|including|plus)\b.*$/i, "").trim();
  topic = topic.replace(/^\d{1,2}\s?%\s*off\s*/i, "").trim();
  if (topic) return { topic: topic.toLowerCase(), explicit: true };
  const site = SAMPLE_SITES[industry] ?? SAMPLE_SITES.general;
  return { topic: site.pages["/"].title.toLowerCase(), explicit: false };
}

const article = (t: string) => (/^(our|your|a|an|the)\b/.test(t) || /s$/.test(t.split(" ").at(-1) ?? "") ? "" : /^[aeiou]/.test(t) ? "an " : "a ");

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";

/** "through May", "until June 30": when an offer ends, if the brief says. */
function untilOf(text: string): string | null {
  const m = text.match(new RegExp(`\\b(through|until|till|ends?|ending)\\s+((?:${MONTHS})(?:\\s+\\d{1,2})?)\\b`, "i"));
  if (!m) return null;
  const word = m[1].toLowerCase().startsWith("end") ? "until" : m[1].toLowerCase();
  return `${word} ${m[2].replace(/^\w/, (c) => c.toUpperCase())}`;
}

function quoted(text: string): string | null {
  return text.match(/["“']([^"”']{2,120})["”']/)?.[1]?.trim() ?? null;
}

function themeOps(text: string, explicit = false): PageOp[] {
  const changes: Record<string, string> = {};
  if (/\b(dark|night|moody)\b/.test(text)) changes.mode = "dark";
  else if (/\b(light mode|light theme|make it light|go light|bright and light|white background)\b/.test(text)) changes.mode = "light";
  const hex = text.match(/#[0-9a-f]{6}\b/);
  if (hex) changes.accent = hex[0];
  else if (explicit || /\b(color|colour|accent)\b/.test(text)) {
    const name = Object.keys(COLORS).find((c) => new RegExp(`\\b${c}\\b`).test(text));
    if (name) changes.accent = COLORS[name];
  }
  if (/\b(serif|editorial|elegant|classic|luxury|luxurious|premium)\b/.test(text)) changes.font = "editorial";
  else if (/\b(mono|monospace|technical|techy|developer)\b/.test(text)) changes.font = "technical";
  else if (/\b(sans|modern font|clean font)\b/.test(text)) changes.font = "modern";
  if (/\b(sharp|square)\b/.test(text)) changes.corners = "sharp";
  else if (/\b(rounded|round|pill)\b/.test(text) && /\b(corner|corners|button|buttons|edges|shape)\b/.test(text)) changes.corners = "round";
  return Object.keys(changes).length ? [{ op: "set_theme", changes }] : [];
}

// ---- A new page from a brief ------------------------------------------------

export function planPage(input: AgentInput): PageOp[] {
  const brief = input.instruction.toLowerCase();
  const site = SAMPLE_SITES[input.industry] ?? SAMPLE_SITES.general;
  const intent = intentOf(brief);
  const offer = offerOf(brief);
  const until = untilOf(input.instruction);
  const { topic, explicit } = topicOf(input.instruction, input.industry);
  // A page about something the company already has a page for borrows its words.
  const known = Object.values(site.pages).find((p) => {
    const t = p.title.toLowerCase();
    return t === topic || (explicit && topic.length > 4 && (t.includes(topic) || topic.includes(t)));
  });
  const byIntent: Record<Intent, string> = {
    book: `Book ${article(topic)}${topic}`,
    quote: `Get a quote for ${topic}`,
    signup: /\b(list|waitlist|newsletter|club)$/.test(topic) ? `Join the ${topic.replace(/^(the|our|a)\s+/, "")}` : `Be first to hear about ${topic}`,
    trade: `${cap(topic)} for the trade`,
    buy: `${cap(topic)}, ready to order`,
    contact: cap(topic),
  };
  const headline = quoted(input.instruction) ?? known?.headline ?? (offer ? `${offer} ${topic}` : explicit ? byIntent[intent.intent] : cap(topic));
  const body = known
    ? known.sub
    : intent.intent === "quote"
      ? `Tell us about your project and we'll come back with a price for ${topic}.`
      : intent.intent === "book"
        ? `Pick a time to talk it through with the ${input.brand} team.`
        : intent.intent === "trade"
          ? `Trade pricing on ${topic} for businesses that buy regularly.`
          : intent.intent === "signup"
            ? `Leave your email and we'll tell you as soon as it's ready.`
            : firstSentence(site.pages["/"].sub);

  const ops: PageOp[] = [...themeOps(brief, true)];
  ops.push({
    op: "add_section",
    section: {
      type: "hero",
      eyebrow: offer ? `${cap(offer)} ${until ?? "for a limited time"}` : input.brand,
      headline: clip(cap(headline), 120),
      body: clip(body, 400),
      primary: { label: intent.cta, href: "#form" },
      align: /\bcenter(ed)?\b/.test(brief) ? "center" : "left",
      art: /\b(orb|orbs|bubbles|playful)\b/.test(brief) ? "orbs" : /\b(grid|technical|tech)\b/.test(brief) ? "grid" : "glow",
    },
  });
  ops.push({ op: "add_section", section: { type: "features", heading: `Why ${input.brand}`, items: site.features.slice(0, 3) } });
  if (offer) {
    ops.push({
      op: "add_section",
      section: { type: "offer", heading: clip(cap(`${offer} ${topic}`), 100), note: until ? `Good ${until}.` : "[Add when the offer ends]", bullets: [], cta: { label: intent.cta, href: "#form" } },
    });
  }
  if (/\b(steps|how it works|process)\b/.test(brief) || intent.intent === "quote" || intent.intent === "book") {
    const steps = starterSection("steps", input.brand);
    ops.push({ op: "add_section", section: steps });
  }
  if (/\b(testimonial|testimonials|review|reviews|social proof)\b/.test(brief)) {
    ops.push({ op: "add_section", section: starterSection("quote", input.brand) });
  }
  if (/\b(faq|faqs|questions)\b/.test(brief)) {
    ops.push({
      op: "add_section",
      section: {
        type: "faq",
        heading: "Questions",
        items: [
          { q: `How much does ${topic} cost?`, a: "[Add the answer]" },
          { q: "How long does it take?", a: "[Add the answer]" },
          { q: "What happens after I get in touch?", a: "[Add the answer]" },
        ],
      },
    });
  }
  ops.push({ op: "add_section", section: { type: "form", id: "form", heading: intent.formHeading, body: "A few details is all it takes.", fields: intent.fields, submit: intent.submit, success: intent.success } });
  ops.push({ op: "set_seo", changes: { title: clip(`${cap(headline)} | ${input.brand}`, 70), description: clip(body, 160) } });
  return ops;
}

// ---- Changes to an existing page -----------------------------------------------

function sectionOf(doc: PageDoc, type: SectionType): Section | undefined {
  return doc.sections.find((s) => s.type === type);
}

/** Where a new section goes: before a closing form or call to action, unless it is one. */
function insertAfter(doc: PageDoc, type: SectionType, clause: string): string | null | undefined {
  if (/\b(top|start|beginning|first)\b/.test(clause)) return "start";
  const after = clause.match(/\bafter (?:the )?([a-z ]+)/)?.[1];
  if (after) {
    const target = TYPE_WORDS.find((t) => t.test.test(after));
    const s = target && sectionOf(doc, target.type);
    if (s) return s.id;
  }
  if (type === "form" || type === "cta" || /\b(end|bottom|last)\b/.test(clause)) return undefined;
  let i = doc.sections.length;
  while (i > 0 && ["form", "cta"].includes(doc.sections[i - 1].type)) i--;
  return i === 0 ? "start" : doc.sections[i - 1].id;
}

export function planEdits(doc: PageDoc, instruction: string, brand: string): PageOp[] {
  // Keep quoted text whole while splitting the request into clauses.
  const quotes: string[] = [];
  const masked = instruction.replace(/["“]([^"”]{1,200})["”]/g, (_, q: string) => `\u0000${quotes.push(q) - 1}\u0000`);
  const clauses = masked
    .split(/(?:[.;!?]\s+|\n+|,?\s+(?:and then|then|and also|also|and)\s+)/i)
    .map((c) => c.replace(/\u0000(\d+)\u0000/g, (_, n: string) => `"${quotes[Number(n)]}"`).trim())
    .filter(Boolean);

  const ops: PageOp[] = [];
  let working = doc;
  const push = (op: PageOp) => {
    try {
      working = applyOp(working, op).doc;
      ops.push(op);
    } catch {
      /* skip what doesn't fit */
    }
  };

  for (const raw of clauses) {
    const c = raw.toLowerCase();
    const text = quoted(raw);
    const named = TYPE_WORDS.find((t) => t.test.test(c))?.type;

    if (/\b(remove|delete|drop|get rid of|take out|cut)\b/.test(c) && named) {
      const s = sectionOf(working, named);
      if (s) push({ op: "remove_section", id: s.id });
      continue;
    }
    if (/\bmove\b/.test(c) && named) {
      const s = sectionOf(working, named);
      if (!s) continue;
      const index = working.sections.findIndex((x) => x.id === s.id);
      const to = /\b(top|start|first)\b/.test(c) ? 0 : /\b(bottom|end|last)\b/.test(c) ? working.sections.length : /\bup\b/.test(c) ? index - 1 : /\bdown\b/.test(c) ? index + 1 : index;
      push({ op: "move_section", id: s.id, to });
      continue;
    }
    if (/\b(add|include|put|insert|need|want|show)\b/.test(c) && named && named !== "hero") {
      push({ op: "add_section", section: starterSection(named, brand), after: insertAfter(working, named, c) });
      continue;
    }
    if (text && /\b(headline|title|heading)\b/.test(c)) {
      const hero = sectionOf(working, "hero");
      if (hero) push({ op: "update_section", id: hero.id, changes: { headline: text } });
      continue;
    }
    if (text && /\b(button|cta)\b/.test(c)) {
      const hero = sectionOf(working, "hero");
      if (hero?.type === "hero") push({ op: "update_section", id: hero.id, changes: { primary: { label: text, href: hero.primary?.href ?? "#form" } } });
      continue;
    }
    if (text && /\b(subhead|subheading|intro|body|description|paragraph)\b/.test(c)) {
      const hero = sectionOf(working, "hero");
      if (hero) push({ op: "update_section", id: hero.id, changes: { body: text } });
      continue;
    }
    if (/\bcenter(ed)?\b/.test(c) || /\b(left|align left)\b/.test(c)) {
      const hero = sectionOf(working, "hero");
      if (hero) push({ op: "update_section", id: hero.id, changes: { align: /\bcenter(ed)?\b/.test(c) ? "center" : "left" } });
      continue;
    }
    if (/\b(shorter|shorten|tighten|trim|less text|cut down|more concise)\b/.test(c)) {
      for (const s of working.sections) {
        if (s.type === "hero" && s.body) push({ op: "update_section", id: s.id, changes: { body: firstSentence(s.body) } });
        if (s.type === "features") push({ op: "update_section", id: s.id, changes: { intro: null, items: s.items.map((i) => ({ title: i.title, body: firstSentence(i.body) })) } });
      }
      continue;
    }
    const offer = offerOf(c);
    if (offer) {
      const hero = sectionOf(working, "hero");
      if (hero) push({ op: "update_section", id: hero.id, changes: { eyebrow: offer } });
      const box = sectionOf(working, "offer");
      if (box?.type === "offer") {
        const rest = box.heading.replace(/^(\d{1,2}% off|\$\d+ off|free [a-z]+(?: [a-z]+)?)\s*/i, "");
        push({ op: "update_section", id: box.id, changes: { heading: clip(rest ? `${offer} ${rest}` : offer, 100) } });
      }
      continue;
    }
    for (const op of themeOps(c, /\b(make|use|switch|change|turn)\b/.test(c))) push(op);
  }
  return ops;
}

// ---- Running it ----------------------------------------------------------------

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runStandIn(input: AgentInput, emit: Emit, opts: { delayMs?: number } = {}): Promise<AgentResult> {
  // A new page when there's nothing yet, or when asked to start again. "Make the page darker" is an edit.
  const fresh =
    input.doc.sections.length === 0 ||
    /\b(rebuild|start over|start again|from scratch)\b/i.test(input.instruction) ||
    /\b(build|create|make|draft|design)\s+(me\s+)?(a|an|a new|new)\b[^.]*\bpage\b/i.test(input.instruction);
  const ops = fresh ? planPage(input) : planEdits(input.doc, input.instruction, input.brand);

  let doc = fresh ? { ...input.doc, sections: [] } : input.doc;
  const changes: string[] = [];
  for (const op of ops) {
    try {
      const r = applyOp(doc, op);
      doc = r.doc;
      changes.push(r.label);
      emit({ type: "op", label: r.label, doc, sectionId: r.sectionId });
      if (opts.delayMs) await wait(opts.delayMs);
    } catch {
      /* the plan only holds ops that fit, so this is a safety net */
    }
  }

  const left = findPlaceholders(doc).length;
  const placeholders = left ? ` Fill in the ${left === 1 ? "yellow placeholder" : `${left} yellow placeholders`} before you publish.` : "";
  let reply: string;
  if (fresh) {
    const kinds = doc.sections.map((s) => s.type).filter((t) => t !== "hero");
    reply = `Built a ${doc.sections.length}-section page with a hero${kinds.length ? `, ${kinds.map((k) => (k === "faq" ? "questions" : k === "cta" ? "call to action" : k)).join(", ")}` : ""}.${placeholders}`;
  } else if (changes.length) {
    reply = `Done: ${changes.map((c) => c.toLowerCase()).join(", ")}.${placeholders}`;
  } else {
    reply =
      "I'm the offline helper, so I only follow short, direct requests. Try \"add an FAQ\", \"make it dark\", \"remove the offer\", \"move the form up\" or change the headline to \"your words in quotes\".";
  }
  return { doc, reply, changes };
}
