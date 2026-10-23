// The welcome series every company starts with. Off until they turn it on, and
// it can't go on while the yellow [Add ...] spots are left. Plain, short, and
// written so a business can send it nearly as is. Works in the browser too, so
// the demo starts with the same series.
import { EMAIL_DOC_VERSION, type EmailDoc } from "@/lib/email/schema";

export type StarterStep = { delayDays: number; subject: string; preheader: string; doc: EmailDoc };

const doc = (sections: EmailDoc["sections"]): EmailDoc => ({ version: EMAIL_DOC_VERSION, sections, signOff: true, fallbackName: "there" });

export function starterSeries(site: string | undefined): { name: string; steps: StarterStep[] } {
  const href = site ? `https://${site}` : "https://example.com";
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
