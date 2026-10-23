import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { cache, Suspense } from "react";
import { LandingPage } from "@/components/landing/landing-page";
import { PageForm } from "@/components/landing/page-form";
import { TestBeacon } from "@/components/landing/test-beacon";
import { demoMode } from "@/lib/env";
import { formToken } from "@/lib/pages/form-token";
import { jsonLd, pageDescription, pageStructuredData, pageTitle, pageUrl } from "@/lib/marketing/search";
import { loadSearchContext } from "@/lib/marketing/search-load";
import { signupChoicesFor } from "@/lib/marketing/store";
import { getPublishedPage } from "@/lib/pages/repo";
import { isPageView, recordVisit, serveVersion, visitorFrom } from "@/lib/pages/tests";
import { addressKey, allow } from "@/lib/rate-limit";

// A published landing page. Public: no session is read, and only the published
// version is ever shown, never the draft. When the page is in an A/B test, each
// visitor sees one of its versions instead; search engines read the same title,
// description and address whichever one they get.

// Visitors can zoom on public pages, unlike the dashboard app.
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

type Params = Promise<{ tenant: string; slug: string }>;

const load = cache(async (tenant: string, slug: string) => (demoMode() ? null : getPublishedPage(tenant, slug)));
/** The search pack for this page's company: business details for structured data. */
const loadSearch = cache(async (tenantId: string) => loadSearchContext(tenantId));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenant, slug } = await params;
  const page = await load(tenant, slug);
  if (!page) return { title: { absolute: "Page not found" }, robots: { index: false } };
  const c = await loadSearch(page.tenantId);
  const sp = c.pages.find((x) => x.slug === page.slug) ?? { slug: page.slug, title: page.brand, doc: page.doc, publishedAt: new Date() };
  const title = pageTitle(sp, c.name);
  const description = pageDescription(sp) || undefined;
  const url = pageUrl(c, page.slug);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, siteName: c.name, url, type: "website" },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

async function Published({ params }: { params: Params }) {
  const { tenant, slug } = await params;
  const page = await load(tenant, slug);
  if (!page) notFound();
  const h = await headers();
  const who = visitorFrom(h);
  const served = await serveVersion(page.tenantId, page.pageId, page.doc, who);
  const test = served.test;
  // Counted after the page is sent: people opening the page, not prefetches, the team, bots, or floods from one address or at one test.
  const counts = test && !who.team && isPageView(h) && allow(`page-visit:${addressKey(who.ip)}`, 120, 60 * 60 * 1000) && allow(`page-visit-test:${test.id}`, 50_000, 24 * 60 * 60 * 1000);
  if (test && counts) after(() => recordVisit(page.tenantId, test, who).catch((err) => console.error("counting a page test visit failed", err)));
  const doc = served.doc;
  const endpoint = `/p/${tenant}/${slug}/submit`;
  const token = formToken(page.pageId);
  const asksKind = doc.sections.some((x) => x.type === "form" && x.fields.includes("kind"));
  const signup = asksKind ? await signupChoicesFor(page.tenantId) : null;
  const c = await loadSearch(page.tenantId);
  const sp = c.pages.find((x) => x.slug === page.slug);
  return (
    <>
      {sp && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(pageStructuredData(c, sp)) }} />}
      <LandingPage doc={doc} brand={page.brand} signup={signup} renderForm={(section) => <PageForm section={section} endpoint={endpoint} token={token} signup={signup} version={test?.versionId} />} />
      {test?.goal === "click" && !who.team && <TestBeacon endpoint={`/p/${tenant}/${slug}/goal`} version={test.versionId} />}
    </>
  );
}

export default function PublishedPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Published params={params} />
    </Suspense>
  );
}
