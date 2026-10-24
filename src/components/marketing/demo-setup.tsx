"use client";

// Setup steps in the demo, worked out from what the visitor did in this browser.
import { useSyncExternalStore } from "react";
import { useEditionKey } from "@/components/edition";
import { buildSetup, type ToolKey, type ToolSetup } from "@/lib/marketing/setup-steps";
import { type DemoMarketing, demoSetupFacts, readDemo, subscribeDemo, writeDemo } from "./demo-store";
import { SetupGuide } from "./setup-guide";

const EMPTY: DemoMarketing = {};
let cache: { tenantId: string; raw: string; value: DemoMarketing } | null = null;

/** The demo store as a React value; re-reads when anything in it changes. */
export function useDemoMarketing(tenantId: string): DemoMarketing {
  return useSyncExternalStore(
    subscribeDemo,
    () => {
      const value = readDemo(tenantId);
      const raw = JSON.stringify(value);
      if (cache?.tenantId === tenantId && cache.raw === raw) return cache.value;
      cache = { tenantId, raw, value };
      return value;
    },
    () => EMPTY,
  );
}

export function useDemoSetup(tenantId: string, base: { subscribers: number; lists: number }): ToolSetup[] {
  const demo = useDemoMarketing(tenantId);
  return buildSetup(demoSetupFacts(demo, base), useEditionKey());
}

export function DemoToolSetup({ tenantId, tool, base }: { tenantId: string; tool: ToolKey; base: { subscribers: number; lists: number } }) {
  const tools = useDemoSetup(tenantId, base);
  const found = tools.find((t) => t.key === tool);
  if (!found) return null;
  return (
    <SetupGuide
      tool={found}
      onMark={async (key, done) => {
        if (key === "search.submit") writeDemo(tenantId, (d) => ({ ...d, search: { ...(d.search ?? defaultSearch), submitted: done } }));
        return { ok: true, message: "" };
      }}
    />
  );
}

const defaultSearch = { description: "", offerings: [], areas: "", phone: "", email: "", hours: "", businessType: "LocalBusiness" as const, profiles: [], allowAi: true, submitted: false };
