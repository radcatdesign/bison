import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { LandingPage } from "@/components/landing/landing-page";
import { PageForm } from "@/components/landing/page-form";
import { demoMode } from "@/lib/env";
import { formToken } from "@/lib/pages/form-token";
import { jsonLd, pageDescription, pageStructuredData, pageTitle, pageUrl } from "@/lib/marketing/search";
import { loadSearchContext } from "@/lib/marketing/search-load";
import { signupChoicesFor } from "@/lib/marketing/store";
import { getPublishedPage } from "@/lib/pages/repo";

// A published landing page. Public: no session is read, and only the published
// version is ever shown, never the draft.

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
  const endpoint = `/p/${tenant}/${slug}/submit`;
  const token = formToken(page.pageId);
  const asksKind = page.doc.sections.some((x) => x.type === "form" && x.fields.includes("kind"));
  const signup = asksKind ? await signupChoicesFor(page.tenantId) : null;
  const c = await loadSearch(page.tenantId);
  const sp = c.pages.find((x) => x.slug === page.slug);
  return (
    <>
      {sp && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(pageStructuredData(c, sp)) }} />}
      <LandingPage doc={page.doc} brand={page.brand} signup={signup} renderForm={(section) => <PageForm section={section} endpoint={endpoint} token={token} signup={signup} />} />
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
