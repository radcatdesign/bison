import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { marketingGate } from "@/components/marketing/gate";
import { SeriesDetail, type SeriesView } from "@/components/marketing/series-screens";
import { PageHeader } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { appUrl, demoMode } from "@/lib/env";
import { formChoices, getSeries, triggersFor } from "@/lib/marketing/series";
import { defaultMarketingSettings } from "@/lib/marketing/settings";
import { getMarketingSettings, settingsTenantOf } from "@/lib/marketing/store";
import { liveSubscribersRepo } from "@/lib/marketing/subscribers";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { sampleLists } from "@/lib/sample/marketing";

export const metadata: Metadata = { title: "Email series" };

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.sequences");
  if (blocked) return blocked;
  const { id } = await params;
  const demo = demoMode();
  const site = ctx.sites[0]?.domain ? `https://${ctx.sites[0].domain}` : "https://example.com";
  let series: SeriesView[] = [];
  let forms: { value: string; label: string }[] = [];
  let lists: { id: string; name: string; count: number }[] = sampleLists(ctx.tenant).map((l) => ({ ...l, count: 0 }));
  let brand = defaultMarketingSettings(settingsTenantOf(ctx)).brand;
  if (!demo) {
    const [one, f, l, b] = await Promise.all([getSeries(scopeOf(ctx), id), formChoices(scopeOf(ctx)), liveSubscribersRepo(scopeOf(ctx)).lists(), withTenant(scopeOf(ctx), async (tx) => (await getMarketingSettings(tx, settingsTenantOf(ctx))).brand)]);
    series = one ? [one] : [];
    forms = f;
    lists = l;
    brand = b;
  }
  return (
    <SeriesDetail
      c={{ storage: demo ? "browser" : "server", tenantId: ctx.tenant.id, site, canEdit: may(ctx.member.role, "marketing.edit"), triggers: triggersFor(ctx.tenant) }}
      id={id}
      server={series}
      forms={forms}
      lists={lists}
      brand={brand}
      baseUrl={appUrl()}
      canSend={may(ctx.member.role, "email.send")}
    />
  );
}

export default function OneSeriesPage({ params }: PageProps<"/marketing/series/[id]">) {
  return (
    <>
      <Link href="/marketing/series" className="link" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: "var(--bo-text-sm)" }}>
        <ArrowLeft aria-hidden="true" style={{ width: 15, height: 15 }} />
        Email series
      </Link>
      <PageHeader title="Email series" note="What starts it, the emails in it, and whether it's on." />
      <Suspense fallback={null}>
        <Body params={params} />
      </Suspense>
    </>
  );
}
