import type { Metadata } from "next";
import { Suspense } from "react";
import { type DiscountItem, DiscountScreen } from "@/components/sales/discount-screen";
import { salesGate } from "@/components/sales/gate";
import type { Tone } from "@/components/sales/labels";
import { SalesSetupFor } from "@/components/sales/setup";
import { PageHeader, SampleBanner } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { sampleUuid } from "@/lib/sample/sales";
import { type DiscountRow, listDiscounts } from "@/lib/sales/discount-codes";
import { getSalesSettings } from "@/lib/sales/store";

export const metadata: Metadata = { title: "Discount codes" };

const NOTE = "Private codes for the shop. Each one is spelled out in a sentence, so everyone on the team knows what it does. Welcome codes from Marketing are made one per person and aren't listed here.";

const DAY = 86_400_000;

/** Where a code stands today, in a word or two. */
function stateOf(r: DiscountRow, now: Date, timeZone: string): { label: string; tone: Tone } {
  if (!r.active) return { label: "Off", tone: "neutral" };
  if (r.expiresAt && now >= r.expiresAt) return { label: "Ended", tone: "neutral" };
  if ((r.usage === "single_use" && r.uses >= 1) || (r.maxUses && r.uses >= r.maxUses)) return { label: "Used up", tone: "neutral" };
  if (r.startsAt && now < r.startsAt) return { label: `Starts ${r.startsAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })}`, tone: "accent" };
  return { label: "On", tone: "good" };
}

/** A few made-up codes for the demo, which has no database. */
function demoCodes(tenantId: string, now: Date): DiscountRow[] {
  const base = { tradeAccountId: null, tradeAccountName: null, startsAt: null, held: 0, createdAt: now };
  return [
    { ...base, id: sampleUuid(`${tenantId}:code:welcome`), code: "WELCOME10", percentOff: 10, amountOffCents: null, usage: "per_account", maxUses: null, minOrderCents: null, expiresAt: null, active: true, note: "On the shop's welcome banner", uses: 64, held: 1 },
    { ...base, id: sampleUuid(`${tenantId}:code:spring`), code: "SPRING25", percentOff: null, amountOffCents: 2500, usage: "unlimited", maxUses: 500, minOrderCents: 20000, expiresAt: new Date(now.getTime() + 24 * DAY), active: true, note: "April newsletter", uses: 131 },
    { ...base, id: sampleUuid(`${tenantId}:code:show`), code: "SHOW-2026", percentOff: 15, amountOffCents: null, usage: "per_account", maxUses: 200, minOrderCents: null, expiresAt: new Date(now.getTime() - 40 * DAY), active: true, note: "Handed out at the trade show", uses: 58 },
    { ...base, id: sampleUuid(`${tenantId}:code:sample`), code: "FREESAMPLE", percentOff: 100, amountOffCents: null, usage: "single_use", maxUses: 1, minOrderCents: null, expiresAt: null, active: true, note: "For one customer who had a damaged box", uses: 1 },
  ];
}

async function Body() {
  const ctx = await getPortalContext();
  const blocked = salesGate(ctx, "sales.discounts");
  if (blocked) return blocked;
  const demo = demoMode();
  const now = new Date();
  const timeZone = ctx.settings.timezone;
  const data = demo
    ? { rows: demoCodes(ctx.tenant.id, now), currency: "usd", trade: [] as { id: string; company: string }[] }
    : await withTenant(scopeOf(ctx), async (tx) => ({
        rows: await listDiscounts(tx),
        currency: (await getSalesSettings(tx)).store.currency,
        trade: await tx.selectFrom("trade_accounts").select(["id", "company"]).where("status", "=", "approved").orderBy("company").limit(500).execute(),
      }));
  const rows: DiscountItem[] = data.rows.map((r) => ({ ...r, state: stateOf(r, now, timeZone) }));
  return (
    <>
      <SalesSetupFor ctx={ctx} tool="discounts" />
      {demo && <SampleBanner demo />}
      <DiscountScreen rows={rows} currency={data.currency} timeZone={timeZone} canEdit={may(ctx.member.role, "sales.edit")} demo={demo} tradeAccounts={data.trade} />
    </>
  );
}

export default function DiscountsPage() {
  return (
    <>
      <PageHeader title="Discount codes" note={NOTE} />
      <Suspense fallback={null}>
        <Body />
      </Suspense>
    </>
  );
}
