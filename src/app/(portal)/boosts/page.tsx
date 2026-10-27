import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { BoostCard } from "@/components/boosts/boost-card";
import s from "@/components/boosts/boosts.module.css";
import { Help, PageHeader, SampleBanner } from "@/components/ui";
import { may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { BOOSTS, type BoostCategory, CATEGORIES, DAY_CHOICES, PASS_DAY_CHOICES, VISIT_CHOICES } from "@/lib/boosts/catalog";
import { boostsView } from "@/lib/boosts/repo";
import { demoMode } from "@/lib/env";
import { formatInt } from "@/lib/format";
import { getPortalContext } from "@/lib/portal";
import { saveBoost } from "./actions";

export const metadata: Metadata = { title: "Boosts" };

const ORDER: BoostCategory[] = ["keep", "grow", "desk", "reputation"];
const POWER_UP = 3;

async function Body() {
  const ctx = await getPortalContext();
  if (ctx.tenant.edition !== "fit" || !can(ctx.tenant, "kiosk")) notFound();
  const view = await boostsView(ctx);
  const demo = demoMode();
  const canManage = may(ctx.member.role, "settings.manage") && !demo && !view.sample;
  const why = demo ? "This is a demo, so switches don't save." : view.sample ? "Sample data is on, so switches don't save. Turn it off in Settings to use your own." : !may(ctx.member.role, "settings.manage") ? "Only owners and admins can switch boosts on and off." : null;
  const onCount = BOOSTS.filter((b) => view.boosts[b.key].on).length;
  const meterNote =
    onCount === 0
      ? "Nothing's on yet. Pick one below and flip its switch. Each one works on its own from then on."
      : onCount < POWER_UP
        ? `Turn on ${POWER_UP - onCount} more for the Powered up achievement.`
        : onCount === BOOSTS.length
          ? "Everything's on. Your club is running at full power."
          : "Each one keeps working on its own. Check Agents for the drafts they make.";

  return (
    <>
      {view.sample && <SampleBanner demo={demo} />}
      <PageHeader title="Boosts" note="Club tools you switch on. Each one changes what your kiosk, your agents or your inbox does, and keeps doing it without you." />
      <div className={s.stack}>
        <section className={s.meter} aria-label="Boosts on" data-testid="boost-meter">
          <div className={s.meterCount}>
            <span className={`num ${s.meterBig}`} data-testid="boost-on-count">
              {onCount}
              <span className="muted" style={{ fontSize: "0.5em" }}>
                {" "}
                / {BOOSTS.length}
              </span>
            </span>
            <span className={s.meterLabel}>
              Boosts on
              <Help title="Boosts on">How many of the {BOOSTS.length} boosts your club has switched on right now.</Help>
            </span>
          </div>
          <div className={s.meterRight}>
            <div className={s.cells} style={{ "--cells": BOOSTS.length } as CSSProperties} aria-hidden="true">
              {BOOSTS.map((b) => (
                <span key={b.key} className={s.cell} data-on={view.boosts[b.key].on || undefined} />
              ))}
            </div>
            <p className={s.meterNote}>{meterNote}</p>
            {why && (
              <p className={s.why} data-testid="boost-why">
                {why}
              </p>
            )}
          </div>
        </section>

        {ORDER.map((cat) => (
          <section key={cat} className={s.group} aria-labelledby={`boosts-${cat}`} data-testid={`boost-group-${cat}`}>
            <div className={s.groupHead}>
              <h2 className={s.groupTitle} id={`boosts-${cat}`}>
                {CATEGORIES[cat].name}
              </h2>
              <p className={s.groupNote}>{CATEGORIES[cat].note}</p>
            </div>
            <div className={s.grid}>
              {BOOSTS.filter((b) => b.category === cat).map((b) => {
                const state = view.boosts[b.key];
                const stat = view.stats[b.key];
                return (
                  <BoostCard
                    key={b.key}
                    boostKey={b.key}
                    name={b.name}
                    pitch={b.pitch}
                    how={b.how}
                    by={b.by}
                    on={state.on}
                    settings={state.settings}
                    dayChoices={b.defaults.days === undefined ? null : b.key === "pass-follow-up" ? PASS_DAY_CHOICES : DAY_CHOICES}
                    visitChoices={b.defaults.visits === undefined ? null : VISIT_CHOICES}
                    needsLink={b.needs === "link"}
                    canManage={canManage}
                    blocked={view.blocked[b.key] ?? null}
                    action={saveBoost}
                    extra={
                      b.key === "lead-alerts" && view.alertsTo.length ? (
                        <p className={s.extra}>
                          Goes to {view.alertsTo.join(", ")}. Change who gets them in <Link href="/sales/checkout">Membership sales, Checkout</Link>.
                        </p>
                      ) : // With sample data on, the kiosk still shows the club's real settings, so there'd be nothing to see.
                      (!view.sample || demo) && (b.key === "bring-a-friend" || b.key === "waiver-first" || b.key === "milestones" || b.key === "streaks") ? (
                        <p className={s.extra}>
                          See it on the kiosk:{" "}
                          <a href="/kiosk/preview" target="_blank" rel="noopener">
                            open the preview<span className="visually-hidden"> (opens in a new tab)</span>
                          </a>
                          .
                        </p>
                      ) : null
                    }
                    stat={
                      <>
                        <span className={`num ${s.statValue}`}>{formatInt(stat.value)}</span>
                        <span className={s.statLabel}>
                          {stat.label}
                          <Help title={`${b.name}: ${stat.label}`} idSuffix="-boost">
                            {stat.help}
                          </Help>
                        </span>
                        {stat.waiting ? (
                          <Link href="/agents?agent=frontdesk" className={`pill pill-accent ${s.waiting}`}>
                            {formatInt(stat.waiting)} waiting in Agents
                          </Link>
                        ) : null}
                      </>
                    }
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

export default function BoostsPage() {
  return (
    <Suspense fallback={<PageHeader title="Boosts" />}>
      <Body />
    </Suspense>
  );
}
