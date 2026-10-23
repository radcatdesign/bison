// One finished example page per demo company, so the demo's Pages screen
// opens on something real. Made-up companies, made-up details.
import { PAGE_DOC_VERSION, type PageDoc } from "./schema";

export type SeedPage = { title: string; slug: string; doc: PageDoc; brief: string };

const pools: SeedPage = {
  title: "Spring glow sale",
  slug: "spring-glow-sale",
  brief: "A spring sale page for glow aggregate, 15% off through May, dark and premium, with a quote form and FAQ",
  doc: {
    version: PAGE_DOC_VERSION,
    theme: { mode: "dark", accent: "#2ef2d0", font: "editorial", corners: "soft" },
    seo: { title: "15% off glow aggregate this spring | Brightwater Pools", description: "Glow aggregate that charges in the sun and lights your pool after dark. 15% off every order placed by May 31." },
    sections: [
      {
        id: "hero",
        type: "hero",
        eyebrow: "Spring sale: 15% off through May",
        headline: "Your pool, lit from within",
        body: "Glow aggregate mixes into plaster or pebble, charges in the sun and glows for hours after dark. No wiring, no bulbs.",
        primary: { label: "Get a quote", href: "#form" },
        secondary: { label: "How it works", href: "#steps" },
        align: "left",
        art: "glow",
      },
      {
        id: "features",
        type: "features",
        heading: "Why builders spec it",
        items: [
          { title: "Charges by day, glows all night", body: "The aggregate soaks up sunlight and gives it back for hours after dark." },
          { title: "Safe in chlorine and salt", body: "Sealed and tested for pool water, so the color holds season after season." },
          { title: "Five colors, three grain sizes", body: "From a soft aqua glow to deep blue, matched to your finish." },
        ],
      },
      {
        id: "offer",
        type: "offer",
        heading: "15% off glow aggregate",
        price: "15% off",
        note: "Every order placed by May 31. Installs can be booked into June.",
        bullets: ["Any color, any grain size", "Free sample pack with every quote", "Trade pricing stacks for dealers"],
        cta: { label: "Price my pool", href: "#form" },
      },
      {
        id: "steps",
        type: "steps",
        heading: "How it works",
        items: [
          { title: "Send your square footage", body: "Two minutes with the form below." },
          { title: "Get your price and samples", body: "We email the numbers and mail a sample pack the same week." },
          { title: "Your builder mixes it in", body: "It goes in like any plaster or pebble finish." },
        ],
      },
      {
        id: "faq",
        type: "faq",
        heading: "Questions",
        items: [
          { q: "Can it go into an existing pool?", a: "Yes, at your next resurface. It mixes into the new plaster or pebble coat." },
          { q: "How long does it glow?", a: "Most pools glow for four to six hours after a sunny day, brightest in the first hour." },
          { q: "Do I need a special builder?", a: "No. Any builder who does plaster or pebble finishes can work with it." },
        ],
      },
      {
        id: "form",
        type: "form",
        heading: "Get a quote",
        body: "Square footage and the color you like. We'll send the numbers and a sample pack.",
        fields: ["name", "email", "phone", "message"],
        submit: "Send my request",
        success: "Thanks. We'll email your quote within one business day.",
      },
    ],
  },
};

const coffee: SeedPage = {
  title: "Wholesale for cafes",
  slug: "wholesale",
  brief: "A wholesale page for cafes and offices, light and modern, with a trade application form",
  doc: {
    version: PAGE_DOC_VERSION,
    theme: { mode: "light", accent: "#b45309", font: "modern", corners: "round" },
    seo: { title: "Wholesale coffee for cafes and offices | Ridgeline Roasters", description: "Fresh-roasted coffee by the case, with a program built around what you pour each week." },
    sections: [
      {
        id: "hero",
        type: "hero",
        eyebrow: "Wholesale",
        headline: "Coffee your regulars will notice",
        body: "Roasted this week and delivered by the case to cafes, offices and restaurants. Tell us how much you pour and we'll build a program around it.",
        primary: { label: "Apply for wholesale", href: "#form" },
        align: "center",
        art: "orbs",
      },
      {
        id: "stats",
        type: "stats",
        items: [
          { value: "3 days", label: "From roast to your door" },
          { value: "12", label: "Coffees on the menu" },
          { value: "5 lb", label: "Smallest weekly order" },
        ],
      },
      {
        id: "features",
        type: "features",
        heading: "What you get",
        items: [
          { title: "Your own roast schedule", body: "We roast for you on a set day, so every delivery is days old, not weeks." },
          { title: "Training for your team", body: "Dial-in visits and barista training when you start and whenever you change coffees." },
          { title: "One invoice a month", body: "Change quantities any week. You get one clear bill at the end of the month." },
          { title: "Gear when you need it", body: "Grinders and brewers at cost for wholesale partners." },
        ],
      },
      {
        id: "steps",
        type: "steps",
        heading: "Getting started",
        items: [
          { title: "Apply", body: "Tell us about your shop and how much you go through." },
          { title: "Taste", body: "We send a box of coffees to try, or come by the roastery." },
          { title: "First delivery", body: "Pick your coffees and your day. We handle the rest." },
        ],
      },
      {
        id: "form",
        type: "form",
        heading: "Apply for wholesale",
        body: "A few details and we'll set up a tasting.",
        fields: ["name", "email", "company", "message"],
        submit: "Send application",
        success: "Thanks. We'll reach out this week to set up a tasting.",
      },
    ],
  },
};

const general: SeedPage = {
  title: "Book a call",
  slug: "book-a-call",
  brief: "A simple page to book an intro call",
  doc: {
    version: PAGE_DOC_VERSION,
    theme: { mode: "light", accent: "#3b5bff", font: "modern", corners: "soft" },
    seo: { title: "Book a call", description: "Pick a time to talk through what you need." },
    sections: [
      { id: "hero", type: "hero", headline: "Let's talk it through", body: "A short call to see if we're a fit. No pitch deck.", primary: { label: "Book a call", href: "#form" }, align: "left", art: "grid" },
      { id: "form", type: "form", heading: "Book a call", fields: ["name", "email", "phone"], submit: "Request a time", success: "Thanks. We'll be in touch to find a time." },
    ],
  },
};

export function seedPageFor(industry: string): SeedPage {
  return industry === "pools" ? pools : industry === "coffee" ? coffee : general;
}
