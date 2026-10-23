import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { salesGate } from "@/components/sales/gate";
import { PaymentsSetup } from "@/components/sales/payments-setup";
import { PageHeader } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { refreshPayments } from "@/lib/sales/connect";
import { paymentsProvider, paymentsProviderName } from "@/lib/sales/payments";
import { NO_PAYMENTS, readPayments } from "@/lib/sales/store";

export const metadata: Metadata = { title: "Payments" };

const NOTE = "Checkout and invoices pay straight into your own Stripe account. Bison Ops never holds your money or your bank details.";

async function Body({ searchParams }: { searchParams: Promise<{ back?: string; error?: string }> }) {
  const ctx = await getPortalContext();
  const blocked = salesGate(ctx, "sales.checkout");
  if (blocked) return blocked;
  const sp = await searchParams;
  const demo = demoMode();
  let conn = demo ? NO_PAYMENTS : await withTenant(scopeOf(ctx), (tx) => readPayments(tx));
  // Back from Stripe, or still waiting on Stripe: read the account fresh.
  if (!demo && conn.accountId && (sp.back || !conn.chargesEnabled || conn.tax !== "active")) conn = await refreshPayments(ctx.tenant.id);
  const provider = paymentsProvider();
  return (
    <PaymentsSetup
      serverReady={paymentsProviderName() !== "none"}
      canManage={may(ctx.member.role, "settings.manage")}
      isOwner={ctx.member.role === "owner"}
      demo={demo}
      conn={{ accountId: conn.accountId, chargesEnabled: conn.chargesEnabled, needsAction: conn.needsAction, status: conn.status, tax: conn.tax, error: conn.error }}
      dashboardUrl={conn.accountId && provider ? provider.dashboardUrl(conn.accountId) : null}
      error={sp.error ?? null}
    />
  );
}

export default function PaymentsPage({ searchParams }: { searchParams: Promise<{ back?: string; error?: string }> }) {
  return (
    <>
      <Link href="/settings#integrations" className="link" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: "var(--bo-text-sm)" }}>
        <ArrowLeft aria-hidden="true" style={{ width: 15, height: 15 }} />
        Settings
      </Link>
      <PageHeader title="Payments" note={NOTE} />
      <Suspense fallback={null}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}
