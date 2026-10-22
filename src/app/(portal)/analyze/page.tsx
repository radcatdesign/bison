import type { Metadata } from "next";
import { Suspense } from "react";
import { VisitorsChart } from "@/components/visitors-chart";
import { Card, Metric, MetricStrip, PageHeader, SampleBanner, Segmented } from "@/components/ui";
import { demoMode } from "@/lib/env";
import { formatChange, formatDecimal, formatDuration, formatInt, formatPercent } from "@/lib/format";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { getRepos } from "@/lib/repo";
import s from "./overview.module.css";

export const metadata: Metadata = { title: "Overview" };

const RANGES = [7, 30, 90] as const;

const HELP = {
  visitors:
    "Each browser counts once per day, from a scrambled code made of its internet address and browser type. The code changes every night, so nobody can be followed from one day to the next. Someone who visits on two different days counts twice.",
  pageviews: "Every time a page loads, or a single-page site changes its address. Your team's own browsers and known bots aren't counted.",
  visits: "A run of activity from one browser. A visit ends after 30 minutes with nothing happening.",
  bounce: "Visits that saw one page, did no key action, and left within 10 seconds of active time.",
  active:
    "Time someone was really there: the page was on screen and they scrolled, clicked, typed or moved in the last 2 minutes. Tabs left open in the background don't count.",
  ppv: "Page views divided by visits.",
  returning:
    "Share of visits from browsers that have been here before. Browsers set to European or UK time, and browsers that ask not to be tracked, always count as new.",
};

function Ranges({ range }: { range: number }) {
  return <Segmented label="Date range" items={RANGES.map((r) => ({ href: `/analyze?range=${r}`, label: `${r} days`, current: r === range }))} />;
}

async function Overview({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const ctx = await getPortalContext();
  const requested = Number((await searchParams).range);
  const range = (RANGES as readonly number[]).includes(requested) ? requested : 30;
  const repos = getRepos({ scope: scopeOf(ctx), tenant: ctx.tenant, sampleData: ctx.settings.sampleData, timezone: ctx.settings.timezone });
  const { current: c, previous: p, daily, topPages } = await repos.analytics.summary(range);
  const topMax = Math.max(1, ...topPages.map((t) => t.views));

  return (
    <>
      {repos.mode === "sample" && <SampleBanner demo={demoMode()} />}
      <PageHeader title="Overview" note={`Last ${range} days on ${ctx.sites[0]?.domain ?? "your site"}`} actions={<Ranges range={range} />} />

      <section className={`card ${s.hero}`} aria-label="Traffic">
        <div className={s.heroTop}>
          <Metric size="hero" label="Visitors" value={formatInt(c.visitors)} change={formatChange(c.visitors, p.visitors, range)} help={HELP.visitors} testId="metric-visitors" />
          <p className={s.heroNote}>Compared with the {range} days before</p>
        </div>
        <VisitorsChart points={daily} />
        <MetricStrip>
          <Metric label="Page views" value={formatInt(c.pageviews)} change={formatChange(c.pageviews, p.pageviews, range)} help={HELP.pageviews} />
          <Metric label="Visits" value={formatInt(c.visits)} change={formatChange(c.visits, p.visits, range)} help={HELP.visits} />
          <Metric label="Bounce rate" value={formatPercent(c.bounceRate)} change={formatChange(c.bounceRate, p.bounceRate, range, true)} help={HELP.bounce} />
          <Metric label="Average active visit" value={formatDuration(c.avgActiveSeconds)} change={formatChange(c.avgActiveSeconds, p.avgActiveSeconds, range)} help={HELP.active} />
          <Metric label="Pages per visit" value={formatDecimal(c.pagesPerVisit)} change={formatChange(c.pagesPerVisit, p.pagesPerVisit, range)} help={HELP.ppv} />
          <Metric label="Returning" value={formatPercent(c.returningShare)} help={HELP.returning} />
        </MetricStrip>
      </section>

      <Card title="Top pages" aside={<span className="label">Page views</span>} flush>
        {topPages.length === 0 ? (
          <p className={s.empty}>No page views in this range yet. Once the tracking script is on your site, pages show up here within a minute.</p>
        ) : (
          <ol className={s.pages}>
            {topPages.map((page) => (
              <li key={page.path} className={s.pageRow} data-testid="top-page">
                <span className={s.pageBar} style={{ width: `${(page.views / topMax) * 100}%` }} aria-hidden="true" />
                <span className={`mono ${s.pagePath}`}>{page.path}</span>
                <span className={`num ${s.pageViews}`}>{formatInt(page.views)}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}

export default function OverviewPage({ searchParams }: PageProps<"/analyze">) {
  return (
    <Suspense fallback={<PageHeader title="Overview" note="Loading your numbers" />}>
      <Overview searchParams={searchParams as Promise<{ range?: string }>} />
    </Suspense>
  );
}
