import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { LandingPage } from "@/components/landing/landing-page";
import { PageForm } from "@/components/landing/page-form";
import { demoMode } from "@/lib/env";
import { getPublishedPage } from "@/lib/pages/repo";

// A published landing page. Public: no session is read, and only the published
// version is ever shown, never the draft.

// Visitors can zoom on public pages, unlike the dashboard app.
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

type Params = Promise<{ tenant: string; slug: string }>;

const load = cache(async (tenant: string, slug: string) => (demoMode() ? null : getPublishedPage(tenant, slug)));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenant, slug } = await params;
  const page = await load(tenant, slug);
  if (!page) return { title: { absolute: "Page not found" }, robots: { index: false } };
  const hero = page.doc.sections.find((s) => s.type === "hero");
  const title = page.doc.seo.title || (hero?.type === "hero" ? hero.headline : "") || page.brand;
  const description = page.doc.seo.description || undefined;
  return { title: { absolute: title }, description, openGraph: { title, description, siteName: page.brand } };
}

async function Published({ params }: { params: Params }) {
  const { tenant, slug } = await params;
  const page = await load(tenant, slug);
  if (!page) notFound();
  const endpoint = `/p/${tenant}/${slug}/submit`;
  return <LandingPage doc={page.doc} brand={page.brand} renderForm={(section) => <PageForm section={section} endpoint={endpoint} />} />;
}

export default function PublishedPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Published params={params} />
    </Suspense>
  );
}
