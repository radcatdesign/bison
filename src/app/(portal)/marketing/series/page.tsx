import type { Metadata } from "next";
import { Suspense } from "react";
import { marketingGate } from "@/components/marketing/gate";
import { SeriesList, type SeriesView } from "@/components/marketing/series-screens";
import { SetupFor } from "@/components/marketing/setup-for";
import { PageHeader } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { appUrl, demoMode } from "@/lib/env";
import { formChoices, listSeries, triggersFor } from "@/lib/marketing/series";
import { defaultMarketingSettings } from "@/lib/marketing/settings";
import { getMarketingSettings, settingsTenantOf } from "@/lib/marketing/store";
import { getPortalContext, scopeOf } from "@/lib/portal";

export const metadata: Metadata = { title: "Email series" };

const NOTE = "Emails that go out on their own, a set number of days after someone starts. Unsubscribing stops every series for that person.";

async function Body({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.sequences");
  if (blocked) return blocked;
  const { error } = await searchParams;
  const demo = demoMode();
  const site = ctx.sites[0]?.domain ? `https://${ctx.sites[0].domain}` : "https://example.com";
  const [series, forms, brand] = demo
    ? [[] as SeriesView[], [], defaultMarketingSettings(settingsTenantOf(ctx)).brand]
    : await Promise.all([listSeries(scopeOf(ctx), ctx.sites[0]?.domain, ctx.tenant.edition), formChoices(scopeOf(ctx), ctx.tenant.edition), withTenant(scopeOf(ctx), async (tx) => (await getMarketingSettings(tx, settingsTenantOf(ctx))).brand)]);
  return (
    <>
      <PageHeader title="Email series" note={NOTE} />
      <SetupFor ctx={ctx} tool="series" />
      {error && (
        <p className="notice notice-error" role="alert" style={{ marginBottom: 18 }}>
          {error.slice(0, 200)}
        </p>
      )}
      <SeriesList c={{ storage: demo ? "browser" : "server", tenantId: ctx.tenant.id, site, canEdit: may(ctx.member.role, "marketing.edit"), triggers: triggersFor(ctx.tenant), edition: ctx.tenant.edition }} server={series} forms={forms} brand={brand} baseUrl={appUrl()} />
    </>
  );
}

export default function SeriesPage({ searchParams }: PageProps<"/marketing/series">) {
  return (
    <Suspense fallback={<PageHeader title="Email series" note={NOTE} />}>
      <Body searchParams={searchParams as Promise<{ error?: string }>} />
    </Suspense>
  );
}
