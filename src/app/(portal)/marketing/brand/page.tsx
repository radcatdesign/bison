import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandKitScreen } from "@/components/marketing/brand-kit-editor";
import { marketingGate } from "@/components/marketing/gate";
import { SetupFor } from "@/components/marketing/setup-for";
import { PageHeader } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { appUrl, demoMode } from "@/lib/env";
import { defaultMarketingSettings } from "@/lib/marketing/settings";
import { getMarketingSettings, settingsTenantOf } from "@/lib/marketing/store";
import { getPortalContext, scopeOf } from "@/lib/portal";

export const metadata: Metadata = { title: "Brand kit" };

const NOTE = "How every email looks: your logo, colors, fonts, sign-off and footer.";

async function Body() {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.brand-kit");
  if (blocked) return blocked;
  const demo = demoMode();
  const defaults = defaultMarketingSettings(settingsTenantOf(ctx)).brand;
  const brand = demo ? defaults : (await withTenant(scopeOf(ctx), (tx) => getMarketingSettings(tx, settingsTenantOf(ctx)))).brand;
  return (
    <>
      <PageHeader title="Brand kit" note={NOTE} />
      <SetupFor ctx={ctx} tool="brand" />
      <BrandKitScreen initial={brand} defaults={defaults} storage={demo ? "browser" : "server"} tenantId={ctx.tenant.id} canEdit={may(ctx.member.role, "marketing.edit")} baseUrl={appUrl()} />
    </>
  );
}

export default function BrandPage() {
  return (
    <Suspense fallback={<PageHeader title="Brand kit" note={NOTE} />}>
      <Body />
    </Suspense>
  );
}
