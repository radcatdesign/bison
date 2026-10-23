// The Updates page. Newest first. Write each change the way a tenant would say it.

export type Release = { version: string; date: string; title: string; changes: string[] };

export const RELEASES: Release[] = [
  {
    version: "0.3.0",
    date: "2026-10-23",
    title: "Marketing",
    changes: [
      "Marketing Setup walks you through every tool, step by step, in the order that works best. Each step ticks off as soon as it's really done.",
      "Send email from your own domain. Add it in Settings, copy three DNS records (with steps for Cloudflare, GoDaddy, Namecheap and Squarespace), and we check until it's live. No passwords or API keys.",
      "Brand kit: your logo, colors, fonts, button style, address and social links, set once and used in every email and new page.",
      "Newsletters: build on the email itself, from a template or blank. Test it, then send now or schedule it for one list or everyone. See how many were delivered, bounced and unsubscribed.",
      "Email series that go out on their own, a set number of days after someone joins, sends a form, or you start them for a list. A three-email welcome series is written for you.",
      "Subscribers: import a CSV from your old tool, add people by hand, make lists, and choose the \"I am a...\" options on signup forms. Export any time.",
      "Turn on \"Add to email list\" on any landing page form to grow your list. New signups get your welcome series.",
      "Every email has a one-click unsubscribe, including the button Gmail and Apple Mail show. Unsubscribes, bounces and spam complaints are never emailed again.",
      "Welcome offer: a one-time code for each new subscriber, shown in your welcome email.",
      "Search pack: titles, social cards, structured data, a sitemap and llms.txt for every published page, built from your business details. Keep AI crawlers out with one switch.",
      "In the demo, try all of it in your browser. Sending is pretend.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-10-22",
    title: "Pages",
    changes: [
      "Build landing pages by describing them. The agent builds the page section by section while you watch, and changes it when you ask.",
      "Start from one of eight templates: quote request, product launch, seasonal sale, consultation, event, trade program, free guide or simple contact. Each opens with your company name and brand color already in.",
      "Edit any section by hand, reorder sections, and pick colors, type and corners. Undo takes back any change.",
      "Preview every page at desktop, tablet and phone size.",
      "The agent never makes up prices, dates, reviews or numbers. It marks what only you know in yellow, and a page can't go live until those are filled in.",
      "Publish a page to its own address. Its form sends go straight to Contacts, with bots filtered out.",
      "The Bison mark, in the sidebar, on sign-in and as the app icon.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-10-21",
    title: "Foundation",
    changes: [
      "Your company's data is kept apart from every other company's by the database itself.",
      "Analyze, Marketing and Sales modes, with the last one you used remembered.",
      "Locked modules show what they do and an Unlock button instead of an empty page.",
      "Start a 14-day trial of any module from Settings. No card needed.",
      "Sample data fills every screen until your own data arrives. Nothing is saved while it's on.",
      "Every number has a ? that explains how it's measured.",
      "Works as a home-screen app on your phone, with pull down to refresh.",
      "People who join your team without an invite wait for an owner or admin to approve them.",
      "A public demo with two made-up companies, for showing Bison Ops to anyone.",
      "A new look, with light and dark mode. Pick Match my device, Light or Dark in the sidebar.",
      "Landing pages: every page people arrive on, with a live preview at desktop, tablet and phone size, and how each one performs.",
      "In the demo, owners can unlock Marketing, Sales and add-ons with a trial or subscription. It stays on in that browser until you reset it.",
    ],
  },
];
