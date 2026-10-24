// What the agents write, in each edition's words. Pure: given the facts, the
// words. Drafts never make anything up (no prices, times or offers the company
// didn't give); they're short, friendly and ready to send or edit.
import { type EditionKey, sayFor } from "@/config/editions";
import type { WeekNumbers } from "./roster";

export type EmailDraft = { to: string; name: string; subject: string; body: string; button?: { label: string; href: string } };
export type CampaignDraft = { name: string; startsOn: string; endsOn: string; notes: string; steps: string[] };
export type NewsletterDraft = { subject: string; template: string };
export type LinkDraft = { href: string; label: string };
export type ReadDraft = { lines: string[]; next: string[] };

const first = (name: string) => name.trim().split(/\s+/)[0] || "there";

export function leadReply(edition: EditionKey, club: string, lead: { name: string; email: string; formType: string | null; fields: Record<string, string> }): EmailDraft {
  const say = sayFor(edition);
  const hi = `Hi ${first(lead.name)},`;
  const sign = `The team at ${club}`;
  const asked = lead.fields.message?.trim();
  if (lead.formType === "kiosk-pass") {
    return {
      to: lead.email,
      name: lead.name,
      subject: `Your free pass at ${club}`,
      body: `${hi}\n\nThanks for stopping by ${club}. Your free pass is ready. Next time you come in, give your name at the front desk and we'll get you started.\n\nIf you have any questions before then, just reply to this email.\n\n${sign}`,
    };
  }
  if (lead.formType === "kiosk-tour") {
    const when = lead.fields.when ? ` You said ${lead.fields.when.toLowerCase()} works best.` : "";
    return {
      to: lead.email,
      name: lead.name,
      subject: `Your tour of ${club}`,
      body: `${hi}\n\nThanks for asking about a tour.${when} Reply with a day and time that suits you, and we'll have someone ready to show you around.\n\n${sign}`,
    };
  }
  return {
    to: lead.email,
    name: lead.name,
    subject: say(`Thanks for getting in touch with ${club}`, `Thanks for your interest in ${club}`),
    body: `${hi}\n\n${say(`Thanks for reaching out to ${club}.`, `Thanks for your interest in ${club}.`)}${asked ? ` You asked: "${asked.slice(0, 300)}"` : ""}\n\n${say("We'll get back to you with everything you need. If it's easier to talk, reply with a good time to call.", "We'd love to have you in. Reply with a good time to come by, or any questions you have, and we'll take it from there.")}\n\n${sign}`,
  };
}

export function cartNudge(edition: EditionKey, club: string, cart: { email: string; name: string; item: string | null; shopUrl: string }): EmailDraft {
  const say = sayFor(edition);
  const what = cart.item ?? say("your cart", "your membership");
  return {
    to: cart.email,
    name: cart.name,
    subject: say(`Still thinking about ${what}?`, `Still thinking about joining ${club}?`),
    body: `Hi ${first(cart.name)},\n\n${say(`You left ${what} in your cart at ${club}. It's still there if you want it.`, `You started joining ${club} but didn't finish. Your spot is still here when you're ready.`)}\n\n${say("If anything got in the way, just reply and we'll help.", "If you have a question about memberships or classes, just reply and we'll help.")}\n\nThe team at ${club}`,
    button: { label: say("Back to the shop", "Finish joining"), href: cart.shopUrl },
  };
}

export function estimateNudge(edition: EditionKey, club: string, e: { email: string; name: string; number: number; title: string; url: string }): EmailDraft {
  const say = sayFor(edition);
  const noun = say("estimate", "quote");
  return {
    to: e.email,
    name: e.name,
    subject: `Following up on ${noun} #${e.number}${e.title ? `, ${e.title}` : ""}`,
    body: `Hi ${first(e.name)},\n\nJust checking in on the ${noun} we sent. You can look it over, approve it or ask for changes from the link below.\n\nIf you have questions, reply here and we'll sort them out.\n\nThe team at ${club}`,
    button: { label: `See the ${noun}`, href: e.url },
  };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A campaign for next month, named for the season. */
export function campaignPlan(edition: EditionKey, now: Date): CampaignDraft {
  const say = sayFor(edition);
  // Late in the month, plan next month; otherwise the rest of this one.
  const next = now.getUTCDate() > 20;
  const start = next ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const m = start.getUTCMonth();
  const y = start.getUTCFullYear();
  const end = new Date(Date.UTC(y, m + 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const name =
    edition === "fit"
      ? m === 0
        ? "New Year challenge"
        : m <= 2
          ? "Spring reset"
          : m <= 5
            ? "Summer shape-up"
            : m <= 8
              ? "Back to routine"
              : m === 10
                ? "Holiday membership drive"
                : `${MONTHS[m]} membership drive`
      : m === 10 || m === 11
        ? "Holiday sale"
        : m <= 1
          ? "New year launch"
          : m <= 4
            ? "Spring launch"
            : `${MONTHS[m]} push`;
  return {
    name: `${name} ${y}`,
    startsOn: iso(start),
    endsOn: iso(end),
    notes: say(`A ${MONTHS[m]} push to bring in new customers.`, `A ${MONTHS[m]} push to bring in new members.`),
    steps: say(
      "Build a landing page with one clear offer|Send a newsletter to announce it|Upload graphics for social posts|Turn on a follow-up series for people who ask",
      "Build a funnel page with a free pass or intro offer|Send a newsletter to members and leads|Upload graphics for social posts and the lobby screen|Turn on a follow-up series for new leads",
    ).split("|"),
  };
}

const pct = (now: number, before: number) => (before === 0 ? (now > 0 ? "up from none" : "the same") : `${now >= before ? "up" : "down"} ${Math.round((Math.abs(now - before) / before) * 100)}%`);

export function weeklyRead(edition: EditionKey, week: WeekNumbers, before: WeekNumbers, open: { kind: string; count: number }[]): ReadDraft {
  const say = sayFor(edition);
  const lines = [
    `${week.visitors} website visitors, ${pct(week.visitors, before.visitors)} on the week before.`,
    `${week.leads} new ${say("leads", "leads")}, ${pct(week.leads, before.leads)}.`,
    ...(edition === "fit" ? [`${week.checkIns} check-ins at the front desk, ${pct(week.checkIns, before.checkIns)}.`] : []),
    `${week.joins} ${say("orders", "joins and purchases")}, ${pct(week.joins, before.joins)}.`,
  ];
  const next: string[] = [];
  const count = (k: string) => open.find((o) => o.kind === k)?.count ?? 0;
  if (count("lead-reply")) next.push(`Answer the ${count("lead-reply")} new ${count("lead-reply") === 1 ? "lead" : "leads"} waiting. Replies in the first day do best.`);
  if (count("cart-nudge")) next.push(say(`Nudge the ${count("cart-nudge")} left-behind carts.`, `Nudge the ${count("cart-nudge")} people who didn't finish joining.`));
  if (count("campaign-plan")) next.push("Start next month's campaign so it's ready in time.");
  if (count("fill-placeholders")) next.push("Finish the pages that still have spots to fill in.");
  if (week.leads < before.leads && !next.length) next.push(say("Leads are down. Try a fresh offer on your best landing page.", "Leads are down. Try a free pass or intro offer on your best funnel page."));
  if (!next.length) next.push("Keep it going. Nothing urgent this week.");
  return { lines, next: next.slice(0, 4) };
}
