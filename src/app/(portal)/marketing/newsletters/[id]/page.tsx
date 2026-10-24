import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { marketingGate } from "@/components/marketing/gate";
import h from "@/components/marketing/newsletters.module.css";
import { NewsletterEditor, type SendCheck } from "@/components/marketing/newsletter-editor";
import { RefreshWhile } from "@/components/marketing/refresh-while";
import { DuplicateButton } from "@/components/marketing/report-actions";
import { StaticEmail } from "@/components/marketing/static-email";
import { Card, Metric, MetricStrip, PageHeader } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { demoTeam } from "@/lib/demo";
import { appUrl, demoMode } from "@/lib/env";
import { renderEmail } from "@/lib/email/render";
import { audienceCount, getNewsletter, MAX_SCHEDULE_DAYS, type NewsletterSummary } from "@/lib/marketing/newsletters";
import { emailsThisMonth } from "@/lib/marketing/people";
import { isVerified, readSending } from "@/lib/marketing/sending";
import { defaultMarketingSettings } from "@/lib/marketing/settings";
import { getMarketingSettings, settingsTenantOf } from "@/lib/marketing/store";
import { liveSubscribersRepo } from "@/lib/marketing/subscribers";
import { monthlyEmailLimit } from "@/lib/marketing/worker";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";
import { sampleLists, sampleSubscribers } from "@/lib/sample/marketing";
import { formatWhen, scheduleWindow } from "@/lib/time";

export const metadata: Metadata = { title: "Newsletter" };

function pct(n: number, of: number): string {
  return of ? `${Math.round((n / of) * 1000) / 10}%` : "0%";
}

