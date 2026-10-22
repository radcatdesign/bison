import Link from "next/link";
import type { ReactNode } from "react";
import { CATALOG, formatPrice, type PaidItemKey } from "@/config/catalog";
import s from "./ui.module.css";

export function PageHeader({ title, note, actions }: { title: string; note?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={s.pageHead}>
      <div>
        <h1 className={s.pageTitle}>{title}</h1>
        {note && <p className={s.pageNote}>{note}</p>}
      </div>
      {actions}
    </div>
  );
}

/** The "?" next to every number. Opens a short note on exactly how it's measured. */
export function Help({ title, children, idSuffix = "" }: { title: string; children: ReactNode; idSuffix?: string }) {
  const id = `help-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${idSuffix}`;
  return (
    <>
      <button type="button" className={s.helpButton} popoverTarget={id} aria-label={`How ${title.toLowerCase()} is measured`}>
        ?
      </button>
      <div id={id} popover="auto" className={s.helpPop} role="note">
        <strong className={s.helpTitle}>{title}</strong>
        {children}
      </div>
    </>
  );
}

export function Metric({
  label,
  value,
  help,
  delta,
  lead,
  testId,
}: {
  label: string;
  value: string;
  help: ReactNode;
  delta?: string | null;
  lead?: boolean;
  testId?: string;
}) {
  return (
    <div className={`${s.metric} ${lead ? s.metricLead : ""}`} data-testid={testId}>
      <div className={s.metricLabel}>
        <span className="label">{label}</span>
        <Help title={label}>{help}</Help>
      </div>
      <div className={`mono ${s.metricValue}`}>{value}</div>
      {delta && <div className={`mono ${s.delta}`}>{delta}</div>}
    </div>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className={s.metrics}>{children}</div>;
}

export function Section({ title, id, children, aside }: { title: string; id?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className={s.section} id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
        <h2 className={s.sectionTitle} id={id ? `${id}-title` : undefined}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <div className={s.rows}>{children}</div>;
}

export function Row({ main, side, testId }: { main: ReactNode; side?: ReactNode; testId?: string }) {
  return (
    <div className={s.row} data-testid={testId}>
      <div className={s.rowMain}>{main}</div>
      {side && <div className={s.rowSide}>{side}</div>}
    </div>
  );
}

/** What a locked module shows instead of its pages. Never a broken page. */
export function Locked({ item, canBuy, trialUsed }: { item: PaidItemKey; canBuy: boolean; trialUsed: boolean }) {
  const spec = CATALOG[item];
  return (
    <div className={s.locked} data-testid="locked">
      <span className="pill">Not on your plan</span>
      <h1 className={s.lockedName}>{spec.name}</h1>
      <p className={s.lockedPitch}>{spec.pitch}</p>
      <p className="label">
        {formatPrice(spec.price)}
        {spec.price.placeholder ? " (placeholder price)" : ""}
        {!trialUsed && spec.trialDays ? `, or try it free for ${spec.trialDays} days` : ""}
      </p>
      {canBuy ? (
        <div className={s.lockedActions}>
          <Link href={`/settings/billing?item=${encodeURIComponent(item)}`} className="btn btn-primary" data-testid="unlock">
            Unlock {spec.name}
          </Link>
        </div>
      ) : (
        <p className="notice">Ask an owner on your team to unlock {spec.name}.</p>
      )}
    </div>
  );
}

export function Planned({ items }: { items: { title: string; body: string }[] }) {
  return (
    <div className={s.planned}>
      {items.map((i) => (
        <div key={i.title} className={s.plannedItem}>
          <strong>{i.title}</strong>
          <p>{i.body}</p>
        </div>
      ))}
    </div>
  );
}

export function SampleBanner({ demo = false }: { demo?: boolean }) {
  if (demo) {
    return (
      <div className={s.banner} data-testid="sample-banner">
        <span>This is a demo. The companies, people and numbers are made up, and nothing you change is saved.</span>
        <Link href="/sign-in">Try another person</Link>
      </div>
    );
  }
  return (
    <div className={s.banner} data-testid="sample-banner">
      <span>You&apos;re looking at sample data. Nothing you change here is saved.</span>
      <Link href="/settings#data">Turn it off in Settings</Link>
    </div>
  );
}

export function RoleBlocked({ mode }: { mode: string }) {
  return (
    <div className={s.locked} data-testid="role-blocked">
      <h1 className={s.lockedName}>{mode}</h1>
      <p className={s.lockedPitch}>Your role doesn&apos;t include {mode}. Ask an owner or admin to change your role in Settings.</p>
    </div>
  );
}
