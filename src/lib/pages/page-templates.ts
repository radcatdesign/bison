// Ready-made landing pages to start from. Each is a page document built for the
// company that uses it: its name in the copy and, by default, its brand color.
// The copy is written to work for most businesses as is; anything only the
// business knows (prices, dates, quotes, timings) is an [Add ...] placeholder.
// Works in the browser (the gallery) and on the server (creating the page).
import { type FormField, PAGE_DOC_VERSION, type PageDoc, type PageTheme, type Section } from "./schema";

export type TemplateContext = { brand: string; accent: string };

export type PageTemplate = {
  key: string;
  name: string;
  /** One line on when to use it. */
  description: string;
  /** Short labels shown on the card. */
  tags: string[];
  /** The template's own look. Its accent is used when "Use my brand color" is off. */
  theme: PageTheme;
  sections: (ctx: TemplateContext) => Section[];
  seo: (ctx: TemplateContext) => { title: string; description: string };
};

const form = (id: string, heading: string, body: string, fields: FormField[], submit: string, success: string): Section => ({
  id,
  type: "form",
  heading,
  body,
  fields,
  submit,
  success,
});

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    key: "quote",
    name: "Quote request",
    description: "Turn visitors into quote requests, with how it works and common questions.",
    tags: ["Quote form", "Light"],
    theme: { mode: "light", accent: "#3b5bff", font: "modern", corners: "soft" },
    sections: ({ brand }) => [
      {
        id: "hero",
        type: "hero",
        eyebrow: brand,
        headline: "Get a price for your project in one step",
        body: "Tell us what you need and we'll come back with a clear quote. No calls you didn't ask for.",
        primary: { label: "Get a quote", href: "#form" },
        secondary: { label: "How it works", href: "#steps" },
        align: "left",
        art: "glow",
      },
      {
        id: "features",
        type: "features",
        heading: `Why people choose ${brand}`,
        items: [
          { title: "Clear prices", body: "One number, with what's included spelled out. No surprises on the invoice." },
          { title: "Real answers", body: "Questions go to someone who knows the work, not a call center." },
          { title: "Done when we say", body: "We give you a date and plan the job around it." },
        ],
      },
      {
        id: "steps",
        type: "steps",
        heading: "How it works",
        items: [
          { title: "Send the form", body: "A few details about the job. It takes a minute." },
          { title: "Get your quote", body: "[Add how soon you reply]" },
          { title: "Pick a date", body: "Say yes and we'll get you on the schedule." },
        ],
      },
      {
        id: "faq",
        type: "faq",
        heading: "Questions",
        items: [
          { q: "Is the quote free?", a: "[Add the answer]" },
          { q: "Which areas do you work in?", a: "[Add the answer]" },
          { q: "How soon can you start?", a: "[Add the answer]" },
        ],
      },
      form("form", "Get a quote", "The more you tell us, the more exact the price.", ["name", "email", "phone", "message"], "Send my request", "Thanks. We'll be in touch with your quote soon."),
    ],
    seo: ({ brand }) => ({ title: `Get a quote | ${brand}`, description: `Tell ${brand} about your project and get a clear price.` }),
  },
  {
    key: "launch",
    name: "Product launch",
    description: "Build a waitlist before launch day. Dark, technical and to the point.",
    tags: ["Waitlist", "Dark"],
    theme: { mode: "dark", accent: "#7c5cff", font: "technical", corners: "round" },
    sections: ({ brand }) => [
      {
        id: "hero",
        type: "hero",
        eyebrow: "Coming soon",
        headline: "Something new is on the way",
        body: `Be the first to try what ${brand} has been working on. Join the list and we'll tell you the day it's ready.`,
        primary: { label: "Join the waitlist", href: "#form" },
        align: "center",
        art: "orbs",
      },
      {
        id: "features",
        type: "features",
        heading: "What it does",
        items: [
          { title: "[Add the first big thing it does]", body: "Say what it means for the person using it." },
          { title: "[Add the second]", body: "Keep it to a sentence or two." },
          { title: "[Add the third]", body: "Concrete beats clever." },
        ],
      },
      {
        id: "cta",
        type: "cta",
        headline: "Early access goes to the list first",
        body: "No spam. One email when it's ready, and that's it.",
        cta: { label: "Get early access", href: "#form" },
      },
      form("form", "Join the waitlist", "Leave your email and we'll let you know.", ["name", "email"], "Join", "You're on the list. We'll be in touch."),
    ],
    seo: ({ brand }) => ({ title: `Coming soon from ${brand}`, description: `Join the waitlist and be first to try what ${brand} is launching.` }),
  },
  {
    key: "sale",
    name: "Seasonal sale",
    description: "Put one offer front and center, with a clear deadline and a way to claim it.",
    tags: ["Offer", "Dark"],
    theme: { mode: "dark", accent: "#f97316", font: "editorial", corners: "sharp" },
    sections: ({ brand }) => [
      {
        id: "hero",
        type: "hero",
        eyebrow: "[Add the offer, like 15% off]",
        headline: "Our biggest sale of the season",
        body: `For a limited time, ${brand} is taking money off the things people ask for most.`,
        primary: { label: "Claim the offer", href: "#form" },
        align: "left",
        art: "glow",
      },
      {
        id: "offer",
        type: "offer",
        heading: "The offer",
        price: "[Add the price or discount]",
        note: "[Add when it ends]",
        bullets: ["[Add what's included]", "[Add what's included]", "[Add any limits]"],
        cta: { label: "Claim it", href: "#form" },
      },
      {
        id: "features",
        type: "features",
        heading: "Why now",
        items: [
          { title: "The best price of the year", body: "When it's gone, prices go back to normal." },
          { title: "Same quality, same service", body: "Nothing about the work changes. Only the price." },
          { title: "Book now, start later", body: "Lock in the price today and pick a date that suits you." },
        ],
      },
      { id: "cta", type: "cta", headline: "Don't miss it", body: "[Add when the offer ends]", cta: { label: "Claim the offer", href: "#form" } },
      form("form", "Claim the offer", "We'll confirm the details by email.", ["name", "email", "message"], "Claim it", "Thanks. Your offer is saved and we'll be in touch."),
    ],
    seo: ({ brand }) => ({ title: `Seasonal sale | ${brand}`, description: `A limited-time offer from ${brand}.` }),
  },
  {
    key: "consult",
    name: "Book a consultation",
    description: "For services sold on a conversation: what to expect, a real client quote, and a booking form.",
    tags: ["Booking", "Light"],
    theme: { mode: "light", accent: "#0f766e", font: "editorial", corners: "soft" },
    sections: ({ brand }) => [
      {
        id: "hero",
        type: "hero",
        eyebrow: "Free consultation",
        headline: "Talk it through before you decide",
        body: `A short, no-pressure conversation with ${brand}. You'll leave with a clear next step, whether or not we work together.`,
        primary: { label: "Book a time", href: "#form" },
        align: "left",
        art: "grid",
      },
      {
        id: "steps",
        type: "steps",
        heading: "What to expect",
        items: [
          { title: "Pick a time", body: "Send the form and we'll find a slot that works." },
          { title: "Talk it through", body: "[Add how long the call is and how it happens]" },
          { title: "Get a plan", body: "A short summary of what we'd do and what it costs." },
        ],
      },
      { id: "quote", type: "quote", quote: "[Add a real client quote]", name: "[Add their name]", role: "[Add their company or town]" },
      {
        id: "faq",
        type: "faq",
        heading: "Questions",
        items: [
          { q: "Is it really free?", a: "[Add the answer]" },
          { q: "Do I need to prepare anything?", a: "[Add the answer]" },
        ],
      },
      form("form", "Book a consultation", "Tell us a little about what you need.", ["name", "email", "phone", "message"], "Request a time", "Thanks. We'll be in touch to find a time."),
    ],
    seo: ({ brand }) => ({ title: `Book a free consultation | ${brand}`, description: `A short, no-pressure conversation with ${brand}.` }),
  },
  {
    key: "event",
    name: "Event or workshop",
    description: "Fill seats for a class, open house or workshop.",
    tags: ["Sign up", "Light"],
    theme: { mode: "light", accent: "#e11d48", font: "modern", corners: "round" },
    sections: ({ brand }) => [
      {
        id: "hero",
        type: "hero",
        eyebrow: "[Add the date, time and place]",
        headline: "Join us for an afternoon of hands-on learning",
        body: `Hosted by ${brand}. Bring your questions and leave with something you can use.`,
        primary: { label: "Save my seat", href: "#form" },
        align: "center",
        art: "glow",
      },
      {
        id: "features",
        type: "features",
        heading: "What you'll get",
        items: [
          { title: "Learn it in person", body: "See it done, then try it yourself with help on hand." },
          { title: "Ask anything", body: "Time set aside for your questions, not a sales pitch." },
          { title: "Take it home", body: "Notes and next steps you can use the same week." },
        ],
      },
      {
        id: "steps",
        type: "steps",
        heading: "The plan",
        items: [
          { title: "Welcome", body: "[Add the start time]" },
          { title: "Hands-on session", body: "[Add what you'll cover]" },
          { title: "Questions and wrap-up", body: "[Add the end time]" },
        ],
      },
      form("form", "Save my seat", "[Add how many seats there are]", ["name", "email"], "Save my seat", "You're in. We'll send the details by email."),
    ],
    seo: ({ brand }) => ({ title: `Workshop | ${brand}`, description: `Join ${brand} for a hands-on workshop.` }),
  },
  {
    key: "trade",
    name: "Trade program",
    description: "Recruit dealers, wholesale buyers or trade partners.",
    tags: ["Application", "Light"],
    theme: { mode: "light", accent: "#1d4ed8", font: "modern", corners: "sharp" },
    sections: ({ brand }) => [
      {
        id: "hero",
        type: "hero",
        eyebrow: "For the trade",
        headline: `Become a ${brand} partner`,
        body: "Trade pricing, priority support and stock you can count on. Apply in a couple of minutes.",
        primary: { label: "Apply now", href: "#form" },
        secondary: { label: "What you get", href: "#features" },
        align: "left",
        art: "grid",
      },
      {
        id: "features",
        type: "features",
        heading: "What partners get",
        items: [
          { title: "Trade pricing", body: "[Add how your trade pricing works]" },
          { title: "A real contact", body: "One person who knows your account and answers the phone." },
          { title: "Priority stock", body: "First in line when demand runs high." },
          { title: "Marketing help", body: "Photos, samples and copy you can use with your own customers." },
        ],
      },
      {
        id: "steps",
        type: "steps",
        heading: "How to join",
        items: [
          { title: "Apply", body: "Tell us about your business." },
          { title: "Get approved", body: "[Add how long approval takes]" },
          { title: "Place your first order", body: "Your trade account is ready to use." },
        ],
      },
      form("form", "Apply for a trade account", "A few details about your business.", ["name", "email", "company", "message"], "Send application", "Thanks. We'll review your application and get back to you."),
    ],
    seo: ({ brand }) => ({ title: `Trade program | ${brand}`, description: `Apply for trade pricing and priority support from ${brand}.` }),
  },
  {
    key: "guide",
    name: "Free guide",
    description: "Trade something useful for an email address. A simple, effective way to grow a list.",
    tags: ["Lead magnet", "Dark"],
    theme: { mode: "dark", accent: "#14b8a6", font: "modern", corners: "soft" },
    sections: ({ brand }) => [
      {
        id: "hero",
        type: "hero",
        eyebrow: "Free guide",
        headline: "[Add the guide's title]",
        body: `Everything we've learned, in one short guide from ${brand}. Free, and yours in a minute.`,
        primary: { label: "Send me the guide", href: "#form" },
        align: "left",
        art: "orbs",
      },
      {
        id: "offer",
        type: "offer",
        heading: "What's inside",
        bullets: ["[Add what's in it]", "[Add what's in it]", "[Add what's in it]"],
        cta: { label: "Get the guide", href: "#form" },
      },
      form("form", "Get the free guide", "We'll email it to you right away.", ["name", "email"], "Send me the guide", "It's on its way. Check your inbox."),
    ],
    seo: ({ brand }) => ({ title: `Free guide from ${brand}`, description: `A short, free guide from ${brand}.` }),
  },
  {
    key: "simple",
    name: "Simple contact",
    description: "Just a headline and a form. For when you need a page today.",
    tags: ["Minimal", "Light"],
    theme: { mode: "light", accent: "#111111", font: "modern", corners: "soft" },
    sections: ({ brand }) => [
      { id: "hero", type: "hero", eyebrow: brand, headline: "Let's talk", body: "Send a message and we'll get back to you.", primary: { label: "Get in touch", href: "#form" }, align: "center", art: "none" },
      form("form", "Get in touch", "We read every message.", ["name", "email", "message"], "Send", "Thanks. We'll get back to you soon."),
    ],
    seo: ({ brand }) => ({ title: `Contact ${brand}`, description: `Get in touch with ${brand}.` }),
  },
];

export function findTemplate(key: unknown): PageTemplate | null {
  return PAGE_TEMPLATES.find((t) => t.key === key) ?? null;
}

/** The page a template makes for one company. With brandColor on, it uses the company's accent. */
export function buildFromTemplate(template: PageTemplate, ctx: TemplateContext, brandColor = true): PageDoc {
  // A very long company name is shortened so every headline still fits.
  const brand = ctx.brand.length > 40 ? ctx.brand.slice(0, 40).replace(/\s+\S*$/, "") : ctx.brand;
  const seo = template.seo({ ...ctx, brand });
  return {
    version: PAGE_DOC_VERSION,
    theme: { ...template.theme, accent: brandColor && /^#[0-9a-f]{6}$/i.test(ctx.accent) ? ctx.accent.toLowerCase() : template.theme.accent },
    seo: { title: seo.title.slice(0, 70), description: seo.description.slice(0, 160) },
    sections: template.sections({ ...ctx, brand }),
  };
}
