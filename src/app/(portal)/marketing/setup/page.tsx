import type { Metadata } from "next";
import { Suspense } from "react";
import { marketingGate } from "@/components/marketing/gate";
import { SetupHub } from "@/components/marketing/setup-hub";
import { PageHeader } from "@/components/ui";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { ensureStarterSeries } from "@/lib/marketing/series";
import { loadSetup } from "@/lib/marketing/setup";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { sampleLists, sampleSubscribers } from "@/lib/sample/marketing";

export const metadata: Metadata = { title: "Set up Marketing" };

const NOTE = "Step by step, in the order that works best. Each step says what to do and why, and ticks off on its own when it's done.";

async function Body() {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.newsletters");
  if (blocked) return blocked;
  if (demoMode()) {
    const base = { subscribers: sampleSubscribers(ctx.tenant).filter((x) => x.status === "subscribed").length, lists: sampleLists(ctx.tenant).length };
    return <SetupHub tools={null} demo={{ tenantId: ctx.tenant.id, base }} />;
  }
  await withTenant(scopeOf(ctx), (tx) => ensureStarterSeries(tx, ctx.sites[0]?.domain, ctx.tenant.edition));
  return <SetupHub tools={await loadSetup(ctx)} demo={null} />;
}

export default function SetupPage() {
  return (
    <>
      <PageHeader title="Set up Marketing" note={NOTE} />
      <Suspense fallback={null}>
        <Body />
      </Suspense>
    </>
  );
}
