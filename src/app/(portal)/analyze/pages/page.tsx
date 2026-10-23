import { ArrowUpRight, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PagePreview, PageThumb } from "@/components/page-preview";
import { Metric, PageHeader, SampleBanner, Segmented } from "@/components/ui";
import { sayOf } from "@/lib/edition";
import { demoMode } from "@/lib/env";
import { formatDuration, formatInt, formatPercent } from "@/lib/format";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";
import { getRepos } from "@/lib/repo";
import type { LandingPage } from "@/lib/repo/types";
import s from "./pages.module.css";

export const metadata: Metadata = { title: "Landing pages" };

const RANGES = [7, 30, 90] as const;

const HELP = {
  entries: "Visits that started on this page: the first page someone saw when they arrived, from search, an ad, a link or typing your address.",
  share: "This page's entries as a share of all entries in the range.",
  bounce: "Visits that started here, saw only this page, did no key action, and left within 10 seconds of active time.",
  active: "Average time people who started here were really there, across their whole visit. Background tabs don't count.",
  forms: "Share of visits starting here that sent a form anywhere on your site before they left.",
};

/** Where a preview loads from: the tenant's live page, or a made-up page in sample mode. */
function previewSource(ctx: PortalContext, sample: boolean, path: string) {
  const domain = ctx.sites[0]?.domain;
  const url = domain ? `https://${domain}${path}` : path;
  if (!sample && domain) return { src: url, url, open: url };
  // Sample mode never sends anyone to the real domain, which may be someone else's site.
  const name = encodeURIComponent(ctx.tenant.name);
  const src = `/sample-site/${ctx.tenant.industry}${path === "/" ? "" : path}?name=${name}`;
  return { src, url, open: src };
}

function hrefFor(range: number, path?: string) {
  return `/analyze/pages?range=${range}${path ? `&p=${encodeURIComponent(path)}` : ""}`;
}

function Detail({ page, ctx, sample, range }: { page: LandingPage; ctx: PortalContext; sample: boolean; range: number }) {
  const { src, url, open } = previewSource(ctx, sample, page.path);
  const say = sayOf(ctx);
  return (
    <>
      <Link href={hrefFor(range)} className={s.scrim} scroll={false} aria-label="Close page" tabIndex={-1} />
      <aside className={s.panel} aria-label={`Landing page: ${page.path}`} data-testid="page-panel">
        <div className={s.panelHead}>
          <div className={s.panelTitle}>
            <h2>{page.title ?? page.path}</h2>
            {page.title && <span className="mono muted">{page.path}</span>}
          </div>
          <a href={open} target="_blank" rel="noreferrer noopener" className="btn">
            Open page
            <ArrowUpRight aria-hidden="true" />
          </a>
          <Link href={hrefFor(range)} className={s.close} scroll={false} aria-label="Close">
            <X aria-hidden="true" />
          </Link>
        </div>

        <div className={s.panelBody}>
          <div className={s.previewCol}>
            <PagePreview src={src} title={`Preview of ${page.path}`} url={url} />
            {!sample && <p className={s.hint}>Blank preview? Some sites block being shown inside other sites. Screenshots arrive with the tracking script.</p>}
          </div>
          <div className={`card ${s.stats}`}>
            <Metric label="Entries" value={formatInt(page.entries)} help={HELP.entries} />
            <Metric label="Share of entries" value={formatPercent(page.share)} help={HELP.share} />
            <Metric label="Bounce rate" value={formatPercent(page.bounceRate)} help={HELP.bounce} />
            <Metric label="Average active visit" value={formatDuration(page.avgActiveSeconds)} help={HELP.active} />
            <Metric label="Form sends" value={formatPercent(page.formRate, 1)} help={say(HELP.forms, "Share of visits starting here that sent a form anywhere on your site before they left, like a free pass or tour request.")} />
            <div className={s.soon}>
              <span className="pill">Coming next</span>
              <p>Click, scroll and cursor heatmaps painted over this page, by device.</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

async function LandingPages({ searchParams }: { searchParams: Promise<{ range?: string; p?: string }> }) {
  const ctx = await getPortalContext();
  const params = await searchParams;
  const requested = Number(params.range);
  const range = (RANGES as readonly number[]).includes(requested) ? requested : 30;
  const repos = getRepos({ scope: scopeOf(ctx), tenant: ctx.tenant, sampleData: ctx.settings.sampleData, timezone: ctx.settings.timezone });
  const sample = repos.mode === "sample";
  const pages = await repos.analytics.landingPages(range);
  const open = params.p ? pages.find((p) => p.path === params.p) : undefined;
  const say = sayOf(ctx);
  const domain = ctx.sites[0]?.domain ?? say("your site", "your club's site");

  return (
    <>
      {sample && <SampleBanner demo={demoMode()} />}
      <PageHeader
        title="Landing pages"
        note={`The first page people see when they arrive. Last ${range} days on ${domain}.`}
        actions={<Segmented label="Date range" items={RANGES.map((r) => ({ href: hrefFor(r), label: `${r} days`, current: r === range }))} />}
      />

      {pages.length === 0 ? (
        <div className={`card ${s.empty}`}>
          <h2>No landing pages yet</h2>
          <p className="muted">{say(`Once the tracking script is on ${domain}, every page people arrive on shows up here with a live preview.`, `Once the tracking script is on ${domain}, every page people arrive on, like your free pass or class schedule page, shows up here with a live preview.`)}</p>
        </div>
      ) : (
        <ul className={s.grid} data-testid="landing-pages">
          {pages.map((page, i) => {
            const { src } = previewSource(ctx, sample, page.path);
            return (
              <li key={page.path}>
                <Link href={hrefFor(range, page.path)} scroll={false} className={`card ${s.tile}`} aria-current={open?.path === page.path ? "true" : undefined} data-testid="landing-page">
                  <div className={s.thumbWrap}>
                    <PageThumb src={src} title={`Preview of ${page.path}`} />
                    <span className={s.rank} aria-hidden="true">
                      {i + 1}
                    </span>
                  </div>
                  <div className={s.tileBody}>
                    <div className={s.tileTitle}>
                      <strong className={page.title ? undefined : "mono"}>{page.title ?? page.path}</strong>
                      {page.title && <span className="mono">{page.path}</span>}
                    </div>
                    <div className={s.share} aria-hidden="true">
                      <span style={{ width: `${Math.max(2, page.share * 100)}%` }} />
                    </div>
                    <dl className={s.tileStats}>
                      <div>
                        <dt>Entries</dt>
                        <dd className="num">{formatInt(page.entries)}</dd>
                      </div>
                      <div>
                        <dt>Bounce</dt>
                        <dd className="num">{formatPercent(page.bounceRate)}</dd>
                      </div>
                      <div>
                        <dt>Active</dt>
                        <dd className="num">{formatDuration(page.avgActiveSeconds)}</dd>
                      </div>
                      <div>
                        <dt>Forms</dt>
                        <dd className="num">{formatPercent(page.formRate, 1)}</dd>
                      </div>
                    </dl>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {open && <Detail page={open} ctx={ctx} sample={sample} range={range} />}
    </>
  );
}

export default function LandingPagesPage({ searchParams }: PageProps<"/analyze/pages">) {
  return (
    <Suspense fallback={<PageHeader title="Landing pages" note="Loading your pages" />}>
      <LandingPages searchParams={searchParams as Promise<{ range?: string; p?: string }>} />
    </Suspense>
  );
}
