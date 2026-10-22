import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { startTrialAction, subscribeAction } from "@/app/(portal)/actions";
import { ActionForm } from "@/components/ui/action-form";
import { PageHeader, Row, Rows, Section } from "@/components/ui";
import { CATALOG, formatPrice, isPaidItemKey, type Limits } from "@/config/catalog";
import { may } from "@/config/roles";
import { daysLeft } from "@/lib/access/entitlements";
import { billingMode, demoMode } from "@/lib/env";
import { formatInt } from "@/lib/format";
import { getPortalContext } from "@/lib/portal";

export const metadata: Metadata = { title: "Unlock" };

const LIMIT_LABELS: Record<keyof Limits, string> = {
  sites: "Websites",
  seats: "Team members",
  retentionDays: "Days of history kept",
  eventsPerMonth: "Tracked events a month",
  emailSendsPerMonth: "Emails a month",
  subscribers: "Subscribers",
  answersPerMonth: "Assistant answers a month",
  answersPerVisitorPerDay: "Answers per visitor a day",
  translatedStringsPerMonth: "Translated lines a month",
  translatedStringsPerVisitorPerDay: "Translated lines per visitor a day",
};

async function Billing({ searchParams }: { searchParams: Promise<{ item?: string; done?: string }> }) {
  const ctx = await getPortalContext();
  const params = await searchParams;
  const key = params.item ?? params.done;
  if (!isPaidItemKey(key)) redirect("/settings#plan");

  const item = CATALOG[key];
  const state = ctx.tenant.access.states[key];
  const canBuy = may(ctx.member.role, "billing.manage");
  const limits = Object.entries(item.limits) as [keyof Limits, number][];

  return (
    <div data-testid="billing">
      <PageHeader title={item.name} note={item.pitch} actions={<Link href="/settings#plan" className="btn">All modules and add-ons</Link>} />

      {params.done && !state.active && (
        <p className="notice notice-ok" style={{ marginBottom: 24 }}>
          Thanks. {item.name} turns on as soon as Stripe confirms the payment, usually within a minute.
        </p>
      )}

      <Section title="Price">
        <p className="mono" style={{ fontSize: "var(--bo-text-xl)" }}>
          {formatPrice(item.price)}
        </p>
        {item.price.placeholder && <p className="label">Placeholder price. Final pricing isn&apos;t set yet.</p>}
        {limits.length > 0 && (
          <Rows>
            {limits.map(([k, v]) => (
              <Row key={k} main={<span>{LIMIT_LABELS[k]}</span>} side={<span className="mono">{formatInt(v)}</span>} />
            ))}
          </Rows>
        )}
      </Section>

      <Section title="Status">
        {state.active ? (
          <p data-testid="billing-status">
            {state.via === "trial" && state.trialEndsAt ? `On as a trial. ${daysLeft(state.trialEndsAt)} days left.` : state.via === "grant" ? "On. Bison added this for you." : "On."}
          </p>
        ) : (
          <p data-testid="billing-status">Off. Your data stays put whether it&apos;s on or off.</p>
        )}

        {!canBuy && <p className="notice">Only an owner can change the plan.</p>}

        {canBuy && (
          <div style={{ display: "grid", gap: 16 }}>
            {!state.active && !state.trialUsed && item.trialDays > 0 && (
              <ActionForm action={startTrialAction} submitLabel={`Start ${item.trialDays}-day trial`} pendingLabel="Starting" primary testId="start-trial">
                <input type="hidden" name="item" value={key} />
              </ActionForm>
            )}
            {state.via !== "subscription" && (
              <ActionForm action={subscribeAction} submitLabel={`Subscribe to ${item.name}`} pendingLabel="Opening checkout" testId="subscribe">
                <input type="hidden" name="item" value={key} />
              </ActionForm>
            )}
            {demoMode() ? (
              <p className="label">This is a demo, so trials and subscriptions aren&apos;t saved.</p>
            ) : (
              <>
                {billingMode() === "fake" && <p className="label">Test billing is on. Subscribing turns the item on without charging a card.</p>}
                {billingMode() === "not_set_up" && <p className="notice notice-error">Billing isn&apos;t set up yet, so subscribing won&apos;t work. Trials still do.</p>}
              </>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

export default function BillingPage({ searchParams }: PageProps<"/settings/billing">) {
  return (
    <Suspense fallback={<PageHeader title="Unlock" />}>
      <Billing searchParams={searchParams as Promise<{ item?: string; done?: string }>} />
    </Suspense>
  );
}
