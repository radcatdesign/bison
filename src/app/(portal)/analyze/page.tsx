import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { VisitorsChart } from "@/components/visitors-chart";
import { Metric, MetricGrid, PageHeader, Row, Rows, SampleBanner, Section } from "@/components/ui";
import { formatDecimal, formatDelta, formatDuration, formatInt, formatPercent } from "@/lib/format";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { getRepos } from "@/lib/repo";

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

async function Overview({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const ctx = await getPortalContext();
  const requested = Number((await searchParams).range);
  const range = (RANGES as readonly number[]).includes(requested) ? requested : 30;
  const repos = getRepos({ scope: scopeOf(ctx), tenant: ctx.tenant, sampleData: ctx.settings.sampleData, timezone: ctx.settings.timezone });
  const { current: c, previous: p, daily, topPages } = await repos.analytics.summary(range);

  return (
    <>
      {repos.mode === "sample" && <SampleBanner />}
      <PageHeader
        title="Overview"
        note={`Last ${range} days on ${ctx.sites[0]?.domain ?? "your site"}.`}
        actions={
          <nav aria-label="Date range" style={{ display: "flex", gap: 8 }}>
            {RANGES.map((r) => (
              <Link key={r} href={`/analyze?range=${r}`} className={r === range ? "btn btn-primary" : "btn"} aria-current={r === range ? "true" : undefined}>
                {r} days
              </Link>
            ))}
          </nav>
        }
      />

      <Section title="Traffic">
        <MetricGrid>
          <Metric lead label="Visitors" value={formatInt(c.visitors)} delta={formatDelta(c.visitors, p.visitors, range)} help={HELP.visitors} testId="metric-visitors" />
          <Metric label="Page views" value={formatInt(c.pageviews)} delta={formatDelta(c.pageviews, p.pageviews, range)} help={HELP.pageviews} />
          <Metric label="Visits" value={formatInt(c.visits)} delta={formatDelta(c.visits, p.visits, range)} help={HELP.visits} />
          <Metric label="Bounce rate" value={formatPercent(c.bounceRate)} delta={formatDelta(c.bounceRate, p.bounceRate, range, true)} help={HELP.bounce} />
          <Metric label="Average active visit" value={formatDuration(c.avgActiveSeconds)} delta={formatDelta(c.avgActiveSeconds, p.avgActiveSeconds, range)} help={HELP.active} />
          <Metric label="Pages per visit" value={formatDecimal(c.pagesPerVisit)} delta={formatDelta(c.pagesPerVisit, p.pagesPerVisit, range)} help={HELP.ppv} />
          <Metric label="Returning" value={formatPercent(c.returningShare)} help={HELP.returning} />
        </MetricGrid>
        <VisitorsChart points={daily} />
      </Section>

      <Section title="Top pages">
        <Rows>
          {topPages.length === 0 && <Row main={<span>No page views in this range yet. Once the tracking script is on your site, pages show up here within a minute.</span>} />}
          {topPages.map((page) => (
            <Row key={page.path} main={<span className="mono">{page.path}</span>} side={<span className="mono">{formatInt(page.views)}</span>} testId="top-page" />
          ))}
        </Rows>
      </Section>
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
