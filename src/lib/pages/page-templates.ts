// Ready-made landing pages to start from. Each is a page document built for the
// company that uses it: its name in the copy and, by default, its brand color.
// The copy is written to work for most businesses as is; anything only the
// business knows (prices, dates, quotes, timings) is an [Add ...] placeholder.
// Works in the browser (the gallery) and on the server (creating the page).
// Fit Funnels clubs get their own set (FIT_PAGE_TEMPLATES) in place of these.
import type { EditionKey } from "@/config/editions";
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

const form = (id: string, heading: string, body: string, fields: FormField[], submit: string, success: string, subscribe = false): Section => ({
  id,
  type: "form",
  heading,
  body,
  fields,
  submit,
  success,
  ...(subscribe ? { subscribe: true } : {}),
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
      form("form", "Join the waitlist", "Leave your email and we'll let you know.", ["name", "email", "kind"], "Join", "You're on the list. We'll be in touch.", true),
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
      form("form", "Get the free guide", "We'll email it to you right away.", ["name", "email", "kind"], "Send me the guide", "It's on its way. Check your inbox.", true),
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

// ---- Fit Funnels ----------------------------------------------------------------
// For gyms, health clubs and studios. Prices, dates, class times, numbers and
// member quotes are always [Add ...] placeholders: only the club knows them.

export const FIT_PAGE_TEMPLATES: PageTemplate[] = [
  {
    key: "free-pass",
    name: "Free trial pass",
    description: "Give people a free pass to try the club, with what's included and how to claim it.",
    tags: ["Trial pass", "Dark"],
    theme: { mode: "dark", accent: "#f76b15", font: "modern", corners: "soft" },
    sections: ({ brand }) => [
      {
        id: "hero",
        type: "hero",
        eyebrow: "Free trial pass",
        headline: `Try ${brand} before you join`,
        body: "Come in, train with us and see if the club fits your week. Claiming a pass doesn't sign you up for anything.",
        primary: { label: "Claim your free pass", href: "#form" },
        secondary: { label: "What's included", href: "#offer" },
        align: "left",
        art: "glow",
      },
      {
        id: "offer",
        type: "offer",
        heading: "Your free pass",
        price: "[Add how long, like 7 days]",
        note: "[Add who it's for and any limits]",
        bullets: ["[Add what's included, like the gym floor]", "[Add what's included, like group classes]", "[Add anything else, like an intro session]"],
        cta: { label: "Claim your free pass", href: "#form" },
      },
      {
        id: "steps",
        type: "steps",
        heading: "How it works",
        items: [
          { title: "Claim your pass", body: "Send the form. It takes a minute." },
          { title: "Pick your first day", body: "[Add how you confirm, like a text from the front desk]" },
          { title: "Come in and train", body: "Check in at the front desk and we'll take it from there." },
        ],
      },
      {
        id: "faq",
        type: "faq",
        heading: "Questions",
        items: [
          { q: "Is it really free?", a: "[Add the answer]" },
          { q: "What should I bring?", a: "[Add the answer]" },
          { q: "Can I bring a friend?", a: "[Add the answer]" },
        ],
      },
      form("form", "Claim your free pass", "Your name and how to reach you. We'll be in touch to set up your first visit.", ["name", "email", "phone"], "Claim my pass", "Thanks. We'll be in touch soon to set up your first visit."),
    ],
    seo: ({ brand }) => ({ title: `Free trial pass | ${brand}`, description: `Claim a free pass and try ${brand} before you join.` }),
  },
  {
    key: "intro-offer",
    name: "Intro offer",
    description: "Put your intro offer front and center, like a first month at a low price or a few classes for one price.",
    tags: ["Offer", "Light"],
    theme: { mode: "light", accent: "#e11d48", font: "editorial", corners: "soft" },
    sections: ({ brand }) => [
      {
        id: "hero",
        type: "hero",
        eyebrow: "[Add the offer, like 3 classes for one price]",
        headline: `A simple way to start at ${brand}`,
        body: "One price to try the club, meet the coaches and find a routine before you pick a membership.",
        primary: { label: "Claim the offer", href: "#form" },
        secondary: { label: "What's included", href: "#offer" },
        align: "left",
        art: "glow",
      },
      {
        id: "offer",
        type: "offer",
        heading: "The intro offer",
        price: "[Add the price]",
        note: "[Add who it's for and when it ends]",
        bullets: ["[Add what's included]", "[Add what's included]", "[Add what happens when it ends]"],
        cta: { label: "Claim the offer", href: "#form" },
      },
      {
        id: "features",
        type: "features",
        heading: "Why start here",
        items: [
          { title: "Try it before you commit", body: "The intro offer is the easy way to see if the club fits your week." },
          { title: "Meet the coaches", body: "Ask questions, learn the basics and get comfortable before you decide." },
          { title: "Keep going if you like it", body: "[Add what membership looks like after the offer]" },
        ],
      },
      { id: "cta", type: "cta", headline: "Ready to start?", body: "[Add when the offer ends]", cta: { label: "Claim the offer", href: "#form" } },
      form("form", "Claim the intro offer", "Leave your details and we'll help you book your first visit.", ["name", "email", "phone"], "Claim the offer", "Thanks. We'll be in touch to get you started."),
    ],
    seo: ({ brand }) => ({ title: `Intro offer | ${brand}`, description: `An easy way to start at ${brand}. Claim the intro offer and book your first visit.` }),
  },
  {
    key: "class-launch",
    name: "New class or schedule",
    description: "Announce a new class or a new schedule, and fill the first sessions.",
    tags: ["Classes", "Dark"],
    theme: { mode: "dark", accent: "#7c3aed", font: "modern", corners: "round" },
    sections: ({ brand }) => [
      {
        id: "hero",
        type: "hero",
        eyebrow: "[Add the class name]",
        headline: "Something new on the schedule",
        body: `Be one of the first in the room. Save a spot and ${brand} will send you the details.`,
        primary: { label: "Save my spot", href: "#form" },
        secondary: { label: "See the times", href: "#schedule" },
        align: "center",
        art: "orbs",
      },
      {
        id: "features",
        type: "features",
        heading: "What to expect",
        items: [
          { title: "Who it's for", body: "[Add who the class suits, like all levels]" },
          { title: "What you'll do", body: "[Add what a session looks like]" },
          { title: "What to bring", body: "[Add what to bring]" },
        ],
      },
      {
        id: "schedule",
        type: "features",
        heading: "When it runs",
        intro: "[Add the date of the first class]",
        items: [
          { title: "[Add the day and time]", body: "[Add who's coaching and where]" },
          { title: "[Add the day and time]", body: "[Add who's coaching and where]" },
        ],
      },
      {
        id: "faq",
        type: "faq",
        heading: "Questions",
        items: [
          { q: "Do I need to be a member?", a: "[Add the answer]" },
          { q: "How do I book after the first week?", a: "[Add the answer]" },
          { q: "What if the class is full?", a: "[Add the answer]" },
        ],
      },
      form("form", "Save my spot", "We'll email the details and how to book.", ["name", "email", "phone"], "Save my spot", "You're on the list. We'll email the details soon."),
    ],
    seo: ({ brand }) => ({ title: `New class at ${brand}`, description: `Save a spot in the newest class on the ${brand} schedule.` }),
  },
  {
    key: "pt-consult",
    name: "Personal training consult",
    description: "Book consults with your trainers: what happens, a real member quote, and a booking form.",
    tags: ["Booking", "Light"],
    theme: { mode: "light", accent: "#0f766e", font: "editorial", corners: "soft" },
    sections: ({ brand }) => [
      {
        id: "hero",
        type: "hero",
        eyebrow: "Personal training",
        headline: "Train with a coach who plans it around you",
        body: `Start with a consult at ${brand}. You'll talk through what you want to work on and leave with a clear next step, whether or not you sign up.`,
        primary: { label: "Book a consult", href: "#form" },
        secondary: { label: "How it works", href: "#steps" },
        align: "left",
        art: "grid",
      },
      {
        id: "steps",
        type: "steps",
        heading: "How it works",
        items: [
          { title: "Book a consult", body: "Send the form and we'll find a time that works." },
          { title: "Meet your trainer", body: "[Add how long the consult is and what happens]" },
          { title: "Get a plan", body: "[Add what they leave with, like a plan and session prices]" },
        ],
      },
      {
        id: "features",
        type: "features",
        heading: "What you can work on",
        items: [
          { title: "Getting started", body: "New to training, or coming back after time off." },
          { title: "Strength", body: "Learn the lifts with someone watching your form." },
          { title: "A goal with a date", body: "An event, a season or a race you're training for." },
        ],
      },
      { id: "quote", type: "quote", quote: "[Add a real member quote]", name: "[Add their name]", role: "[Add how long they've trained with you]" },
      {
        id: "faq",
        type: "faq",
        heading: "Questions",
        items: [
          { q: "Is the consult free?", a: "[Add the answer]" },
          { q: "How much are sessions?", a: "[Add the answer]" },
          { q: "Do I need a membership?", a: "[Add the answer]" },
        ],
      },
      form("form", "Book a consult", "Tell us a little about what you want to work on.", ["name", "email", "phone", "message"], "Request a consult", "Thanks. A trainer will be in touch to find a time."),
    ],
    seo: ({ brand }) => ({ title: `Personal training | ${brand}`, description: `Book a personal training consult at ${brand} and leave with a clear next step.` }),
  },
  {
    key: "presale",
    name: "Presale for a new location",
    description: "Sign up founding members before a new club or location opens.",
    tags: ["Presale", "Dark"],
    theme: { mode: "dark", accent: "#06b6d4", font: "technical", corners: "sharp" },
    sections: ({ brand }) => [
      {
        id: "hero",
        type: "hero",
        eyebrow: "[Add the opening date or season]",
        headline: `A new ${brand} is on the way`,
        body: "Join the presale list to hear first, see the space before it opens and get the founding member offer.",
        primary: { label: "Join the presale", href: "#form" },
        secondary: { label: "Founding member offer", href: "#offer" },
        align: "left",
        art: "grid",
      },
      {
        id: "offer",
        type: "offer",
        heading: "Founding member offer",
        price: "[Add the founding rate]",
        note: "[Add how many spots or when presale ends]",
        bullets: ["[Add what's included]", "[Add what's included]", "[Add how long the rate is locked]"],
        cta: { label: "Join the presale", href: "#form" },
      },
      {
        id: "features",
        type: "features",
        heading: "What's coming",
        items: [
          { title: "[Add the first thing, like the training floor]", body: "Say what members will be able to do there." },
          { title: "[Add the second]", body: "Keep it to a sentence or two." },
          { title: "[Add the third]", body: "Concrete beats clever." },
        ],
      },
      {
        id: "steps",
        type: "steps",
        heading: "How the presale works",
        items: [
          { title: "Join the list", body: "Leave your details. It takes a minute." },
          { title: "Hear first", body: "We'll tell you when founding memberships open and when you can see the space." },
          { title: "Lock in your spot", body: "[Add how founding members sign up and pay]" },
        ],
      },
      {
        id: "faq",
        type: "faq",
        heading: "Questions",
        items: [
          { q: "Where is it?", a: "[Add the address or area]" },
          { q: "When does it open?", a: "[Add the answer]" },
          { q: "Can I train somewhere before it opens?", a: "[Add the answer]" },
        ],
      },
      form("form", "Join the presale", "Be first to hear when founding memberships open.", ["name", "email", "phone"], "Join the presale", "You're on the list. We'll be in touch before the doors open.", true),
    ],
    seo: ({ brand }) => ({ title: `Presale: a new ${brand} is coming`, description: `Join the presale list for the new ${brand} and hear first about founding memberships.` }),
  },
  {
    key: "corporate",
    name: "Corporate wellness",
    description: "Sell memberships or class packs to local companies for their staff, with a quote request form.",
    tags: ["Corporate", "Light"],
    theme: { mode: "light", accent: "#1d4ed8", font: "modern", corners: "sharp" },
    sections: ({ brand }) => [
      {
        id: "hero",
        type: "hero",
        eyebrow: "For employers",
        headline: `${brand} for your team`,
        body: "Memberships and class packs for your staff at corporate pricing. Tell us about your team and we'll send a quote.",
        primary: { label: "Get a quote", href: "#form" },
        secondary: { label: "What's included", href: "#features" },
        align: "left",
        art: "grid",
      },
      {
        id: "features",
        type: "features",
        heading: "What your team gets",
        items: [
          { title: "Corporate pricing", body: "[Add how your corporate pricing works]" },
          { title: "Pick what fits", body: "Memberships, class packs or a mix, depending on how your team likes to train." },
          { title: "One contact", body: "One person at the club who knows your account and answers your questions." },
          { title: "Easy to start", body: "[Add how staff sign up, like a link or a code]" },
        ],
      },
      {
        id: "steps",
        type: "steps",
        heading: "How it works",
        items: [
          { title: "Tell us about your team", body: "How many people, and what they'd like to do." },
          { title: "Get a quote", body: "[Add how soon you reply]" },
          { title: "Your staff sign up", body: "Approve the quote online and your team can start." },
        ],
      },
      {
        id: "faq",
        type: "faq",
        heading: "Questions",
        items: [
          { q: "Is there a minimum number of staff?", a: "[Add the answer]" },
          { q: "How does billing work?", a: "[Add the answer]" },
          { q: "Can staff add family members?", a: "[Add the answer]" },
        ],
      },
      form("form", "Get a corporate quote", "A few details about your team.", ["name", "email", "phone", "company", "message"], "Send my request", "Thanks. We'll be in touch with a quote soon."),
    ],
    seo: ({ brand }) => ({ title: `Corporate wellness | ${brand}`, description: `Memberships and class packs for your team at ${brand}, with corporate pricing.` }),
  },
  {
    key: "challenge",
    name: "Six-week challenge",
    description: "Fill a six-week challenge with the dates, what's included and a sign-up form.",
    tags: ["Challenge", "Dark"],
    theme: { mode: "dark", accent: "#e5484d", font: "modern", corners: "round" },
    sections: ({ brand }) => [
      {
        id: "hero",
        type: "hero",
        eyebrow: "[Add the start date]",
        headline: "Six weeks of training, with a group behind you",
        body: `A six-week challenge at ${brand}, with a set plan, coaches to keep you on track and people to train with.`,
        primary: { label: "Join the challenge", href: "#form" },
        secondary: { label: "What's included", href: "#offer" },
        align: "left",
        art: "glow",
      },
      {
        id: "offer",
        type: "offer",
        heading: "The six-week challenge",
        price: "[Add the price]",
        note: "[Add the dates and who it's for]",
        bullets: ["[Add what's included, like coached sessions]", "[Add what's included]", "[Add any prize or extra]"],
        cta: { label: "Join the challenge", href: "#form" },
      },
      {
        id: "steps",
        type: "steps",
        heading: "How it works",
        items: [
          { title: "Week 1: Start", body: "[Add what happens in the first week]" },
          { title: "Weeks 2 to 5: Train", body: "[Add how many sessions a week and what they are]" },
          { title: "Week 6: Finish", body: "[Add how the challenge wraps up]" },
        ],
      },
      { id: "quote", type: "quote", quote: "[Add a real quote from someone who did it]", name: "[Add their name]", role: "[Add which challenge they did]" },
      {
        id: "faq",
        type: "faq",
        heading: "Questions",
        items: [
          { q: "Do I need to be a member?", a: "[Add the answer]" },
          { q: "What if I miss a session?", a: "[Add the answer]" },
          { q: "Is it right for beginners?", a: "[Add the answer]" },
        ],
      },
      form("form", "Join the challenge", "[Add how many spots there are]", ["name", "email", "phone"], "Save my spot", "You're in. We'll send the details by email."),
    ],
    seo: ({ brand }) => ({ title: `Six-week challenge | ${brand}`, description: `Join the six-week challenge at ${brand}: a set plan, coaches and a group to train with.` }),
  },
  {
    key: "tour",
    name: "Tour or contact",
    description: "Just a headline and a form to book a tour or ask a question. For when you need a page today.",
    tags: ["Minimal", "Light"],
    theme: { mode: "light", accent: "#111111", font: "modern", corners: "soft" },
    sections: ({ brand }) => [
      { id: "hero", type: "hero", eyebrow: brand, headline: "Come see the club", body: "Book a tour or send a question, and we'll get back to you.", primary: { label: "Book a tour", href: "#form" }, align: "center", art: "none" },
      form("form", "Book a tour or ask a question", "Tell us when suits you, or what you'd like to know.", ["name", "email", "phone", "message"], "Send", "Thanks. We'll get back to you soon."),
    ],
    seo: ({ brand }) => ({ title: `Visit ${brand}`, description: `Book a tour or get in touch with ${brand}.` }),
  },
];

/** The templates a company sees: its edition's own set. */
export function templatesFor(edition: EditionKey = "bison"): PageTemplate[] {
  return edition === "fit" ? FIT_PAGE_TEMPLATES : PAGE_TEMPLATES;
}

export function findTemplate(key: unknown, edition: EditionKey = "bison"): PageTemplate | null {
  return templatesFor(edition).find((t) => t.key === key) ?? null;
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
