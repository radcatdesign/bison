import type { Metadata } from "next";
import { Suspense } from "react";
import { salesGate } from "@/components/sales/gate";
import { SaidHeader } from "@/components/sales/said";
import { SalesSetupFor } from "@/components/sales/setup";
import { TradeScreen } from "@/components/sales/trade-screen";
import { SampleBanner } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { sayOf } from "@/lib/edition";
import { appUrl, demoMode } from "@/lib/env";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { salesRepo } from "@/lib/sales/repo";
import { defaultSalesSettings } from "@/lib/sales/settings";
import { getSalesSettings } from "@/lib/sales/store";

export async function generateMetadata(): Promise<Metadata> {
  return { title: sayOf(await getPortalContext())("Trade accounts", "Corporate accounts") };
}

const NOTE: [string, string] = [
  "Wholesale buyers apply on your trade page. Once you approve them, they sign in by email and see their own prices across the shop, stepping down as they buy more.",
  "Local companies apply on your corporate accounts page. Once you approve one, it signs in by email and buys memberships and packs for its staff at corporate pricing, stepping down as it buys more.",
];

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
      <SaidHeader title={["Trade accounts", "Corporate accounts"]} note={NOTE} />
      <Suspense fallback={null}>
        <Body />
      </Suspense>
    </>
  );
}
