import { AppWindow, ArrowRight, BadgePercent, Mail, Palette, Repeat, ScanSearch, Send, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { marketingGate } from "@/components/marketing/gate";
import { SetupProgress } from "@/components/marketing/setup-progress";
import { Metric, MetricStrip, PageHeader } from "@/components/ui";
import { CATALOG } from "@/config/catalog";
import { daysLeft } from "@/lib/access/entitlements";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { emailsThisMonth } from "@/lib/marketing/people";
import { isVerified, readSending } from "@/lib/marketing/sending";
import { ensureStarterSeries } from "@/lib/marketing/series";
import { loadSetup } from "@/lib/marketing/setup";
import { subscribersRepo } from "@/lib/marketing/subscribers";
import { monthlyEmailLimit } from "@/lib/marketing/worker";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { sampleLists, sampleSubscribers } from "@/lib/sample/marketing";
import { formatWhen } from "@/lib/time";
import h from "./overview.module.css";

export const metadata: Metadata = { title: "Marketing" };

const TOOLS = [
  { href: "/marketing/newsletters", name: "Newsletters", body: "Build an email on the email itself, test it, send or schedule it.", icon: Mail },
  { href: "/marketing/series", name: "Email series", body: "Emails that go out on their own, days after someone joins or sends a form.", icon: Repeat },
  { href: "/marketing/subscribers", name: "Subscribers", body: "Your list, lists inside it, imports, and who unsubscribed.", icon: Users },
  { href: "/marketing/pages", name: "Pages", body: "Landing pages the agent builds while you watch. Forms send to Contacts.", icon: AppWindow },
  { href: "/marketing/brand", name: "Brand kit", body: "Logo, colors, fonts and sign-off, used in every email.", icon: Palette },
  { href: "/marketing/offer", name: "Welcome offer", body: "A one-time code for each new subscriber's first order.", icon: BadgePercent },
  { href: "/marketing/search", name: "Search pack", body: "Titles, social cards, sitemap and llms.txt from your content.", icon: ScanSearch },
  { href: "/settings/email", name: "Email sending", body: "Send from your own verified domain.", icon: Send },
];

async function Body() {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.newsletters");
  if (blocked) return blocked;
  const demo = demoMode();
  const state = ctx.tenant.access.states["module:marketing"];
  const status =
    state.via === "trial" && state.trialEndsAt
      ? `${CATALOG["module:marketing"].name} trial: ${daysLeft(state.trialEndsAt)} days left.`
      : state.pastDue
        ? "Your last payment didn't go through. Update your card in Settings to keep this on."
        : null;
  const limit = monthlyEmailLimit();
  const sample = demo || ctx.settings.sampleData;
  const stats = await subscribersRepo({ scope: scopeOf(ctx), tenant: ctx.tenant, sampleData: sample }).stats();

  let sent = Math.round(stats.subscribed * 1.6);
  let next: { subject: string; at: Date } | null = null;
  let sendingNote = "Not set up yet";
  let seriesOn = 0;
  let tools = null;
  if (!demo) {
    const loaded = await withTenant(scopeOf(ctx), async (tx) => {
      await ensureStarterSeries(tx, ctx.sites[0]?.domain);
      return {
        used: await emailsThisMonth(tx),
        next: await tx.selectFrom("newsletters").select(["subject", "scheduled_for"]).where("status", "=", "scheduled").orderBy("scheduled_for").limit(1).executeTakeFirst(),
        sending: await readSending(tx),
        on: (await tx.selectFrom("sequences").select("id").where("status", "=", "on").execute()).length,
      };
    });
    if (!sample) sent = loaded.used;
    next = loaded.next?.scheduled_for ? { subject: loaded.next.subject, at: loaded.next.scheduled_for } : null;
    sendingNote = isVerified(loaded.sending) ? `From ${loaded.sending.domain}` : loaded.sending.domain ? `Waiting on DNS for ${loaded.sending.domain}` : "Not set up yet";
    seriesOn = loaded.on;
    tools = await loadSetup(ctx);
  }
  const subs = demo ? sampleSubscribers(ctx.tenant).filter((x) => x.status === "subscribed").length : 0;

  return (
    <div data-testid="module-marketing">
      <PageHeader title="Marketing" note="Landing pages and email, in your own colors." />
      {status && (
        <p className="notice" style={{ marginBottom: 20 }}>
          {status}
        </p>
      )}
      <SetupProgress tools={tools} demo={demo ? { tenantId: ctx.tenant.id, base: { subscribers: subs, lists: sampleLists(ctx.tenant).length } } : null} />

      <div style={{ height: 24 }} />
      <MetricStrip>
        <Metric label="Subscribed" value={stats.subscribed.toLocaleString("en-US")} testId="metric-subscribed" help={<p>People on your list who can get email right now.{sample ? " Sample data is on, so this is made up." : ""}</p>} />
        <Metric label="New in 30 days" value={stats.new30.toLocaleString("en-US")} help={<p>People who joined in the last 30 days and are still subscribed.</p>} />
        <Metric label="Emails this month" value={`${sent.toLocaleString("en-US")}`} help={<p>Newsletters, series emails and tests sent or waiting to send since the 1st (UTC). Your plan includes {limit.toLocaleString("en-US")} a month.</p>} />
        <Metric label="Unsubscribed in 30 days" value={stats.unsubscribed30.toLocaleString("en-US")} help={<p>Unsubscribes, spam complaints and hard bounces in the last 30 days.</p>} />
      </MetricStrip>

      <div className={h.now}>
        <div className={`card ${h.nowCard}`}>
          <span className={h.label}>Next newsletter</span>
          {next ? (
            <>
              <strong>{next.subject}</strong>
              <span className="muted">{formatWhen(next.at, ctx.settings.timezone)}</span>
            </>
          ) : (
            <>
              <strong>Nothing scheduled</strong>
              <Link href="/marketing/newsletters" className="link">
                Start one
              </Link>
            </>
          )}
        </div>
        <div className={`card ${h.nowCard}`}>
          <span className={h.label}>Email series</span>
          <strong>{demo ? "Welcome series" : seriesOn ? `${seriesOn} on` : "None on yet"}</strong>
          <Link href="/marketing/series" className="link">
            {seriesOn ? "See them" : "Turn on the welcome series"}
          </Link>
        </div>
        <div className={`card ${h.nowCard}`}>
          <span className={h.label}>Sending</span>
          <strong>{demo ? "Demo: nothing sends" : sendingNote}</strong>
          <Link href="/settings/email" className="link">
            Email sending
          </Link>
        </div>
      </div>

      <h2 className={h.heading}>Tools</h2>
      <ul className={h.tools}>
        {TOOLS.map(({ href, name, body, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className={`card ${h.tool}`} data-testid="marketing-tool">
              <span className={h.toolIcon} aria-hidden="true">
                <Icon />
              </span>
              <span className={h.toolText}>
                <strong>{name}</strong>
                <span>{body}</span>
              </span>
              <ArrowRight aria-hidden="true" className={h.arrow} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MarketingPage() {
  return (
    <Suspense fallback={<PageHeader title="Marketing" />}>
      <Body />
    </Suspense>
  );
}
