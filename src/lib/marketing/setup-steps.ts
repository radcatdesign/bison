// Step-by-step setup for every Marketing tool. Pure: it takes plain facts about
// a company (what's saved, what's verified, how many subscribers) and returns
// each tool's steps and whether each one is done. The server fills the facts
// from the database; the demo fills them from the visitor's browser.

export type SetupFacts = {
  /** Owners and admins can set up sending; everyone else is pointed to them. */
  canManageSettings: boolean;
  sending: { domain: boolean; verified: boolean; tested: boolean };
  brand: { saved: boolean; logo: boolean; address: boolean };
  signup: { saved: boolean; formOnPage: boolean };
  subscribers: { count: number; lists: number };
  series: { starterReady: boolean; anyOn: boolean };
  newsletters: { count: number; tested: boolean; sentOrScheduled: boolean };
  offer: { saved: boolean; on: boolean; inEmail: boolean };
  search: { described: boolean; contact: boolean; publishedPage: boolean; submitted: boolean };
};

export type ToolKey = "sending" | "brand" | "subscribers" | "series" | "newsletters" | "offer" | "search";

export type SetupStep = {
  key: string;
  title: string;
  /** What to do and why it matters, in a sentence or two. */
  body: string;
  done: boolean;
  href: string;
  cta: string;
  optional?: boolean;
  /** Set when this person's role can't do the step, with who can. */
  blockedNote?: string;
  /** Steps nobody can check for you get a "Mark as done" button. */
  manual?: boolean;
};

export type ToolSetup = { key: ToolKey; name: string; href: string; summary: string; optional?: boolean; steps: SetupStep[] };

