import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { setAccent, setSampleData } from "@/app/(portal)/actions";
import { ActionForm } from "@/components/ui/action-form";
import { PageHeader, Row, Rows, Section } from "@/components/ui";
import { CATALOG, formatPrice, PAID_ITEMS, type PaidItemKey } from "@/config/catalog";
import { may, ROLES } from "@/config/roles";
import { daysLeft, type ItemState } from "@/lib/access/entitlements";
import { withTenant } from "@/lib/db";
import { demoTeam } from "@/lib/demo";
import { demoMode } from "@/lib/env";
import { getPortalContext, scopeOf } from "@/lib/portal";

export const metadata: Metadata = { title: "Settings" };

const INTEGRATIONS = [
  { provider: "resend", name: "Email sending", breaks: "Form alerts and replies can't be emailed until your sending domain is verified." },
  { provider: "stripe-connect", name: "Your Stripe account", breaks: "Needed for Sales. Checkout and invoices pay into this account." },
  { provider: "shipstation", name: "ShipStation", breaks: "Needed for live shipping rates and sending paid orders to fulfillment." },
];

function itemStatus(state: ItemState, key: PaidItemKey): string {
  const included = CATALOG[key].includedWith?.find((k) => k !== key);
  if (state.via === "trial" && state.trialEndsAt) return `Trial, ${daysLeft(state.trialEndsAt)} days left`;
  if (state.pastDue) return "On, payment failed";
  if (state.active) return "On";
  if (included) return `Off, or get it with ${CATALOG[included].name}`;
  return "Off";
}

async function SettingsBody() {
  const ctx = await getPortalContext();
  const demo = demoMode();
  const canManage = may(ctx.member.role, "settings.manage") && !demo;
  const { members, integrations } = demo
    ? { members: demoTeam(ctx), integrations: [] as { provider: string; status: string; last_error: string | null }[] }
    : await withTenant(scopeOf(ctx), async (tx) => ({
        members: await tx.selectFrom("members").select(["id", "name", "email", "role", "status"]).where("status", "!=", "removed").orderBy("created_at").execute(),
        integrations: await tx.selectFrom("integrations").select(["provider", "status", "last_error"]).execute(),
      }));

  return (
    <>
      <PageHeader title="Settings" note={`${ctx.tenant.name}. You're signed in as ${ROLES[ctx.member.role].label.toLowerCase()}.`} />

      <Section title="Data" id="data">
        <ActionForm action={setSampleData} autoSubmit testId="sample-form">
          <label style={{ display: "flex", gap: 12, alignItems: "center", cursor: canManage ? "pointer" : "default" }}>
            <input type="checkbox" name="sampleData" defaultChecked={ctx.settings.sampleData} disabled={!canManage} style={{ width: 18, height: 18, accentColor: "var(--bo-accent)" }} data-testid="sample-toggle" />
            <span>Show sample data</span>
          </label>
        </ActionForm>
        <p style={{ color: "var(--bo-fg-2)", maxWidth: "62ch" }}>
          Sample data fills every screen with made-up numbers and contacts, so you can see how everything works before your own data arrives. Nothing you change is saved while it&apos;s on.
          {demo ? " This demo always shows sample data." : !canManage && " Only owners and admins can turn it on or off."}
        </p>
      </Section>

      <Section title="Plan" id="plan">
        <Rows>
          <Row main={<><strong>{CATALOG.base.name}</strong><span className="label">{CATALOG.base.pitch}</span></>} side={<span className="pill">Included</span>} />
          {PAID_ITEMS.map((item) => {
            const state = ctx.tenant.access.states[item.key];
            return (
              <Row
                key={item.key}
                testId={`plan-${item.key}`}
                main={
                  <>
                    <strong>{item.name}</strong>
                    <span className="label">
                      {formatPrice(item.price)}
                      {item.price.placeholder ? " (placeholder)" : ""}
                    </span>
                  </>
                }
                side={
                  <>
                    <span className={state.active ? "pill pill-lit" : "pill"}>{itemStatus(state, item.key)}</span>
                    <Link href={`/settings/billing?item=${encodeURIComponent(item.key)}`} className="btn">
                      {state.active ? "Details" : "Unlock"}
                    </Link>
                  </>
                }
              />
            );
          })}
        </Rows>
      </Section>

      <Section title="Look" id="look">
        <ActionForm action={setAccent} submitLabel="Save color">
          <label className="label" htmlFor="accent">
            Accent color
          </label>
          <input id="accent" name="accent" type="color" defaultValue={ctx.settings.accent} disabled={!canManage} style={{ width: 48, height: 40, padding: 0, border: "1px solid var(--bo-rule-strong)", background: "transparent" }} />
        </ActionForm>
      </Section>

      <Section title="Team" id="team">
        <Rows>
          {members.map((m) => (
            <Row
              key={m.id}
              main={
                <>
                  <span>{m.name || m.email}</span>
                  <span className="label">{m.email}</span>
                </>
              }
              side={<span className="pill">{m.status === "invited" ? `${ROLES[m.role].label}, invited` : ROLES[m.role].label}</span>}
            />
          ))}
        </Rows>
        <p className="label">Inviting people and changing roles arrives in Phase 1.</p>
      </Section>

      <Section title="Connections" id="integrations">
        <Rows>
          {INTEGRATIONS.map((i) => {
            const row = integrations.find((r) => r.provider === i.provider);
            const status = row?.status ?? "not_set_up";
            const label = status === "connected" ? "Connected" : status === "needs_attention" ? "Needs attention" : "Not set up";
            return (
              <Row
                key={i.provider}
                main={
                  <>
                    <span>{i.name}</span>
                    <span className="label">{status === "connected" ? "Working." : row?.last_error || i.breaks}</span>
                  </>
                }
                side={<span className={status === "connected" ? "pill pill-lit" : "pill"}>{label}</span>}
              />
            );
          })}
        </Rows>
      </Section>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageHeader title="Settings" />}>
      <SettingsBody />
    </Suspense>
  );
}
