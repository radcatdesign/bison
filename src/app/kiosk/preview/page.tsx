import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Kiosk } from "@/components/kiosk/kiosk";
import s from "@/components/kiosk/kiosk.module.css";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { demoKioskView } from "@/lib/kiosk/demo";
import { previewView } from "@/lib/kiosk/store";
import { getPortalContext, scopeOf } from "@/lib/portal";

export const metadata: Metadata = { title: { absolute: "Kiosk preview" } };

// The kiosk as it looks on a tablet, for staff signed in to the dashboard.
// Every button works, and nothing is saved or sent.
async function Body() {
  const ctx = await getPortalContext();
  const view = ctx.tenant.edition !== "fit" ? null : demoMode() ? demoKioskView(ctx) : await withTenant(scopeOf(ctx), (tx) => previewView(tx));
  if (!view) {
    return (
      <div className={s.kiosk}>
        <span />
        <span />
        <main className={s.stage}>
          <div className={s.pair}>
            <h1 className={s.title}>The front desk kiosk is for Fit Funnels clubs</h1>
            <Link href="/settings" className={s.secondary} style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>
              Back to Settings
            </Link>
          </div>
        </main>
        <span />
      </div>
    );
  }
  return <Kiosk view={view} preview previewExit="/settings/kiosk" />;
}

export default function KioskPreviewPage() {
  return (
    <Suspense fallback={<div className={s.kiosk} />}>
      <Body />
    </Suspense>
  );
}
