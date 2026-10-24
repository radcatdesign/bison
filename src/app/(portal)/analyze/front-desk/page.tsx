import { CalendarCheck, PenLine, Ticket, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, Help, Metric, MetricStrip, PageHeader, SampleBanner } from "@/components/ui";
import { demoMode } from "@/lib/env";
import { formatAgo, formatInt } from "@/lib/format";
import { type DeskKind, frontDesk } from "@/lib/kiosk/repo";
import { getPortalContext } from "@/lib/portal";
import s from "./front-desk.module.css";

export const metadata: Metadata = { title: "Front desk" };

const KIND: Record<DeskKind, { label: string; icon: typeof UserCheck }> = {
  checkin: { label: "Checked in", icon: UserCheck },
  pass: { label: "Claimed a free pass", icon: Ticket },
  tour: { label: "Asked for a tour", icon: CalendarCheck },
  waiver: { label: "Signed the waiver", icon: PenLine },
};

const HELP: Record<DeskKind, string> = {
  checkin: "Check-ins at your kiosk tablets since midnight, your club's time. Someone who checks in twice within 30 minutes counts once.",
  pass: "Free passes claimed at your kiosk tablets since midnight. Passes from your website's pages are in Leads, not here.",
  tour: "Tour requests made at your kiosk tablets since midnight.",
  waiver: "Waivers signed at your kiosk tablets since midnight. Someone signing a new version of your waiver counts again.",
};

async function Body() {
  const ctx = await getPortalContext();
  if (ctx.tenant.edition !== "fit") notFound();
  const d = await frontDesk(ctx);
  return (
    <>
      {d.sample && <SampleBanner demo={demoMode()} />}
      <PageHeader
        title="Front desk"
        note="What's happened at your kiosk tablets today: check-ins, free passes, tours and waivers."
        actions={
          <Link href="/settings/kiosk" className="btn">
            Kiosk settings
          </Link>
        }
      />
      <Card title="Today" flush testId="desk-today">
        <MetricStrip>
          {(Object.keys(KIND) as DeskKind[]).map((k) => (
            <Metric key={k} label={k === "checkin" ? "Check-ins" : k === "pass" ? "Free passes" : k === "tour" ? "Tours" : "Waivers"} value={formatInt(d.today[k])} help={HELP[k]} testId={`desk-${k}`} />
          ))}
        </MetricStrip>
        <p className={s.week}>
          Last 7 days, including today: <span className="num">{formatInt(d.week.checkin)}</span> check-ins, <span className="num">{formatInt(d.week.pass)}</span> free passes, <span className="num">{formatInt(d.week.tour)}</span> tours and <span className="num">{formatInt(d.week.waiver)}</span> waivers.{" "}
          <Help title="Last 7 days">Today and the 6 days before it, from midnight in your club&apos;s time, counted the same way as today&apos;s numbers above.</Help>
        </p>
      </Card>

      <div className={s.cols}>
        <Card title="Latest" flush testId="desk-latest">
          {d.recent.length === 0 ? (
            <p className={s.empty}>Nothing yet. When someone uses a kiosk tablet, it shows up here.</p>
          ) : (
            <ol className={s.list}>
              {d.recent.map((e, i) => {
                const K = KIND[e.kind];
                const Icon = K.icon;
                return (
                  <li key={`${e.at.getTime()}-${i}`} className={s.item}>
                    <span className={s.icon} aria-hidden="true">
                      <Icon />
                    </span>
                    <span className={s.what}>
                      {e.contactId && !d.sample ? (
                        <Link href={`/analyze/contacts?c=${encodeURIComponent(e.contactId)}`} className={s.name}>
                          {e.name}
                        </Link>
                      ) : (
                        <span className={s.name}>{e.name}</span>
                      )}
                      <span className="muted">{K.label}</span>
                    </span>
                    <span className={`muted ${s.when}`}>{formatAgo(e.at)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <Card title="Tablets" flush testId="desk-tablets">
          {d.tablets.length === 0 ? (
            <p className={s.empty}>
              No tablets paired yet.{" "}
              <Link href="/settings/kiosk" className="link">
                Pair one in Settings
              </Link>
              .
            </p>
          ) : (
            <ul className={s.list}>
              {d.tablets.map((t, i) => {
                const on = t.online;
                return (
                  <li key={`${t.name}-${i}`} className={s.item}>
                    <span className={s.what}>
                      <span className={s.name}>{t.name}</span>
                      <span className="muted">Last seen {formatAgo(t.lastSeenAt)}</span>
                    </span>
                    <span className={on ? "pill pill-good" : "pill pill-warn"}>{on ? "On" : "Quiet"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

export default function FrontDeskPage() {
  return (
    <Suspense fallback={<PageHeader title="Front desk" />}>
      <Body />
    </Suspense>
  );
}
