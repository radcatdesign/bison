import type { Metadata } from "next";
import { Suspense } from "react";
import { salesGate } from "@/components/sales/gate";
import { SalesSetupFor } from "@/components/sales/setup";
import { TradeScreen } from "@/components/sales/trade-screen";
import { PageHeader, SampleBanner } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { appUrl, demoMode } from "@/lib/env";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { salesRepo } from "@/lib/sales/repo";
import { defaultSalesSettings } from "@/lib/sales/settings";
import { getSalesSettings } from "@/lib/sales/store";

export const metadata: Metadata = { title: "Trade accounts" };

const NOTE = "Wholesale buyers apply on your trade page. Once you approve them, they sign in by email and see their own prices across the shop, stepping down as they buy more.";

async function Body() {
  const ctx = await getPortalContext();
  const blocked = salesGate(ctx, "sales.trade");
  if (blocked) return blocked;
  const demo = demoMode();
  const repo = salesRepo(ctx);
  const [rows, store] = await Promise.all([repo.trade(), demo ? Promise.resolve(defaultSalesSettings()) : withTenant(scopeOf(ctx), (tx) => getSalesSettings(tx))]);
  return (
    <>
      {demo && <SampleBanner demo />}
      <SalesSetupFor ctx={ctx} tool="trade" />
      <TradeScreen
        rows={rows}
        settings={store.trade}
        currency={store.store.currency}
        timeZone={ctx.settings.timezone}
        canEdit={may(ctx.member.role, "sales.edit")}
        canSend={may(ctx.member.role, "email.send")}
        demo={demo}
        sample={repo.sample}
        publicUrl={`${appUrl()}/p/${ctx.tenant.slug}/trade`}
      />
    </>
  );
}

export default function TradePage() {
  return (
    <>
      <PageHeader title="Trade accounts" note={NOTE} />
      <Suspense fallback={null}>
        <Body />
      </Suspense>
    </>
  );
}
