import { sql } from "kysely";
import type { Metadata } from "next";
import { Suspense } from "react";
import { marketingGate } from "@/components/marketing/gate";
import s from "@/components/marketing/marketing.module.css";
import { CodeActions, type CodeView, OfferSettingsScreen } from "@/components/marketing/offer-screen";
import { SetupFor } from "@/components/marketing/setup-for";
import { Card, Metric, MetricStrip, PageHeader } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { appUrl, demoMode } from "@/lib/env";
import { liveOfferRepo, sampleOfferRepo } from "@/lib/marketing/offer";
import { defaultMarketingSettings, offerSummary } from "@/lib/marketing/settings";
import { getMarketingSettings, settingsTenantOf } from "@/lib/marketing/store";
import { getPortalContext, scopeOf } from "@/lib/portal";

export const metadata: Metadata = { title: "Welcome offer" };

const NOTE = "An optional one-time code for each new subscriber, for their first order. It shows in your welcome email.";

async function Body({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.welcome-offer");
  if (blocked) return blocked;
  const { q } = await searchParams;
  const demo = demoMode();
  const sample = demo || ctx.settings.sampleData;
  const repo = sample ? sampleOfferRepo(ctx.tenant) : liveOfferRepo(scopeOf(ctx));
  const loaded = demo
    ? { settings: defaultMarketingSettings(settingsTenantOf(ctx)), inEmail: true }
    : await withTenant(scopeOf(ctx), async (tx) => ({
        settings: await getMarketingSettings(tx, settingsTenantOf(ctx)),
        inEmail: Boolean(await tx.selectFrom("sequence_steps").select("id").where(sql<boolean>`doc -> 'sections' @> '[{"type": "offer"}]'`).limit(1).executeTakeFirst()),
      }));
  const [stats, codes] = await Promise.all([repo.stats(), repo.list(q)]);
  const tz = ctx.settings.timezone;
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz });
  const now = new Date();
  const views: CodeView[] = codes.map((c) => ({
    id: c.id,
    code: c.code,
    email: c.email,
    worth: offerSummary({ kind: c.kind, value: c.discount }),
    issued: fmt.format(c.issuedAt),
    ends: c.expiresAt ? fmt.format(c.expiresAt) : "No end date",
    usedOn: c.redeemedAt ? fmt.format(c.redeemedAt) : null,
    note: c.note,
    expired: Boolean(c.expiresAt && c.expiresAt < now && !c.redeemedAt),
  }));
  const canEdit = may(ctx.member.role, "marketing.edit");

  return (
    <>
      <PageHeader title="Welcome offer" note={NOTE} />
      <SetupFor ctx={ctx} tool="offer" />
      <OfferSettingsScreen initial={loaded.settings.offer} storage={demo ? "browser" : "server"} tenantId={ctx.tenant.id} canEdit={canEdit} brand={loaded.settings.brand} baseUrl={appUrl()} timeZone={tz} inEmail={loaded.inEmail} now={now.toISOString()} />

      <div style={{ height: 28 }} />
      <MetricStrip>
        <Metric label="Codes given out" value={stats.total.toLocaleString("en-US")} help={<p>Every welcome code issued, one per person who signed up while the offer was on.</p>} />
        <Metric label="New in 30 days" value={stats.issued30.toLocaleString("en-US")} help={<p>Codes issued in the last 30 days.</p>} />
        <Metric label="Used" value={stats.total ? `${Math.round((stats.used / stats.total) * 100)}%` : "0%"} help={<p>Share of codes marked used, by your team here or, once Sales is on, at checkout. {stats.used.toLocaleString("en-US")} so far.</p>} />
      </MetricStrip>
      <div style={{ height: 20 }} />
      <Card title="Look up a code" note="When someone uses a code, find it here and mark it used, so it can't be used twice." flush testId="codes">
        <form className={s.toolbar} action="/marketing/offer" style={{ padding: "14px 14px 0" }}>
          <input name="q" className="input" defaultValue={q} placeholder="A code, or an email address" aria-label="Find a code" />
          <button type="submit" className="btn">
            Find
          </button>
        </form>
        {sample && !demo && <p className="notice" style={{ margin: "0 14px 14px" }}>Sample data is on, so these codes are made up and can&apos;t be changed.</p>}
        {views.length === 0 ? (
          <div className={s.empty}>
            <strong>{q ? "No code matches that." : "No codes yet."}</strong>
            <span>{q ? "Check the spelling, or search by email." : "Codes appear here as people sign up while the offer is on."}</span>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th className={s.hideSm}>Worth</th>
                  <th className={s.hideSm}>Ends</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {views.map((c) => (
                  <tr key={c.id} data-testid="code-row" style={{ cursor: "default" }}>
                    <td>
                      <span className={s.cellMain}>
                        <strong className="mono">{c.code}</strong>
                        <span>{c.email}</span>
                      </span>
                    </td>
                    <td className={s.hideSm}>{c.worth}</td>
                    <td className={`${s.hideSm} muted`}>{c.ends}</td>
                    <td>{c.usedOn ? <span className="pill pill-good">Used {c.usedOn}</span> : c.expired ? <span className="pill">Expired</span> : <span className="pill pill-accent">Not used</span>}</td>
                    <td>
                      <CodeActions code={c} canEdit={canEdit && !sample} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

export default function OfferPage({ searchParams }: PageProps<"/marketing/offer">) {
  return (
    <Suspense fallback={<PageHeader title="Welcome offer" note={NOTE} />}>
      <Body searchParams={searchParams as Promise<{ q?: string }>} />
    </Suspense>
  );
}
