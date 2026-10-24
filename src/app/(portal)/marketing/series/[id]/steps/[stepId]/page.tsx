import type { Metadata } from "next";
import { Suspense } from "react";
import { marketingGate } from "@/components/marketing/gate";
import { StepEditor } from "@/components/marketing/series-screens";
import { PageHeader } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { demoTeam } from "@/lib/demo";
import { appUrl, demoMode } from "@/lib/env";
import { getStep, triggersFor } from "@/lib/marketing/series";
import { defaultMarketingSettings } from "@/lib/marketing/settings";
import { getMarketingSettings, settingsTenantOf } from "@/lib/marketing/store";
import { getPortalContext, scopeOf } from "@/lib/portal";

export const metadata: Metadata = { title: "Series email" };

async function Body({ params }: { params: Promise<{ id: string; stepId: string }> }) {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.sequences");
  if (blocked) return blocked;
  const { id, stepId } = await params;
  const demo = demoMode();
  const site = ctx.sites[0]?.domain ? `https://${ctx.sites[0].domain}` : "https://example.com";
  const c = { storage: demo ? ("browser" as const) : ("server" as const), tenantId: ctx.tenant.id, site, canEdit: may(ctx.member.role, "marketing.edit"), triggers: triggersFor(ctx.tenant), edition: ctx.tenant.edition };
  if (demo) {
    return <StepEditor c={c} seriesId={id} stepId={stepId} server={null} brand={defaultMarketingSettings(settingsTenantOf(ctx)).brand} baseUrl={appUrl()} team={demoTeam(ctx).map((m) => ({ email: m.email, name: m.name }))} me={ctx.member.email} />;
  }
  const [step, data] = await Promise.all([
    getStep(scopeOf(ctx), stepId),
    withTenant(scopeOf(ctx), async (tx) => ({
      brand: (await getMarketingSettings(tx, settingsTenantOf(ctx))).brand,
      team: await tx.selectFrom("members").select(["email", "name"]).where("status", "=", "active").orderBy("name").execute(),
    })),
  ]);
  const server = step && step.seriesId === id ? { step, seriesName: step.seriesName, seriesStatus: step.seriesStatus } : null;
  return <StepEditor c={c} seriesId={id} stepId={stepId} server={server} brand={data.brand} baseUrl={appUrl()} team={data.team} me={ctx.member.email} />;
}

export default function StepPage({ params }: PageProps<"/marketing/series/[id]/steps/[stepId]">) {
  return (
    <Suspense fallback={<PageHeader title="Series email" />}>
      <Body params={params} />
    </Suspense>
  );
}
