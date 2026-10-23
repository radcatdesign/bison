// Newsletter templates to start from. Facts only the business knows are left
// as [Add ...] spots, so nothing goes out with made-up dates, prices or claims.
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

export function findEmailTemplate(key: unknown): EmailTemplate | null {
  return EMAIL_TEMPLATES.find((t) => t.key === key) ?? null;
}
