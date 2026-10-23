import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutSettings } from "@/components/sales/checkout-settings";
import { salesGate } from "@/components/sales/gate";
import { SalesSetupFor } from "@/components/sales/setup";
import { PageHeader } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { demoTeam } from "@/lib/demo";
import { appUrl, demoMode } from "@/lib/env";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { defaultSalesSettings } from "@/lib/sales/settings";
import { getSalesSettings, readCarrier, readPayments } from "@/lib/sales/store";

export const metadata: Metadata = { title: "Checkout" };

const NOTE = "Your shop link, who hears about orders, tax, big orders and estimate defaults, and how everything ships.";

async function Body() {
  const ctx = await getPortalContext();
  const blocked = salesGate(ctx, "sales.checkout");
  if (blocked) return blocked;
  const demo = demoMode();
  const data = demo
    ? { settings: defaultSalesSettings(demoTeam(ctx).filter((m) => m.role === "owner").map((m) => m.email)), team: demoTeam(ctx).map((m) => ({ email: m.email, name: m.name })), tax: false, ss: false, ups: false }
    : await withTenant(scopeOf(ctx), async (tx) => ({
        settings: await getSalesSettings(tx),
        team: (await tx.selectFrom("members").select(["email", "name"]).where("status", "=", "active").orderBy("name").execute()).map((m) => ({ email: m.email.toLowerCase(), name: m.name })),
        tax: (await readPayments(tx)).tax === "active",
        ss: (await readCarrier(tx, "shipstation")).connected,
        ups: (await readCarrier(tx, "ups")).connected,
      }));
  return (
    <>
      <SalesSetupFor ctx={ctx} tool="shipping" />
      <CheckoutSettings store={data.settings.store} shipping={data.settings.shipping} team={data.team} shopUrl={`${appUrl()}/p/${ctx.tenant.slug}/shop`} canEdit={may(ctx.member.role, "sales.edit")} taxActive={data.tax} carriers={{ shipstation: data.ss, ups: data.ups }} demo={demo} />
    </>
  );
}

export default function CheckoutSettingsPage() {
  return (
    <>
      <PageHeader title="Checkout" note={NOTE} />
      <Suspense fallback={null}>
        <Body />
      </Suspense>
    </>
  );
}
