// Newsletter templates to start from. Facts only the business knows are left
// as [Add ...] spots, so nothing goes out with made-up dates, prices or claims.
import type { EditionKey } from "@/config/editions";
import { EMAIL_DOC_VERSION, type EmailDoc } from "./schema";

export type EmailTemplate = { key: string; name: string; description: string; subject: string; preheader: string; doc: (site: string) => EmailDoc };

const doc = (sections: EmailDoc["sections"]): EmailDoc => ({ version: EMAIL_DOC_VERSION, sections, signOff: true, fallbackName: "there" });

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: "news",
    name: "News roundup",
    description: "A photo up top, a short note, then two things worth a look.",
    subject: "What's new at {business name}",
    preheader: "[Add a one-line teaser]",
    doc: (site) =>
      doc([
        { id: "top", type: "header-photo", image: null, alt: "", heading: "[Add a headline for this month]", body: "Hi {first name}, here's what we've been up to." },
        { id: "note", type: "text", body: "[Add a short note: what happened, what's coming up, or what you've been working on.]", align: "left" },
        {
          id: "picks",
          type: "cards",
          columns: 2,
          cards: [
            { image: null, alt: "", heading: "[Add the first thing]", body: "[Add a line about it]", button: { label: "Read more", href: site } },
            { image: null, alt: "", heading: "[Add the second thing]", body: "[Add a line about it]", button: { label: "Read more", href: site } },
          ],
        },
        { id: "line", type: "divider", style: "line" },
        { id: "end", type: "text", body: "Questions? Just reply. It comes straight to us.", align: "left" },
      ]),
  },
  {
    key: "announcement",
    name: "Announcement",
    description: "One piece of news, a photo and a clear button.",
    subject: "[Add the news in a few words]",
    preheader: "[Add one line that makes people open it]",
    doc: (site) =>
      doc([
        { id: "news", type: "text", heading: "[Add the headline]", body: "Hi {first name},\n\n[Add what's new and why it matters to them, in two or three sentences.]", align: "left" },
        { id: "photo", type: "photo", image: null, alt: "", width: "inset" },
        { id: "more", type: "text", body: "[Add any details: when it starts, who it's for, what it costs.]", align: "left" },
        { id: "go", type: "button", label: "See the details", href: site, align: "left", style: "solid" },
      ]),
  },
  {
    key: "sale",
    name: "Sale",
    description: "The offer, the deadline in a box, and three things on sale.",
    subject: "[Add the offer], this week only",
    preheader: "Ends [Add the end date].",
    doc: (site) =>
      doc([
        { id: "top", type: "header-photo", image: null, alt: "", heading: "[Add the offer, like 20% off everything]", body: "For our subscribers first, {first name}." },
        { id: "when", type: "highlight", heading: "Ends [Add the end date]", body: "[Add how to get it: a code, or automatic at checkout.]", button: { label: "Shop the sale", href: site } },
        {
          id: "items",
          type: "cards",
          columns: 3,
          cards: [
            { image: null, alt: "", heading: "[Add a product]", body: "[Add the price]" },
            { image: null, alt: "", heading: "[Add a product]", body: "[Add the price]" },
            { image: null, alt: "", heading: "[Add a product]", body: "[Add the price]" },
          ],
        },
        { id: "fine", type: "text", body: "[Add any fine print, like what's not included.]", align: "center" },
      ]),
  },
  {
    key: "event",
    name: "Event invite",
    description: "What, when and where, with a button to say you're coming.",
    subject: "You're invited: [Add the event name]",
    preheader: "[Add the date] at [Add the place]",
    doc: (site) =>
      doc([
        { id: "top", type: "header-photo", image: null, alt: "", heading: "[Add the event name]", body: "Hi {first name}, we'd love to see you there." },
        { id: "what", type: "text", body: "[Add what the event is and why it's worth coming.]", align: "left" },
        { id: "details", type: "highlight", heading: "When and where", body: "[Add the date and time]\n[Add the address]" },
        { id: "rsvp", type: "button", label: "Save my spot", href: site, align: "left", style: "solid" },
      ]),
  },
  {
    key: "letter",
    name: "Simple letter",
    description: "Just words, like a note from you. Often the best-read email of all.",
    subject: "[Add a plain subject, like a note to a friend]",
    preheader: "",
    doc: () => doc([{ id: "letter", type: "text", body: "Hi {first name},\n\n[Add what you want to say. Keep it short and write it the way you'd say it.]", align: "left" }]),
  },
];