export function buildSetup(f: SetupFacts): ToolSetup[] {
  const owner = f.canManageSettings ? undefined : "An owner or admin on your team does this step.";
  return [
    {
      key: "sending",
      name: "Email sending",
      href: "/settings/email",
      summary: "Send from your own domain, so your email lands in inboxes and carries your name.",
      steps: [
        {
          key: "sending.domain",
          title: "Add the domain you'll send from",
          body: "Use a subdomain like mail.yourcompany.com. It keeps marketing email apart from your everyday inbox and protects your main domain's reputation.",
          done: f.sending.domain,
          href: "/settings/email#domain",
          cta: "Add domain",
          blockedNote: owner,
        },
        {
          key: "sending.verify",
          title: "Add the DNS records and verify",
          body: "Copy three records into wherever your domain's DNS is managed, like GoDaddy, Cloudflare or Squarespace. We check until they're live, usually within an hour.",
          done: f.sending.verified,
          href: "/settings/email#records",
          cta: "Show the records",
          blockedNote: owner,
        },
        {
          key: "sending.test",
          title: "Send yourself a test",
          body: "See exactly what subscribers get, in your own inbox, from your own address.",
          done: f.sending.tested,
          href: "/settings/email#test",
          cta: "Send a test",
        },
      ],
    },
    {
      key: "brand",
      name: "Brand kit",
      href: "/marketing/brand",
      summary: "Your logo, colors, fonts and sign-off, set once and used in every email.",
      steps: [
        {
          key: "brand.look",
          title: "Set your colors and fonts",
          body: "Start from your brand color. Every newsletter and series email uses these, so you won't pick them again.",
          done: f.brand.saved,
          href: "/marketing/brand#colors",
          cta: "Set colors",
        },
        {
          key: "brand.logo",
          title: "Add your logo",
          body: "It sits in the header bar of every email. A PNG with a transparent background works best.",
          done: f.brand.logo,
          href: "/marketing/brand#logo",
          cta: "Upload a logo",
          optional: true,
        },
        {
          key: "brand.address",
          title: "Add your postal address",
          body: "The law requires a real postal address in every marketing email (CAN-SPAM in the US, and similar rules elsewhere). A PO box is fine. Sending waits until it's filled in.",
          done: f.brand.address,
          href: "/marketing/brand#footer",
          cta: "Add the address",
        },
      ],
    },
    {
      key: "subscribers",
      name: "Subscribers",
      href: "/marketing/subscribers",
      summary: "Everyone who agreed to hear from you, with one-click unsubscribe built in.",
      steps: [
        {
          key: "subscribers.types",
          title: 'Choose your "I am a..." options',
          body: "Signup forms ask people what kind of customer they are, so you can send each group what fits them. We started you with a few.",
          done: f.signup.saved,
          href: "/marketing/subscribers#signup",
          cta: "Review the options",
        },
        {
          key: "subscribers.add",
          title: "Bring in your subscribers",
          body: "Import a spreadsheet exported from your old email tool, or add people one at a time. Only add people who agreed to get email from you.",
          done: f.subscribers.count > 0,
          href: "/marketing/subscribers#add",
          cta: "Import or add",
        },
        {
          key: "subscribers.lists",
          title: "Group people into lists",
          body: "Lists let you send to just homeowners, or just wholesale buyers. Skip this if you send everything to everyone.",
          done: f.subscribers.lists > 0,
          href: "/marketing/subscribers#lists",
          cta: "Make a list",
          optional: true,
        },
        {
          key: "subscribers.form",
          title: "Put a signup form on a landing page",
          body: 'Open any page, edit its form and turn on "Add to email list". New signups land here and get your welcome series.',
          done: f.signup.formOnPage,
          href: "/marketing/pages",
          cta: "Open Pages",
        },
      ],
    },
    {
      key: "series",
      name: "Welcome series",
      href: "/marketing/series",
      summary: "Emails that go out on their own, a set number of days after someone joins.",
      steps: [
        {
          key: "series.fill",
          title: "Fill in your welcome emails",
          body: "Three emails are written for you. Fill in the yellow spots with the things only you know, like what you're known for.",
          done: f.series.starterReady,
          href: "/marketing/series",
          cta: "Open the welcome series",
        },
        {
          key: "series.on",
          title: "Turn the series on",
          body: "From then on, everyone who joins your list gets the first email right away and the rest on schedule.",
          done: f.series.anyOn,
          href: "/marketing/series",
          cta: "Turn it on",
        },
      ],
    },
    {
      key: "newsletters",
      name: "Newsletters",
      href: "/marketing/newsletters",
      summary: "Build an email on the email itself, test it, then send it or schedule it.",
      steps: [
        {
          key: "newsletters.start",
          title: "Start your first newsletter",
          body: "Pick a template or start blank. Click any part of the email to change it.",
          done: f.newsletters.count > 0,
          href: "/marketing/newsletters",
          cta: "Start one",
        },
        {
          key: "newsletters.test",
          title: "Send yourself a test",
          body: "Check it on your phone and your computer before anyone else sees it.",
          done: f.newsletters.tested,
          href: "/marketing/newsletters",
          cta: "Open newsletters",
        },
        {
          key: "newsletters.send",
          title: "Send it or schedule it",
          body: "Send to everyone or one list, now or up to 30 days ahead.",
          done: f.newsletters.sentOrScheduled,
          href: "/marketing/newsletters",
          cta: "Open newsletters",
        },
      ],
    },
    {
      key: "offer",
      name: "Welcome offer",
      href: "/marketing/offer",
      summary: "An optional one-time code for each new subscriber, for their first order.",
      optional: true,
      steps: [
        {
          key: "offer.choose",
          title: "Choose the discount",
          body: "A percent or an amount off, and how long each code lasts. Codes are for first-time buyers only, one per person.",
          done: f.offer.saved,
          href: "/marketing/offer",
          cta: "Set the offer",
        },
        {
          key: "offer.email",
          title: "Put the code in your welcome email",
          body: 'Add a "Welcome offer code" section to the first email of your welcome series. Each person sees their own code.',
          done: f.offer.inEmail,
          href: "/marketing/series",
          cta: "Open the welcome series",
        },
        {
          key: "offer.on",
          title: "Turn the offer on",
          body: "New signups get a code from then on. People already on your list don't.",
          done: f.offer.on,
          href: "/marketing/offer",
          cta: "Turn it on",
        },
      ],
    },
    {
      key: "search",
      name: "Search pack",
      href: "/marketing/search",
      summary: "What Google and AI assistants read about you: titles, social cards, sitemap and llms.txt.",
      steps: [
        {
          key: "search.describe",
          title: "Describe your business",
          body: "A plain paragraph on what you do and who for. Search engines and AI assistants quote it when people ask about businesses like yours.",
          done: f.search.described,
          href: "/marketing/search#business",
          cta: "Write it",
        },
        {
          key: "search.contact",
          title: "Add your phone, email and hours",
          body: "Shown to search engines as structured data, so they can answer questions like \"Are they open Saturday?\"",
          done: f.search.contact,
          href: "/marketing/search#business",
          cta: "Add details",
        },
        {
          key: "search.page",
          title: "Publish a landing page",
          body: "Published pages get titles, social cards and structured data on their own, and go in your sitemap and llms.txt.",
          done: f.search.publishedPage,
          href: "/marketing/pages",
          cta: "Open Pages",
        },
        {
          key: "search.submit",
          title: "Tell Google and Bing about your sitemap",
          body: "Paste your sitemap address into Google Search Console and Bing Webmaster Tools. Nobody can check this for you, so mark it done when it's in.",
          done: f.search.submitted,
          href: "/marketing/search#files",
          cta: "Show the addresses",
          manual: true,
        },
      ],
    },
  ];
}

export type SetupProgress = { done: number; total: number; next: (SetupStep & { tool: ToolSetup }) | null };

/** Required steps only: optional ones never hold up "done". */
export function progressOf(tools: ToolSetup[]): SetupProgress {
  let done = 0;
  let total = 0;
  let next: SetupProgress["next"] = null;
  for (const tool of tools) {
    if (tool.optional) continue;
    for (const step of tool.steps) {
      if (step.optional) continue;
      total++;
      if (step.done) done++;
      else if (!next) next = { ...step, tool };
    }
  }
  return { done, total, next };
}

export function toolProgress(tool: ToolSetup): { done: number; total: number; complete: boolean } {
  const required = tool.steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  return { done, total: required.length, complete: done === required.length };
}
