// Step-by-step setup for every Marketing tool. Pure: it takes plain facts about
// a company (what's saved, what's verified, how many subscribers) and returns
// each tool's steps and whether each one is done. The server fills the facts
// from the database; the demo fills them from the visitor's browser. Each line
// reads right in its edition: say("Bison Ops words", "Fit Funnels words").
import { type EditionKey, sayFor } from "@/config/editions";

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
  /** A/B tests on landing pages. `canStart` is false for roles that can't publish pages. */
  tests: { publishedPage: boolean; created: boolean; started: boolean; ended: boolean; canStart: boolean };
};

export type ToolKey = "sending" | "brand" | "subscribers" | "series" | "newsletters" | "offer" | "search" | "tests";

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

export type ToolSetup<K extends string = ToolKey> = { key: K; name: string; href: string; summary: string; optional?: boolean; steps: SetupStep[] };

export function buildSetup(f: SetupFacts, edition: EditionKey = "bison"): ToolSetup[] {
  const say = sayFor(edition);
  const owner = f.canManageSettings ? undefined : "An owner or admin on your team does this step.";
  return [
    {
      key: "sending",
      name: "Email sending",
      href: "/settings/email",
      summary: say("Send from your own domain, so your email lands in inboxes and carries your name.", "Send from your club's own domain, so your email lands in inboxes and carries your name."),
      steps: [
        {
          key: "sending.domain",
          title: "Add the domain you'll send from",
          body: say(
            "Use a subdomain like mail.yourcompany.com. It keeps marketing email apart from your everyday inbox and protects your main domain's reputation.",
            "Use a subdomain like mail.yourclub.com. It keeps marketing email apart from your front desk inbox and protects your main domain's reputation.",
          ),
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
          body: say("See exactly what subscribers get, in your own inbox, from your own address.", "See exactly what members and leads get, in your own inbox, from your own address."),
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
          body: say("Start from your brand color. Every newsletter and series email uses these, so you won't pick them again.", "Start from your club's color. Every newsletter and follow-up uses these, so you won't pick them again."),
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
      summary: say("Everyone who agreed to hear from you, with one-click unsubscribe built in.", "Members and leads who agreed to hear from you, with one-click unsubscribe built in."),
      steps: [
        {
          key: "subscribers.types",
          title: 'Choose your "I am a..." options',
          body: say(
            "Signup forms ask people what kind of customer they are, so you can send each group what fits them. We started you with a few.",
            "Signup forms ask people where they stand with your club, like thinking about joining or already a member, so you can send each group what fits them. We started you with a few.",
          ),
          done: f.signup.saved,
          href: "/marketing/subscribers#signup",
          cta: "Review the options",
        },
        {
          key: "subscribers.add",
          title: "Bring in your subscribers",
          body: say(
            "Import a spreadsheet exported from your old email tool, or add people one at a time. Only add people who agreed to get email from you.",
            "Import a spreadsheet exported from your old email tool or member software, or add people one at a time. Only add people who agreed to get email from you.",
          ),
          done: f.subscribers.count > 0,
          href: "/marketing/subscribers#add",
          cta: "Import or add",
        },
        {
          key: "subscribers.lists",
          title: "Group people into lists",
          body: say("Lists let you send to just homeowners, or just wholesale buyers. Skip this if you send everything to everyone.", "Lists let you send to just members, or just trial leads. Skip this if you send everything to everyone."),
          done: f.subscribers.lists > 0,
          href: "/marketing/subscribers#lists",
          cta: "Make a list",
          optional: true,
        },
        {
          key: "subscribers.form",
          title: say("Put a signup form on a landing page", "Put a signup form on a funnel page"),
          body: say('Open any page, edit its form and turn on "Add to email list". New signups land here and get your welcome series.', 'Open any funnel page, edit its form and turn on "Add to email list". New signups land here and get your new lead follow-up.'),
          done: f.signup.formOnPage,
          href: "/marketing/pages",
          cta: say("Open Pages", "Open Funnel pages"),
        },
      ],
    },
    {
      key: "series",
      name: say("Welcome series", "Follow-ups"),
      href: "/marketing/series",
      summary: say("Emails that go out on their own, a set number of days after someone joins.", "Emails that go out on their own, a set number of days after a lead signs up or a member joins."),
      steps: [
        {
          key: "series.fill",
          title: say("Fill in your welcome emails", "Fill in your new lead follow-up"),
          body: say(
            "Three emails are written for you. Fill in the yellow spots with the things only you know, like what you're known for.",
            "Three emails are written for you. Fill in the yellow spots with the things only your club knows, like how to book a first visit.",
          ),
          done: f.series.starterReady,
          href: "/marketing/series",
          cta: say("Open the welcome series", "Open the follow-ups"),
        },
        {
          key: "series.on",
          title: say("Turn the series on", "Turn the follow-up on"),
          body: say("From then on, everyone who joins your list gets the first email right away and the rest on schedule.", "From then on, every new lead who joins your list gets the first email right away and the rest on schedule."),
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
      summary: say("Build an email on the email itself, test it, then send it or schedule it.", "Member updates, class schedules and challenges. Build the email on the email itself, test it, then send it or schedule it."),
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
          body: say("Send to everyone or one list, now or up to 30 days ahead.", "Send to everyone or one list, like just your members, now or up to 30 days ahead."),
          done: f.newsletters.sentOrScheduled,
          href: "/marketing/newsletters",
          cta: "Open newsletters",
        },
      ],
    },
    {
      key: "offer",
      name: say("Welcome offer", "Intro offer"),
      href: "/marketing/offer",
      summary: say("An optional one-time code for each new subscriber, for their first order.", "An optional one-time code for each new lead, for their first membership, class pack or intro deal."),
      optional: true,
      steps: [
        {
          key: "offer.choose",
          title: say("Choose the discount", "Choose the offer"),
          body: say("A percent or an amount off, and how long each code lasts. Codes are for first-time buyers only, one per person.", "A percent or a dollar amount off, and how long each code lasts. Codes work on a first purchase only, one per person."),
          done: f.offer.saved,
          href: "/marketing/offer",
          cta: "Set the offer",
        },
        {
          key: "offer.email",
          title: say("Put the code in your welcome email", "Put the code in your new lead follow-up"),
          body: say('Add a "Welcome offer code" section to the first email of your welcome series. Each person sees their own code.', 'Add an "Intro offer code" section to the first email of your new lead follow-up. Each person sees their own code.'),
          done: f.offer.inEmail,
          href: "/marketing/series",
          cta: say("Open the welcome series", "Open the follow-ups"),
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
          body: say(
            "A plain paragraph on what you do and who for. Search engines and AI assistants quote it when people ask about businesses like yours.",
            "A plain paragraph on your club: what you offer, who it's for and where. Search engines and AI assistants quote it when people ask about gyms and studios nearby.",
          ),
          done: f.search.described,
          href: "/marketing/search#business",
          cta: "Write it",
        },
        {
          key: "search.contact",
          title: "Add your phone, email and hours",
          body: say('Shown to search engines as structured data, so they can answer questions like "Are they open Saturday?"', 'Shown to search engines as structured data, so they can answer questions like "Is the gym open Sunday morning?"'),
          done: f.search.contact,
          href: "/marketing/search#business",
          cta: "Add details",
        },
        {
          key: "search.page",
          title: say("Publish a landing page", "Publish a funnel page"),
          body: say("Published pages get titles, social cards and structured data on their own, and go in your sitemap and llms.txt.", "Published funnel pages get titles, social cards and structured data on their own, and go in your sitemap and llms.txt."),
          done: f.search.publishedPage,
          href: "/marketing/pages",
          cta: say("Open Pages", "Open Funnel pages"),
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
    {
      key: "tests",
      name: "A/B tests",
      href: "/marketing/tests",
      summary: say("Show visitors two or three versions of a landing page and keep the one that gets more form sends or clicks.", "Show visitors two or three versions of a funnel page and keep the one that gets more sign-ups or clicks."),
      optional: true,
      steps: [
        {
          key: "tests.page",
          title: say("Publish the page you want to improve", "Publish the funnel page you want to improve"),
          body: say("A test compares the live page with versions of it, so the page has to be live first. Pick one that already gets visitors.", "A test compares the live page with versions of it, so the page has to be live first. Pick one that already gets visitors, like your free pass page."),
          done: f.tests.publishedPage,
          href: "/marketing/pages",
          cta: say("Open Pages", "Open Funnel pages"),
        },
        {
          key: "tests.version",
          title: "Make a version to compare",
          body: say("Start a test and B begins as a copy of the live page. Change one thing, like the headline or the button, so you know what made the difference.", "Start a test and B begins as a copy of the live page. Change one thing, like the headline or the offer button, so you know what made the difference."),
          done: f.tests.created,
          href: "/marketing/tests",
          cta: "New test",
        },
        {
          key: "tests.start",
          title: "Start the test",
          body: "Visitors are split between the page as it is (A) and your version. Each person sees the same one every time they come back.",
          done: f.tests.started,
          href: "/marketing/tests",
          cta: "Open tests",
          blockedNote: f.tests.canStart ? undefined : "Someone who can publish pages starts the test.",
        },
        {
          key: "tests.keep",
          title: "Keep the winner",
          body: "Give it at least a week and 100 visitors on each version. When the results say one is clearly ahead, end the test and keep it. It goes live right away.",
          done: f.tests.ended,
          href: "/marketing/tests",
          cta: "See results",
          blockedNote: f.tests.canStart ? undefined : "Someone who can publish pages ends the test.",
        },
      ],
    },
  ];
}

export type SetupProgress<K extends string = ToolKey> = { done: number; total: number; next: (SetupStep & { tool: ToolSetup<K> }) | null };

/** Required steps only: optional ones never hold up "done". */
export function progressOf<K extends string>(tools: ToolSetup<K>[]): SetupProgress<K> {
  let done = 0;
  let total = 0;
  let next: SetupProgress<K>["next"] = null;
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

export function toolProgress(tool: ToolSetup<string>): { done: number; total: number; complete: boolean } {
  const required = tool.steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  return { done, total: required.length, complete: done === required.length };
}
