import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { setAccent, setSampleData } from "@/app/(portal)/actions";
import { ActionForm } from "@/components/ui/action-form";
import { Card, PageHeader, Row, Rows } from "@/components/ui";
import { CATALOG, formatPrice, PAID_ITEMS, type PaidItemKey } from "@/config/catalog";
import { type EditionKey, itemOf, type Say } from "@/config/editions";
import { may, ROLES } from "@/config/roles";
import { daysLeft, type ItemState } from "@/lib/access/entitlements";
import { withTenant } from "@/lib/db";
import { demoTeam } from "@/lib/demo";
import { editionOf, sayOf } from "@/lib/edition";
import { demoMode } from "@/lib/env";
import { getPortalContext, scopeOf } from "@/lib/portal";
import s from "./settings.module.css";

export const metadata: Metadata = { title: "Settings" };

const integrationsFor = (say: Say, product: string, sales: string) => [
  { provider: "resend", name: "Email sending", breaks: say("Newsletters, series, estimates and order alerts come from Bison Ops instead of your domain until it's verified.", `Newsletters, follow-ups, quotes and purchase alerts come from ${product} instead of your club's domain until it's verified.`), href: "/settings/email" },
  { provider: "stripe", name: "Your Stripe account", breaks: say("Needed for Sales. Checkout and invoices pay into this account; without it, the shop can't take payment.", `Needed for ${sales}. Memberships, packs and paid quotes pay into this account; without it, your club's online store can't take payment.`), href: "/settings/payments" },
  { provider: "shipstation", name: "ShipStation", breaks: say("For live shipping rates and sending paid orders to be packed and labeled.", "For live shipping rates on gear, and sending paid purchases to be packed and labeled."), href: "/settings/shipping" },
  { provider: "ups", name: "UPS", breaks: say("For live UPS rates at checkout with your own account's prices.", "For live UPS rates on gear at checkout, with your own account's prices."), href: "/settings/shipping" },
];

function itemStatus(state: ItemState, key: PaidItemKey, edition: EditionKey): { label: string; tone: string } {
  const included = CATALOG[key].includedWith?.find((k) => k !== key);
  if (state.via === "trial" && state.trialEndsAt) return { label: `Trial, ${daysLeft(state.trialEndsAt)} days left`, tone: "pill pill-accent" };
  if (state.pastDue) return { label: "On, payment failed", tone: "pill pill-bad" };
  if (state.active) return { label: "On", tone: "pill pill-good" };
  if (included) return { label: `Off, or get it with ${itemOf(edition, included).name}`, tone: "pill" };
  return { label: "Off", tone: "pill" };
}

function initials(name: string, email: string) {
  const parts = (name || email).split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

async function SettingsBody() {
  const ctx = await getPortalContext();
  const demo = demoMode();
  const say = sayOf(ctx);
  const edition = ctx.tenant.edition;
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

      <div className={s.stack}>
        <Card title="Data" id="data" note={say("Sample data fills every screen with made-up numbers and contacts, so you can see how everything works before your own data arrives.", "Sample data fills every screen with made-up numbers, leads and members, so you can see how everything works before your club's own data arrives.")}>
          <ActionForm action={setSampleData} autoSubmit testId="sample-form">
            <label className={s.toggleRow} data-disabled={!canManage || undefined}>
              <span>
                <span className={s.toggleTitle}>Show sample data</span>
                <span className={s.toggleNote}>
                  Nothing you change is saved while it&apos;s on.
                  {demo ? " This demo always shows sample data." : !canManage && " Only owners and admins can turn it on or off."}
                </span>
              </span>
              <input type="checkbox" className="switch" name="sampleData" defaultChecked={ctx.settings.sampleData} disabled={!canManage} data-testid="sample-toggle" />
            </label>
          </ActionForm>
        </Card>

        <Card title="Plan" id="plan" note="Analytics is included. Turn on modules and add-ons as you need them; your data stays put either way." flush>
          <div className={s.plan}>
            <div className={s.planRow}>
              <div className={s.planName}>
                <strong>{itemOf(edition, "base").name}</strong>
                <span className="muted">{say("Included with every account", "Included with every club")}</span>
              </div>
              <span className="pill pill-good">On</span>
            </div>
            {PAID_ITEMS.map((item) => {
              const state = ctx.tenant.access.states[item.key];
              const status = itemStatus(state, item.key, edition);
              return (
                <div key={item.key} className={s.planRow} data-testid={`plan-${item.key}`}>
                  <div className={s.planName}>
                    <strong>{itemOf(edition, item.key).name}</strong>
                    <span className="muted">
                      <span className="num">{formatPrice(item.price)}</span>
                      {item.price.placeholder ? ", placeholder" : ""}
                    </span>
                  </div>
                  <div className={s.planSide}>
                    <span className={status.tone}>{status.label}</span>
                    <Link href={`/settings/billing?item=${encodeURIComponent(item.key)}`} className="btn">
                      {state.active ? "Details" : "Unlock"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Appearance" id="look" note="Your accent color shows up across the dashboard for everyone on your team. Light or dark is set per person, in the sidebar.">
          <ActionForm action={setAccent} submitLabel="Save color">
            <label className={s.colorField} htmlFor="accent">
              <input id="accent" name="accent" type="color" defaultValue={ctx.settings.accent} disabled={!canManage} className={s.color} />
              <span className="mono">{ctx.settings.accent}</span>
            </label>
          </ActionForm>
        </Card>

        <Card title="Team" id="team" note="Inviting people and changing roles arrives in Phase 1." flush>
          <div className={s.plan}>
            {members.map((m) => (
              <div key={m.id} className={s.planRow}>
                <div className={s.person}>
                  <span className={s.avatar} aria-hidden="true">
                    {initials(m.name, m.email)}
                  </span>
                  <div className={s.planName}>
                    <strong>{m.name || m.email}</strong>
                    <span className="muted">{m.email}</span>
                  </div>
                </div>
                <span className="pill">{m.status === "invited" ? `${ROLES[m.role].label}, invited` : m.status === "pending" ? `${ROLES[m.role].label}, waiting for approval` : ROLES[m.role].label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Connections" id="integrations" flush>
          <div className={s.plan}>
            <Rows>
              {integrationsFor(say, editionOf(ctx).productName, itemOf(edition, "module:sales").name).map((i) => {
                const row = integrations.find((r) => r.provider === i.provider);
                const status = row?.status ?? "not_set_up";
                const label = status === "connected" ? "Connected" : status === "needs_attention" ? "Needs attention" : "Not set up";
                return (
                  <Row
                    key={i.provider}
                    main={
                      <>
                        <strong>{i.name}</strong>
                        <span className="muted">{status === "connected" ? "Working." : row?.last_error || i.breaks}</span>
                      </>
                    }
                    side={
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className={status === "connected" ? "pill pill-good" : status === "needs_attention" ? "pill pill-warn" : "pill"}>{label}</span>
                        {"href" in i && i.href && (
                          <Link href={i.href} className="btn" data-testid={`connect-${i.provider}`}>
                            {status === "connected" ? "Details" : "Set up"}
                          </Link>
                        )}
                      </span>
                    }
                  />
                );
              })}
            </Rows>
          </div>
        </Card>
      </div>
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
