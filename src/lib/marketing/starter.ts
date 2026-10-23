// The welcome series every company starts with. Off until they turn it on, and
// it can't go on while the yellow [Add ...] spots are left. Plain, short, and
// written so a business can send it nearly as is. Works in the browser too, so
// the demo starts with the same series.
//
// In Fit Funnels the starter is a club's new lead follow-up, and a second
// series, welcome to the club, waits for new members. Both start off.
import type { EditionKey } from "@/config/editions";
import type { SequenceTrigger } from "@/lib/db/types";
import { EMAIL_DOC_VERSION, type EmailDoc } from "@/lib/email/schema";

export type StarterStep = { delayDays: number; subject: string; preheader: string; doc: EmailDoc };

const doc = (sections: EmailDoc["sections"]): EmailDoc => ({ version: EMAIL_DOC_VERSION, sections, signOff: true, fallbackName: "there" });

export function starterSeries(site: string | undefined, edition: EditionKey = "bison"): { name: string; steps: StarterStep[] } {
  const href = site ? `https://${site}` : "https://example.com";
  if (edition === "fit") return newLeadFollowUp(href);
  return {
    name: "Welcome series",
    steps: [
      {
        delayDays: 0,
        subject: "Welcome to {business name}",
        preheader: "Thanks for joining. Here's what to expect.",
        doc: doc([
          {
            id: "welcome",
            type: "text",
            heading: "Welcome, {first name}",
            body: "Thanks for joining the {business name} list.\n\nHere's what to expect from us: [Add how often you'll email and what about, like one email a month with new projects and seasonal tips].\n\nIf you ever have a question, just reply to this email. It comes straight to us.",
            align: "left",
          },
          { id: "gift", type: "offer", heading: "A welcome gift", body: "Here's a code for your first order with us." },
          { id: "visit", type: "button", label: "See what's new", href, align: "left", style: "solid" },
        ]),
      },
      {
        delayDays: 2,
        subject: "What we're known for",
        preheader: "A little about us, and what people come back for.",
        doc: doc([
          {
            id: "about",
            type: "text",
            heading: "What we're known for",
            body: "Hi {first name},\n\n[Add two or three sentences about what makes you different, in your own words.]",
            align: "left",
          },
          { id: "popular", type: "highlight", heading: "Our most popular", body: "[Add your most popular product or service, and why people like it.]" },
          { id: "look", type: "button", label: "Take a look", href, align: "left", style: "solid" },
        ]),
      },
      {
        delayDays: 5,
        subject: "A quick question, {first name}",
        preheader: "What brought you to us?",
        doc: doc([
          {
            id: "question",
            type: "text",
            body: "Hi {first name},\n\nWhat brought you to {business name}? Hit reply and tell us in a sentence or two.\n\nWe read every answer, and it helps us send you things you actually want.",
            align: "left",
          },
        ]),
      },
    ],
  };
}

/** Series a company starts with besides the starter, all off and all deletable. None in Bison Ops. */
export function extraStarterSeries(site: string | undefined, edition: EditionKey = "bison"): { name: string; trigger: SequenceTrigger; steps: StarterStep[] }[] {
  const href = site ? `https://${site}` : "https://example.com";
  return edition === "fit" ? [welcomeToTheClub(href)] : [];
}

// ---- Fit Funnels -------------------------------------------------------------------

/** For people who ask about the club: a free pass, a tour, a first class. */
function newLeadFollowUp(href: string): { name: string; steps: StarterStep[] } {
  return {
    name: "New lead follow-up",
    steps: [
      {
        delayDays: 0,
        subject: "Thanks for asking about {business name}",
        preheader: "Here's how to get started.",
        doc: doc([
          {
            id: "thanks",
            type: "text",
            heading: "Hi {first name}, thanks for reaching out",
            body: "Thanks for your interest in {business name}.\n\nHere's the easiest way to get started: [Add the first step, like booking your free pass, a club tour or your first class].\n\nIf you have a question before your first visit, just reply to this email. It comes straight to our team.",
            align: "left",
          },
          { id: "intro", type: "offer", heading: "Your intro offer", body: "Here's your own code for our intro offer." },
          { id: "book", type: "button", label: "Book your first visit", href, align: "left", style: "solid" },
        ]),
      },
      {
        delayDays: 2,
        subject: "What to expect on your first visit",
        preheader: "Where to go, what to bring, and who you'll meet.",
        doc: doc([
          {
            id: "first-visit",
            type: "text",
            heading: "Your first visit",
            body: "Hi {first name},\n\nHere's what a first visit looks like: [Add what happens when someone arrives, like a quick tour, a locker and a hello from a coach].\n\nBring [Add what to bring, like a water bottle, a towel or shoes for class].",
            align: "left",
          },
          { id: "good-to-know", type: "highlight", heading: "Good to know", body: "[Add your hours, parking, and anything new people often ask about.]" },
          { id: "schedule", type: "button", label: "See the class schedule", href, align: "left", style: "solid" },
        ]),
      },
      {
        delayDays: 5,
        subject: "A quick question, {first name}",
        preheader: "What would you like to try first?",
        doc: doc([
          {
            id: "question",
            type: "text",
            body: "Hi {first name},\n\nWhat made you look at {business name}? Hit reply and tell us in a sentence or two, like the classes you'd like to try or the times that work for you.\n\nWe read every answer, and it helps us point you to the right class or coach.",
            align: "left",
          },
        ]),
      },
    ],
  };
}

/** For new members. Started for a list, like Members, since joining happens at the front desk as often as online. */
function welcomeToTheClub(href: string): { name: string; trigger: SequenceTrigger; steps: StarterStep[] } {
  return {
    name: "Welcome to the club",
    trigger: "manual",
    steps: [
      {
        delayDays: 0,
        subject: "Welcome to {business name}, {first name}",
        preheader: "Everything you need for your first few weeks.",
        doc: doc([
          {
            id: "welcome",
            type: "text",
            heading: "Welcome to the club",
            body: "Hi {first name},\n\nYou're a member now. Here's how to get the most out of your first few weeks:\n\n- [Add how to book classes, like your app or the front desk]\n- [Add your hours, and when the club is quietest]\n- [Add who to ask for help on the floor]\n\nQuestions? Just reply. It comes straight to our team.",
            align: "left",
          },
          { id: "schedule", type: "button", label: "See the schedule", href, align: "left", style: "solid" },
        ]),
      },
      {
        delayDays: 7,
        subject: "How's your first week going?",
        preheader: "A few things new members often miss.",
        doc: doc([
          {
            id: "week-one",
            type: "text",
            heading: "One week in",
            body: "Hi {first name},\n\nYou've had a week at {business name}. If you haven't tried it yet: [Add a class, a service or a part of the club new members often miss].\n\nWant a hand with a plan? [Add how to book time with a coach or trainer].",
            align: "left",
          },
        ]),
      },
      {
        delayDays: 30,
        subject: "One month in, {first name}",
        preheader: "A quick check-in from the club.",
        doc: doc([
          {
            id: "month-one",
            type: "text",
            body: "Hi {first name},\n\nIt's been a month since you joined. What's working, and what isn't? Hit reply and tell us. We read every answer.\n\nComing up for members: [Add what's next, like an event, a challenge or new classes].",
            align: "left",
          },
        ]),
      },
    ],
  };
}