function Report({ ctx, n, html }: { ctx: PortalContext; n: NewsletterSummary; html: string }) {
  const st = n.stats;
  const sending = n.status === "sending";
  const done = st.sent + st.failed + st.canceled;
  return (
    <>
      <RefreshWhile active={sending} />
      <PageHeader
        title={n.subject || "(no subject)"}
        note={sending ? `Going out now to ${n.audienceName || "your list"}.` : `Sent ${n.sentAt ? formatWhen(n.sentAt, ctx.settings.timezone) : ""} to ${n.audienceName || "your list"}.`}
        actions={
          <>
            <Link href="/marketing/newsletters" className="btn">
              All newsletters
            </Link>
            {may(ctx.member.role, "marketing.edit") && <DuplicateButton id={n.id} />}
          </>
        }
      />
      {sending && (
        <div style={{ marginBottom: 20 }} data-testid="send-progress">
          <p className="muted" style={{ marginBottom: 8 }}>
            {done.toLocaleString("en-US")} of {st.recipients.toLocaleString("en-US")} done
          </p>
          <div className={h.progress}>
            <span style={{ width: pct(done, st.recipients) }} />
          </div>
        </div>
      )}
      <MetricStrip>
        <Metric label="Sent" value={st.sent.toLocaleString("en-US")} testId="report-sent" help={<p>Emails the provider accepted for delivery, out of {st.recipients.toLocaleString("en-US")} {st.recipients === 1 ? "person" : "people"} this went to. People who unsubscribed before their email went out were skipped.</p>} />
        <Metric label="Delivered" value={pct(st.delivered, st.sent)} help={<p>Share of sent emails the receiving inbox confirmed it accepted. Updates over the first few minutes as confirmations come in.</p>} />
        <Metric label="Bounced" value={st.bounced.toLocaleString("en-US")} help={<p>Addresses that rejected the email. Hard bounces go on your do-not-email list so they aren&apos;t tried again.</p>} />
        <Metric label="Unsubscribed" value={st.unsubscribed.toLocaleString("en-US")} help={<p>People who unsubscribed using the link or button in this newsletter. Spam complaints count here too ({st.complained}).</p>} />
      </MetricStrip>
      <div className={h.report} style={{ marginTop: 24 }}>
        <StaticEmail html={html} title="What they got" />
        <div className={h.reportSide}>
          <Card title="Details">
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", margin: 0, fontSize: "var(--bo-text-sm)" }}>
              <dt className="muted">To</dt>
              <dd style={{ margin: 0 }}>{n.audienceName || "Everyone subscribed"}</dd>
              <dt className="muted">People</dt>
              <dd style={{ margin: 0 }} className="num">
                {st.recipients.toLocaleString("en-US")}
              </dd>
              {st.failed > 0 && (
                <>
                  <dt className="muted">Didn&apos;t send</dt>
                  <dd style={{ margin: 0 }}>{st.failed.toLocaleString("en-US")}, after several tries</dd>
                </>
              )}
              {st.canceled > 0 && (
                <>
                  <dt className="muted">Skipped</dt>
                  <dd style={{ margin: 0 }}>{st.canceled.toLocaleString("en-US")} unsubscribed before theirs went out</dd>
                </>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.newsletters");
  if (blocked) return blocked;
  const { id } = await params;
  await connection();
  const demo = demoMode();
  const tz = ctx.settings.timezone;
  const site = ctx.sites[0]?.domain ? `https://${ctx.sites[0].domain}` : "https://example.com";
  const { defaultWhen: tomorrow9, maxWhen } = scheduleWindow(tz, MAX_SCHEDULE_DAYS);
  const limit = monthlyEmailLimit();
  const canEdit = may(ctx.member.role, "marketing.edit");
  const canSend = canEdit && may(ctx.member.role, "email.send");

  if (demo) {
    const brand = defaultMarketingSettings(settingsTenantOf(ctx)).brand;
    const subs = sampleSubscribers(ctx.tenant).filter((x) => x.status === "subscribed");
    const lists = sampleLists(ctx.tenant).map((l) => ({ ...l, count: subs.filter((x) => x.listIds.includes(l.id)).length }));
    return (
      <NewsletterEditor
        id={id}
        storage="browser"
        tenantId={ctx.tenant.id}
        initial={null}
        status="draft"
        scheduledLabel={null}
        error={null}
        brand={brand}
        baseUrl={appUrl()}
        site={site}
        team={demoTeam(ctx).map((m) => ({ email: m.email, name: m.name }))}
        me={ctx.member.email}
        lists={lists}
        everyone={subs.length}
        left={limit}
        limit={limit}
        checks={[{ ok: true, text: "In the demo, sending is pretend. Nothing goes out." }]}
        timeZone={tz}
        defaultWhen={tomorrow9}
        maxWhen={maxWhen}
        canSend={canSend}
        canEdit={canEdit}
        industry={ctx.tenant.industry}
      />
    );
  }

  const n = await getNewsletter(scopeOf(ctx), id);
  if (!n) {
    return (
      <>
        <PageHeader title="This newsletter isn't here" note="It may have been deleted." />
        <Link href="/marketing/newsletters" className="btn">
          Back to Newsletters
        </Link>
      </>
    );
  }

  const data = await withTenant(scopeOf(ctx), async (tx) => ({
    settings: await getMarketingSettings(tx, settingsTenantOf(ctx)),
    sending: await readSending(tx),
    used: await emailsThisMonth(tx),
    everyone: await audienceCount(tx, "all", null),
    team: await tx.selectFrom("members").select(["email", "name"]).where("status", "=", "active").orderBy("name").execute(),
  }));
  const brand = data.settings.brand;

  if (n.status === "sent" || n.status === "sending") {
    const html = renderEmail({ doc: n.doc, brand, subject: n.subject, preheader: n.preheader, baseUrl: appUrl() }).html;
    return <Report ctx={ctx} n={n} html={html} />;
  }

  const lists = (await liveSubscribersRepo(scopeOf(ctx)).lists()).filter((l) => l.count > 0 || n.listId === l.id);
  const checks: SendCheck[] = [
    isVerified(data.sending) ? { ok: true, text: `Sends from your own domain, ${data.sending.domain}.` } : { ok: false, text: "Your sending domain isn't verified yet.", href: "/settings/email", fix: "Set up sending" },
    brand.address.trim() ? { ok: true, text: "Your postal address is in the footer." } : { ok: false, text: "Your postal address isn't in the brand kit yet.", href: "/marketing/brand#footer", fix: "Add it" },
    ctx.settings.sampleData ? { ok: false, text: "Sample data is on, so your list on screen is made up.", href: "/settings#data", fix: "Turn it off" } : { ok: true, text: "Going to your real list." },
  ];

  return (
    <NewsletterEditor
      id={n.id}
      storage="server"
      tenantId={ctx.tenant.id}
      initial={{ subject: n.subject, preheader: n.preheader, doc: n.doc }}
      status={n.status === "scheduled" ? "scheduled" : n.status === "failed" ? "failed" : "draft"}
      scheduledLabel={n.scheduledFor ? formatWhen(n.scheduledFor, tz) : null}
      error={n.error}
      brand={brand}
      baseUrl={appUrl()}
      site={site}
      team={data.team}
      me={ctx.member.email}
      lists={lists}
      everyone={data.everyone}
      left={Math.max(0, limit - data.used)}
      limit={limit}
      checks={checks}
      timeZone={tz}
      defaultWhen={tomorrow9}
      maxWhen={maxWhen}
      canSend={canSend}
      canEdit={canEdit}
      industry={ctx.tenant.industry}
    />
  );
}

export default function NewsletterPage({ params }: PageProps<"/marketing/newsletters/[id]">) {
  return (
    <Suspense fallback={<PageHeader title="Newsletter" />}>
      <Body params={params} />
    </Suspense>
  );
}
