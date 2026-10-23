// Starting content for a section added by hand. Anything only the business
// knows is an [Add ...] placeholder, so nothing made up can go live by accident.
// Fit Funnels clubs get the same sections in club words.
import { type EditionKey, sayFor } from "@/config/editions";
import type { SectionType } from "./schema";

export function starterSection(type: SectionType, brand: string, edition: EditionKey = "bison"): Record<string, unknown> {
  const say = sayFor(edition);
  switch (type) {
    case "hero":
      return {
        type,
        eyebrow: brand,
        headline: say("Say what you do in one line", "Say what the club offers in one line"),
        body: "One or two sentences on who it's for and why it's worth their time.",
        primary: { label: say("Get in touch", "Claim your free pass"), href: "#form" },
        align: "left",
        art: "glow",
      };
    case "features":
      return {
        type,
        heading: say("Why people pick us", "Why people train with us"),
        items: [
          { title: "First reason", body: say("Say what it means for the customer, not what it is.", "Say what it means for the member, not what it is.") },
          { title: "Second reason", body: "Keep it to a sentence or two." },
          { title: "Third reason", body: "Concrete beats clever." },
        ],
      };
    case "steps":
      return {
        type,
        heading: "How it works",
        items: [
          { title: say("Tell us what you need", "Send the form"), body: say("Send the form below. It takes a minute.", "A few details below. It takes a minute.") },
          { title: "We get back to you", body: "[Add how soon you reply]" },
          { title: say("Get started", "Come in and train"), body: say("Say what happens next.", "Say what happens on the first visit.") },
        ],
      };
    case "stats":
      return {
        type,
        items: [
          { value: "[Add a number]", label: "What it counts" },
          { value: "[Add a number]", label: "What it counts" },
          { value: "[Add a number]", label: "What it counts" },
        ],
      };
    case "quote":
      return { type, quote: say("[Add a real customer quote]", "[Add a real member quote]"), name: "[Add their name]", role: say("[Add their company or town]", "[Add how long they've been a member]") };
    case "offer":
      return {
        type,
        heading: "The offer, in plain words",
        price: "[Add the price]",
        note: "[Add when it ends]",
        bullets: ["What's included", "What's included"],
        cta: { label: say("Claim it", "Claim the offer"), href: "#form" },
      };
    case "faq":
      return { type, heading: "Questions", items: [{ q: say("A question people ask before buying", "A question people ask before joining"), a: "[Add the answer]" }] };
    case "form":
      return edition === "fit"
        ?{ type, heading: "Claim your free pass", body: "Leave your details and we'll be in touch to set up your first visit.", fields: ["name", "email", "phone"], submit: "Claim my pass", success: "Thanks. We'll be in touch soon to set up your first visit." }
        : { type, heading: "Get in touch", body: "Tell us a little about what you need.", fields: ["name", "email", "message"], submit: "Send", success: "Thanks. We'll get back to you soon." };
    case "cta":
      return { type, headline: "Ready when you are", body: "One line that makes the next step feel easy.", cta: { label: say("Get started", "Claim your free pass"), href: "#form" } };
    case "text":
      return { type, heading: "A heading", body: "Write as much as you need. A blank line starts a new paragraph." };
  }
}
