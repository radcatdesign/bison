import { CircleCheck, CircleAlert, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { marketingGate } from "@/components/marketing/gate";
import s from "@/components/marketing/marketing.module.css";
import { CopyBlock, SearchBusinessScreen } from "@/components/marketing/search-screen";
import { SetupFor } from "@/components/marketing/setup-for";
import { Card, PageHeader } from "@/components/ui";
import { itemOf } from "@/config/editions";
import { may } from "@/config/roles";
import { editionOf, sayOf } from "@/lib/edition";
import { appUrl, demoMode } from "@/lib/env";
import { buildLlmsFull, buildLlmsTxt, buildSitemap, checkPage, filesBase, organizationData, pageTitle, pageUrl, robotsLines, type SearchContext } from "@/lib/marketing/search";
import { loadSearchContext } from "@/lib/marketing/search-load";
import { defaultMarketingSettings } from "@/lib/marketing/settings";
import { settingsTenantOf } from "@/lib/marketing/store";
import { getPortalContext } from "@/lib/portal";

export const metadata: Metadata = { title: "Search pack" };

const NOTE = "What Google and AI assistants read about you: titles, descriptions, social cards, structured data, a sitemap and llms.txt, all built from your own content.";

function preview(text: string, lines = 14): string {
  const all = text.split("\n");
  return all.length > lines ? `${all.slice(0, lines).join("\n")}\n...` : text;
}

async function Body() {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.seo");
  if (blocked) return blocked;
  const demo = demoMode();
  const c: SearchContext = demo
    ? (() => {
        const d = defaultMarketingSettings(settingsTenantOf(ctx));
        return { name: ctx.tenant.name, tenantSlug: ctx.tenant.slug, site: ctx.sites[0]?.domain ?? null, base: appUrl(), brand: d.brand, search: d.search, pages: [], edition: ctx.tenant.edition };
      })()
    : await loadSearchContext(ctx.tenant.id);
  const base = filesBase(c);
  const files = [
    { name: "sitemap.xml", note: "Every published page, for search engines.", text: buildSitemap(c) },
    { name: "llms.txt", note: "A short summary of your business and pages, for AI assistants.", text: buildLlmsTxt(c) },
    { name: "llms-full.txt", note: "The full text of every published page.", text: buildLlmsFull(c) },
  ];
  const say = sayOf(ctx);
  const product = editionOf(ctx).productName;
  const sales = itemOf(ctx.tenant.edition, "module:sales").name;
  const snippet = `<script type="application/ld+json">\n${JSON.stringify({ "@context": "https://schema.org", ...organizationData(c) }, null, 2).replace(/</g, "\\u003c")}\n</script>`;

  return (
    <>
      <PageHeader title="Search pack" note={NOTE} />
      <SetupFor ctx={ctx} tool="search" />
      <div style={{ display: "grid", gap: 22 }}>
        <SearchBusinessScreen initial={c.search} storage={demo ? "browser" : "server"} tenantId={ctx.tenant.id} canEdit={may(ctx.member.role, "marketing.edit")} />

        <Card title={say("Your landing pages", "Your funnel pages")} note="Each published page gets its title, description, social card and structured data on its own." id="pages" testId="search-pages">
          {c.pages.length === 0 ? (
            <p className="muted">
              {demo ? "In the demo, pages can't go live, so nothing is listed here. " : "No published pages yet. "}
              <Link href="/marketing/pages" className="link">
                {say("Open Pages", "Open Funnel pages")}
              </Link>
            </p>
          ) : (
            <ul style={{ display: "grid", gap: 16, margin: 0, padding: 0, listStyle: "none" }}>
              {c.pages.map((p) => (
                <li key={p.slug} style={{ display: "grid", gap: 8, paddingBottom: 14, borderBottom: "1px solid var(--bo-line)" }} data-testid="search-page">
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                    <strong>{pageTitle(p, c.name)}</strong>
                    <a href={pageUrl(c, p.slug)} target="_blank" rel="noreferrer" className="link mono" style={{ fontSize: "var(--bo-text-xs)" }}>
                      /p/{c.tenantSlug}/{p.slug}
                    </a>
                    <a href={`${pageUrl(c, p.slug)}/opengraph-image`} target="_blank" rel="noreferrer" className={s.linkButton}>
                      <ExternalLink aria-hidden="true" />
                      Social card
                    </a>
                  </div>
                  <ul className={s.miniList}>
                    {checkPage(p, c.name).map((ch, i) => (
                      <li key={i} style={{ justifyContent: "flex-start", gap: 8 }}>
                        {ch.ok ? <CircleCheck aria-hidden="true" style={{ width: 16, height: 16, color: "var(--bo-good)", flex: "none" }} /> : <CircleAlert aria-hidden="true" style={{ width: 16, height: 16, color: "var(--bo-warn)", flex: "none" }} />}
                        <span style={{ color: "var(--bo-ink-2)" }}>{ch.text}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Your files" note="Live now, and updated every time you publish or change your details." id="files" testId="search-files">
          <div style={{ display: "grid", gap: 18 }}>
            {files.map((f) => (
              <div key={f.name} style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10 }}>
                  <strong className="mono">{f.name}</strong>
                  <span className="muted" style={{ fontSize: "var(--bo-text-sm)" }}>
                    {f.note}
                  </span>
                </div>
                <CopyBlock label={demo ? `${base}/${f.name} (live in your own account)` : `${base}/${f.name}`} value={preview(f.text)} testId={`file-${f.name}`} />
              </div>
            ))}
            <p className="muted" style={{ fontSize: "var(--bo-text-sm)" }}>
              Paste the sitemap address into{" "}
              <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="link">
                Google Search Console
              </a>{" "}
              (Sitemaps, then Add a new sitemap) and{" "}
              <a href="https://www.bing.com/webmasters" target="_blank" rel="noreferrer" className="link">
                Bing Webmaster Tools
              </a>{" "}
              (Sitemaps, then Submit sitemap). Then mark that step done in the setup above.
            </p>
          </div>
        </Card>

        <Card
          title={say("On your own website", "On your club's own website")}
          note={say("Your main site isn't hosted by Bison Ops, so these are for you or your web person to add there.", `Your club's main site isn't hosted by ${product}, so these are for you or your web person to add there.`)}
          id="site"
        >
          <div style={{ display: "grid", gap: 18 }}>
            <CopyBlock label="Add to robots.txt on your site" value={robotsLines(c)} testId="robots-lines" />
            <CopyBlock label="Add to the <head> of your home page (business details for search engines)" value={snippet} testId="org-snippet" />
            <p className="muted" style={{ fontSize: "var(--bo-text-sm)" }}>
              To have an llms.txt at your own address too, save the llms.txt above as a file at the root of your site, so it opens at {c.site ? `https://${c.site}/llms.txt` : "yoursite.com/llms.txt"}.
            </p>
          </div>
        </Card>

        <Card title={`Coming with ${sales}`}>
          <p className="muted" style={{ fontSize: "var(--bo-text-sm)" }}>
            {say(
              "Product feeds for Google Merchant Center and similar shopping listings are built from your products, so they arrive with the Sales module. Pre-rendered pages for sites built as single-page apps are an optional extra; ask us if your site needs it.",
              `Shopping feeds for Google Merchant Center and similar listings are built from your memberships, packs and gear, so they arrive with ${sales}. Pre-rendered pages for sites built as single-page apps are an optional extra; ask us if your site needs it.`,
            )}
          </p>
        </Card>
      </div>
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<PageHeader title="Search pack" note={NOTE} />}>
      <Body />
    </Suspense>
  );
}
