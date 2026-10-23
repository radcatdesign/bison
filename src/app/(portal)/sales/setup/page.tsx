import type { Metadata } from "next";
import { Suspense } from "react";
import { salesGate } from "@/components/sales/gate";
import { SaidHeader } from "@/components/sales/said";
import { SalesHub } from "@/components/sales/setup";
import { demoMode } from "@/lib/env";
import { getPortalContext } from "@/lib/portal";
import { loadSalesSetup } from "@/lib/sales/setup";

export const metadata: Metadata = { title: "Set up Sales" };

const NOTE: [string, string] = [
  "Step by step, in the order that works best: payments first, then what you sell, how it ships, and how you quote. Each step ticks off on its own when it's done.",
  "Step by step, in the order that works best: payments first, then your memberships and packs, checkout, and corporate quotes. Each step ticks off on its own when it's done.",
];

async function Body() {
  const ctx = await getPortalContext();
  const blocked = salesGate(ctx, "sales.estimates");
  if (blocked) return blocked;
  return <SalesHub tools={await loadSalesSetup(ctx, demoMode())} />;
}

export default function SalesSetupPage() {
  return (
    <>
      <SaidHeader title={["Set up Sales", "Set up Sales"]} note={NOTE} />
      <Suspense fallback={null}>
        <Body />
      </Suspense>
    </>
  );
}
