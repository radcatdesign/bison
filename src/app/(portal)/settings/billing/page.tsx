import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { resetDemoAction, startTrialAction, subscribeAction } from "@/app/(portal)/actions";
import { ActionForm } from "@/components/ui/action-form";
import { Card, PageHeader } from "@/components/ui";
import { CATALOG, formatPrice, isPaidItemKey, type Limits } from "@/config/catalog";
import { itemOf } from "@/config/editions";
import { MODES } from "@/config/modes";
import { may, seesMode } from "@/config/roles";
import { daysLeft } from "@/lib/access/entitlements";
import { readDemoUnlocks } from "@/lib/demo-billing";
import { billingMode, demoMode } from "@/lib/env";
import { formatInt } from "@/lib/format";
import { getPortalContext } from "@/lib/portal";
import s from "./billing.module.css";

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
  pageAgentRunsPerMonth: "Page agent requests a month",
  runningPageTests: "A/B tests running at once",
  products: "Products",
  tradeAccounts: "Trade accounts",
};

/** The limits a club reads differently. */
const CLUB_LIMIT_LABELS: Partial<Record<keyof Limits, string>> = {
  pageAgentRunsPerMonth: "Funnel page agent requests a month",
  products: "Memberships, packs and gear",
  tradeAccounts: "Corporate accounts",
};

async function Billing({ searchParams }: { searchParams: Promise<{ item?: string; done?: string }> }) {
  const ctx = await getPortalContext();
  const params = await searchParams;
  const key = params.item ?? params.done;
  if (!isPaidItemKey(key)) redirect("/settings#plan");

  const item = { ...CATALOG[key], ...itemOf(ctx.tenant.edition, key) };
  const fit = ctx.tenant.edition === "fit";
  const state = ctx.tenant.access.states[key];
  const canBuy = may(ctx.member.role, "billing.manage");
  const limits = Object.entries(item.limits) as [keyof Limits, number][];
  const demo = demoMode();
  const demoChanged = demo && (await readDemoUnlocks(ctx.tenant.id)).length > 0;
  // A module that opens a mode gets a way straight into it once it's on.
  const mode = MODES.find((m) => m.item === key && seesMode(ctx.member.role, m.key));

  return (
    <div data-testid="billing">
      <Link href="/settings#plan" className={s.back}>
        <ArrowLeft aria-hidden="true" />
        Plan
      </Link>
      <PageHeader title={item.name} note={item.pitch} />

      {params.done && !state.active && (
        <p className="notice notice-ok" style={{ marginBottom: 24 }}>
          Thanks. {item.name} turns on as soon as Stripe confirms the payment, usually within a minute.
        </p>
      )}

      <div className={s.grid}>
        <section className={`card ${s.price}`} aria-label="Price">
          <div className={s.priceLine}>
            <span className={`num ${s.amount}`}>{formatPrice(item.price)}</span>
            {item.price.placeholder && <span className="pill">Placeholder price</span>}
          </div>
          {item.price.placeholder && <p className="muted">Final pricing isn&apos;t set yet.</p>}

          <div className={s.status}>
            <span className={state.active ? "pill pill-good" : "pill"}>{state.via === "trial" ? "Trial" : state.active ? "On" : "Off"}</span>
            <p data-testid="billing-status">
              {state.active
                ? state.via === "trial" && state.trialEndsAt
                  ? `On as a trial. ${daysLeft(state.trialEndsAt)} days left.`
                  : state.via === "grant"
                    ? "On. Bison added this for you."
                    : "On."
                : "Your data stays put whether it's on or off."}
            </p>
          </div>

          {state.active && mode && (
            <Link href={`/${mode.key}`} className={`btn btn-primary ${s.open}`} data-testid="open-mode">
              Open {mode.label}
              <ArrowRight aria-hidden="true" />
            </Link>
          )}

          {!canBuy && <p className="notice">Only an owner can change the plan.</p>}

          {canBuy && (
            <div className={s.actions}>
              {!state.active && !state.trialUsed && item.trialDays > 0 && (
                <ActionForm action={startTrialAction} submitLabel={`Start ${item.trialDays}-day trial`} pendingLabel="Starting" primary testId="start-trial">
                  <input type="hidden" name="item" value={key} />
                </ActionForm>
              )}
              {state.via !== "subscription" && (
                <ActionForm action={subscribeAction} submitLabel={`Subscribe to ${item.name}`} pendingLabel={demo ? "Turning on" : "Opening checkout"} testId="subscribe">
                  <input type="hidden" name="item" value={key} />
                </ActionForm>
              )}
              {demo ? (
                <p className="label">This is a demo. What you turn on stays on in this browser, and no card is charged.</p>
              ) : (
                <>
                  {billingMode() === "fake" && <p className="label">Test billing is on. Subscribing turns the item on without charging a card.</p>}
                  {billingMode() === "not_set_up" && <p className="notice notice-error">Billing isn&apos;t set up yet, so subscribing won&apos;t work. Trials still do.</p>}
                </>
              )}
            </div>
          )}

          {canBuy && demoChanged && (
            <ActionForm action={resetDemoAction} submitLabel="Reset the demo plan" pendingLabel="Resetting" testId="reset-demo" className={s.reset}>
              <span className="label">Turns off everything you turned on here.</span>
            </ActionForm>
          )}
        </section>

        {limits.length > 0 && (
          <Card title="What's included" flush>
            <dl className={s.limits}>
              {limits.map(([k, v]) => (
                <div key={k}>
                  <dt>{(fit && CLUB_LIMIT_LABELS[k]) || LIMIT_LABELS[k]}</dt>
                  <dd className="num">{formatInt(v)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </div>
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