/** Fit Funnels: member updates, class schedules, challenges and the intro offer. */
export const CLUB_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: "club-news",
    name: "Club news",
    description: "A photo up top, a short note from the club, then two things members should know.",
    subject: "What's new at {business name}",
    preheader: "[Add a one-line teaser]",
    doc: (site) =>
      doc([
        { id: "top", type: "header-photo", image: null, alt: "", heading: "[Add a headline for this month]", body: "Hi {first name}, here's what's happening at the club." },
        { id: "note", type: "text", body: "[Add a short note: what's new on the floor, in classes or around the club.]", align: "left" },
        {
          id: "picks",
          type: "cards",
          columns: 2,
          cards: [
            { image: null, alt: "", heading: "[Add the first thing, like a new class]", body: "[Add a line about it]", button: { label: "Read more", href: site } },
            { image: null, alt: "", heading: "[Add the second thing, like a coach to meet]", body: "[Add a line about it]", button: { label: "Read more", href: site } },
          ],
        },
        { id: "line", type: "divider", style: "line" },
        { id: "end", type: "text", body: "Questions? Just reply. It comes straight to our team.", align: "left" },
      ]),
  },
  {
    key: "schedule",
    name: "Class schedule",
    description: "What's new or changed on the schedule, in a box, with a button to book.",
    subject: "The class schedule for [Add the week or month]",
    preheader: "[Add one line, like new classes or changed times]",
    doc: (site) =>
      doc([
        { id: "intro", type: "text", heading: "The schedule for [Add the week or month]", body: "Hi {first name},\n\n[Add what's new or changed on the schedule.]", align: "left" },
        { id: "classes", type: "highlight", heading: "New and changed classes", body: "[Add each class, its day and time, one per line]", button: { label: "Book a class", href: site } },
        { id: "booking", type: "text", body: "[Add anything to know before booking, like how far ahead classes open.]", align: "left" },
      ]),
  },
  {
    key: "challenge",
    name: "Challenge",
    description: "A member challenge: what it is, when it runs and how to sign up.",
    subject: "Join the [Add the challenge name]",
    preheader: "Starts [Add the start date].",
    doc: (site) =>
      doc([
        { id: "top", type: "header-photo", image: null, alt: "", heading: "[Add the challenge name]", body: "Hi {first name}, here's something to work on together." },
        { id: "what", type: "text", body: "[Add what the challenge is, who it's for and how it works.]", align: "left" },
        { id: "when", type: "highlight", heading: "Starts [Add the start date]", body: "[Add how long it runs and how to sign up.]", button: { label: "Sign up", href: site } },
        { id: "rules", type: "text", body: "[Add the rules, like how progress is tracked.]", align: "left" },
      ]),
  },
  {
    key: "event",
    name: "Event invite",
    description: "What, when and where, with a button to save a spot.",
    subject: "You're invited: [Add the event name]",
    preheader: "[Add the date] at [Add the place]",
    doc: (site) =>
      doc([
        { id: "top", type: "header-photo", image: null, alt: "", heading: "[Add the event name]", body: "Hi {first name}, we'd love to see you there." },
        { id: "what", type: "text", body: "[Add what the event is, like a member social, an open house or a bring-a-friend day.]", align: "left" },
        { id: "details", type: "highlight", heading: "When and where", body: "[Add the date and time]\n[Add where in the club, or the address]" },
        { id: "rsvp", type: "button", label: "Save my spot", href: site, align: "left", style: "solid" },
      ]),
  },
  {
    key: "intro-offer",
    name: "Intro offer",
    description: "Your intro deal for people thinking about joining, with the deadline in a box.",
    subject: "[Add your intro offer, like your first month for $1]",
    preheader: "Ends [Add the end date].",
    doc: (site) =>
      doc([
        { id: "top", type: "header-photo", image: null, alt: "", heading: "[Add the offer, like 3 classes for $30]", body: "For anyone thinking about joining, {first name}." },
        { id: "when", type: "highlight", heading: "Ends [Add the end date]", body: "[Add how to claim it: a code, online, or at the front desk.]", button: { label: "Claim the offer", href: site } },
        { id: "fine", type: "text", body: "[Add any fine print, like who it's for.]", align: "center" },
      ]),
  },
  {
    key: "letter",
    name: "Simple letter",
    description: "Just words, like a note from the owner or a coach. Often the best-read email of all.",
    subject: "[Add a plain subject, like a note to a friend]",
    preheader: "",
    doc: () => doc([{ id: "letter", type: "text", body: "Hi {first name},\n\n[Add what you want to say. Keep it short and write it the way you'd say it at the front desk.]", align: "left" }]),
  },
];

/** The templates a company starts from, in its edition. */
export function emailTemplatesFor(edition: EditionKey = "bison"): EmailTemplate[] {
  return edition === "fit" ? CLUB_EMAIL_TEMPLATES : EMAIL_TEMPLATES;
}

export function findEmailTemplate(key: unknown, edition: EditionKey = "bison"): EmailTemplate | null {
  return emailTemplatesFor(edition).find((t) => t.key === key) ?? null;
}
