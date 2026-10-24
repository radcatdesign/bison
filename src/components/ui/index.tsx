import { ArrowDownRight, ArrowUpRight, CircleHelp, Info, Lock, Minus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Change } from "@/lib/format";
import s from "./ui.module.css";

export function PageHeader({ title, note, actions }: { title: string; note?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={s.pageHead}>
      <div className={s.pageHeadText}>
        <h1 className={s.pageTitle}>{title}</h1>
        {note && <p className={s.pageNote}>{note}</p>}
      </div>
      {actions && <div className={s.pageActions}>{actions}</div>}
    </div>
  );
}

/** A row of links that behaves like a segmented control, for ranges and filters. */
export function Segmented({ items, label }: { items: { href: string; label: string; current: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className={s.segmented}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={s.segment} aria-current={i.current ? "true" : undefined} scroll={false}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** The "?" next to every number. Opens a short note on exactly how it's measured. */
export function Help({ title, children, idSuffix = "" }: { title: string; children: ReactNode; idSuffix?: string }) {
  const id = `help-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${idSuffix}`;
  return (
    <>
      <button type="button" className={s.helpButton} popoverTarget={id} aria-label={`How ${title.toLowerCase()} is measured`}>
        <CircleHelp aria-hidden="true" />
      </button>
      <div id={id} popover="auto" className={s.helpPop} role="note">
        <strong className={s.helpTitle}>{title}</strong>
        {children}
      </div>
    </>
  );
}

export function ChangeChip({ change }: { change: Change | null }) {
  if (!change) return null;
  const Icon = change.direction === "up" ? ArrowUpRight : change.direction === "down" ? ArrowDownRight : Minus;
  return (
    <span className={s.change} data-tone={change.tone} title={change.sentence}>
      <Icon aria-hidden="true" />
      <span className="num">{change.label}</span>
      <span className="visually-hidden">{change.sentence}</span>
    </span>
  );
}

export function Metric({
  label,
  value,
  help,
  change,
  size = "strip",
  testId,
}: {
  label: string;
  value: string;
  help: ReactNode;
  change?: Change | null;
  size?: "hero" | "strip";
  testId?: string;
}) {
  return (
    <div className={size === "hero" ? s.metricHero : s.metric} data-testid={testId}>
      <div className={s.metricLabel}>
        <span>{label}</span>
        <Help title={label}>{help}</Help>
      </div>
      <div className={s.metricLine}>
        <span className={`num ${s.metricValue}`}>{value}</span>
        <ChangeChip change={change ?? null} />
      </div>
    </div>
  );
}

export function MetricStrip({ children }: { children: ReactNode }) {
  return <div className={s.metricStrip}>{children}</div>;
}

export function Card({
  title,
  note,
  aside,
  children,
  id,
  flush,
  testId,
}: {
  title?: string;
  note?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  id?: string;
  flush?: boolean;
  testId?: string;
}) {
  return (
    <section className={`card ${s.cardBox}`} id={id} aria-labelledby={id && title ? `${id}-title` : undefined} data-testid={testId}>
      {(title || aside) && (
        <header className={s.cardHead}>
          <div className={s.cardHeadText}>
            {title && (
              <h2 className={s.cardTitle} id={id ? `${id}-title` : undefined}>
                {title}
              </h2>
            )}
            {note && <p className={s.cardNote}>{note}</p>}
          </div>
          {aside}
        </header>
      )}
      <div className={flush ? undefined : s.cardBody}>{children}</div>
    </section>
  );
}

/** Kept for pages that group content without a card. */
export function Section({ title, id, children, aside }: { title: string; id?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className={s.section} id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className={s.sectionHead}>
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

export { Locked } from "./locked";

export function Planned({ items }: { items: { title: string; body: string }[] }) {
  return (
    <div className={s.planned}>
      {items.map((i) => (
        <div key={i.title} className={`card ${s.plannedItem}`}>
          <strong>{i.title}</strong>
          <p>{i.body}</p>
        </div>
      ))}
    </div>
  );
}

export function SampleBanner({ demo = false }: { demo?: boolean }) {
  return (
    <div className={s.banner} data-testid="sample-banner">
      <Info aria-hidden="true" className={s.bannerIcon} />
      <span className={s.bannerText}>
        {demo
          ? "This is a demo. The companies, people and numbers are made up, and nothing you change is saved."
          : "You're looking at sample data. Nothing you change here is saved."}
      </span>
      {demo ? (
        <Link href="/sign-in" className="link">
          Try another person
        </Link>
      ) : (
        <Link href="/settings#data" className="link">
          Turn it off in Settings
        </Link>
      )}
    </div>
  );
}

export function RoleBlocked({ mode }: { mode: string }) {
  return (
    <div className={s.lockedWrap}>
      <div className={`card ${s.locked}`} data-testid="role-blocked">
        <span className={s.lockBadge} aria-hidden="true">
          <Lock />
        </span>
        <h1 className={s.lockedName}>{mode}</h1>
        <p className={s.lockedPitch}>Your role doesn&apos;t include {mode}. Ask an owner or admin to change your role in Settings.</p>
      </div>
    </div>
  );
}
