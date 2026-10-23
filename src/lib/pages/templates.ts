// Starting content for a section added by hand. Anything only the business
// knows is an [Add ...] placeholder, so nothing made up can go live by accident.
import type { SectionType } from "./schema";

export function starterSection(type: SectionType, brand: string): Record<string, unknown> {
  switch (type) {
    case "hero":
      return {
        type,
        eyebrow: brand,
        headline: "Say what you do in one line",
        body: "One or two sentences on who it's for and why it's worth their time.",
        primary: { label: "Get in touch", href: "#form" },
        align: "left",
        art: "glow",
      };
    case "features":
      return {
        type,
        heading: "Why people pick us",
        items: [
          { title: "First reason", body: "Say what it means for the customer, not what it is." },
          { title: "Second reason", body: "Keep it to a sentence or two." },
          { title: "Third reason", body: "Concrete beats clever." },
        ],
      };
    case "steps":
      return {
        type,
        heading: "How it works",
        items: [
          { title: "Tell us what you need", body: "Send the form below. It takes a minute." },
          { title: "We get back to you", body: "[Add how soon you reply]" },
          { title: "Get started", body: "Say what happens next." },
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
      return { type, quote: "[Add a real customer quote]", name: "[Add their name]", role: "[Add their company or town]" };
    case "offer":
      return { type, heading: "The offer, in plain words", price: "[Add the price]", note: "[Add when it ends]", bullets: ["What's included", "What's included"], cta: { label: "Claim it", href: "#form" } };
    case "faq":
      return { type, heading: "Questions", items: [{ q: "A question people ask before buying", a: "[Add the answer]" }] };
    case "form":
      return { type, heading: "Get in touch", body: "Tell us a little about what you need.", fields: ["name", "email", "message"], submit: "Send", success: "Thanks. We'll get back to you soon." };
    case "cta":
      return { type, headline: "Ready when you are", body: "One line that makes the next step feel easy.", cta: { label: "Get started", href: "#form" } };
    case "text":
      return { type, heading: "A heading", body: "Write as much as you need. A blank line starts a new paragraph." };
  }
}
