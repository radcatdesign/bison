import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CarrierSetup } from "@/components/sales/carrier-setup";
import { salesGate } from "@/components/sales/gate";
import { SaidHeader } from "@/components/sales/said";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { type CarrierConnection, readCarrier } from "@/lib/sales/store";

export const metadata: Metadata = { title: "Shipping connections" };

const NOTE: [string, string] = [
  "Connect your own carrier account for live rates at checkout. Choose which one checkout uses, and your boxes, in Sales, Checkout.",
  "Connect your own carrier account for live rates on gear at checkout. Only gear ships; memberships, packs and training don't. Choose which carrier checkout uses, and your boxes, in Sales, Checkout.",
];

const view = (c: CarrierConnection | null) => ({ connected: Boolean(c?.connected), detail: c?.detail ?? "", keyHint: typeof c?.config.keyHint === "string" ? c.config.keyHint : "", accountNumber: typeof c?.config.accountNumber === "string" ? c.config.accountNumber : "", error: c?.error ?? null });

async function Body() {
  const ctx = await getPortalContext();
  const blocked = salesGate(ctx, "sales.checkout");
  if (blocked) return blocked;
  const demo = demoMode();
  const [ss, ups] = demo ? [null, null] : await withTenant(scopeOf(ctx), async (tx) => [await readCarrier(tx, "shipstation"), await readCarrier(tx, "ups")]);
  return <CarrierSetup shipstation={view(ss)} ups={view(ups)} canManage={may(ctx.member.role, "settings.manage")} demo={demo} />;
}

export default function ShippingConnectionsPage() {
  return (
    <>
      <Link href="/settings#integrations" className="link" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: "var(--bo-text-sm)" }}>
        <ArrowLeft aria-hidden="true" style={{ width: 15, height: 15 }} />
        Settings
      </Link>
      <SaidHeader title={["Shipping connections", "Shipping connections"]} note={NOTE} />
      <Suspense fallback={null}>
        <Body />
      </Suspense>
    </>
  );
}
