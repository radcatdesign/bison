import Link from "next/link";
import { Suspense } from "react";
import { Kiosk } from "@/components/kiosk/kiosk";
import { PairTablet } from "@/components/kiosk/pair";
import s from "@/components/kiosk/kiosk.module.css";
import { demoMode } from "@/lib/env";
import { currentTablet } from "@/lib/kiosk/http";
import { kioskView } from "@/lib/kiosk/store";

// The tablet at the front desk. Paired: the club's kiosk. Not paired yet, or
// unpaired from Settings: the screen to type a code.
async function Body() {
  if (demoMode()) {
    return (
      <div className={s.kiosk} data-accent="" data-edition="fit">
        <span />
        <span />
        <main className={s.stage}>
          <div className={s.pair}>
            <h1 className={s.title}>Tablets can&apos;t be paired in the demo</h1>
            <p className={s.lead}>Sign in as a Fit Funnels club, open Settings, Kiosk, and choose Preview the kiosk to try it.</p>
            <Link href="/sign-in?edition=fit" className={s.primary} style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>
              Go to the sign-in
            </Link>
          </div>
        </main>
        <span />
      </div>
    );
  }
  const tablet = await currentTablet();
  const view = tablet ? await kioskView(tablet.scope) : null;
  return view ? <Kiosk view={view} /> : <PairTablet />;
}

export default function KioskPage() {
  return (
    <Suspense fallback={<div className={s.kiosk} />}>
      <Body />
    </Suspense>
  );
}
