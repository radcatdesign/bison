"use client";

// One boost: what it does, whether it's on, and its settings. The switch saves
// as soon as it's flipped; a review link saves with its own button.
import { BellRing, Flame, HeartHandshake, PenLine, Star, Ticket, Trophy, UserPlus, type LucideIcon } from "lucide-react";
import { type ReactNode, startTransition, useActionState, useRef, useState } from "react";
import type { BoostResult } from "@/app/(portal)/boosts/actions";
import type { BoostKey, BoostSettings } from "@/lib/boosts/catalog";
import s from "./boosts.module.css";

const ICONS: Record<BoostKey, LucideIcon> = {
  "miss-you": HeartHandshake,
  "pass-follow-up": Ticket,
  milestones: Trophy,
  streaks: Flame,
  "review-ask": Star,
  "bring-a-friend": UserPlus,
  "waiver-first": PenLine,
  "lead-alerts": BellRing,
};

export type BoostCardProps = {
  boostKey: BoostKey;
  name: string;
  pitch: string;
  how: string[];
  by: string;
  on: boolean;
  settings: BoostSettings;
  dayChoices: readonly number[] | null;
  visitChoices: readonly number[] | null;
  needsLink: boolean;
  /** Server-rendered: the 30-day number with its Help. */
  stat: ReactNode;
  blocked: string | null;
  extra: ReactNode;
  canManage: boolean;
  action: (prev: BoostResult, form: FormData) => Promise<BoostResult>;
};

export function BoostCard(p: BoostCardProps) {
  const [state, run, pending] = useActionState(p.action, null);
  const [want, setWant] = useState(p.on);
  const form = useRef<HTMLFormElement>(null);
  // While saving, show what was asked for; after, what the server said.
  const on = pending ? want : state && state.on !== undefined ? state.on : p.on;
  const Icon = ICONS[p.boostKey];

  const save = (nextOn: boolean) => {
    if (!form.current) return;
    const data = new FormData(form.current);
    data.set("on", nextOn ? "on" : "");
    setWant(nextOn);
    startTransition(() => run(data));
  };

  return (
    <article className={s.card} data-on={on || undefined} data-testid={`boost-${p.boostKey}`}>
      <header className={s.cardHead}>
        <span className={s.icon} aria-hidden="true">
          <Icon />
        </span>
        <div className={s.cardTitleWrap}>
          <h3 className={s.cardTitle} id={`boost-${p.boostKey}-title`}>
            {p.name}
          </h3>
          <span className={s.by}>{p.by}</span>
        </div>
        <label className={s.switchWrap}>
          <span className="visually-hidden">{p.name}</span>
          <span className={s.state} aria-hidden="true">
            {on ? "On" : "Off"}
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={on}
            disabled={!p.canManage || pending}
            onChange={(e) => save(e.target.checked)}
            aria-describedby={`boost-${p.boostKey}-pitch`}
            data-testid={`boost-switch-${p.boostKey}`}
          />
        </label>
      </header>

      <p className={s.pitch} id={`boost-${p.boostKey}-pitch`}>
        {p.pitch}
      </p>

      <ul className={s.how}>
        {p.how.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>

      <form
        ref={form}
        className={s.settings}
        data-empty={!p.dayChoices && !p.visitChoices && !p.needsLink ? "" : undefined}
        action={(data) => {
          data.set("on", on ? "on" : "");
          run(data);
        }}
      >
        <input type="hidden" name="key" value={p.boostKey} />
        {p.dayChoices && (
          <label className={s.setting}>
            <span>{p.boostKey === "pass-follow-up" ? "Remind after" : "Drifting after"}</span>
            <select className="select" name="days" defaultValue={p.settings.days} disabled={!p.canManage || pending} onChange={() => save(on)} data-testid={`boost-days-${p.boostKey}`}>
              {p.dayChoices.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
        )}
        {p.visitChoices && (
          <label className={s.setting}>
            <span>Ask after</span>
            <select className="select" name="visits" defaultValue={p.settings.visits} disabled={!p.canManage || pending} onChange={() => save(on)}>
              {p.visitChoices.map((v) => (
                <option key={v} value={v}>
                  {v} visits
                </option>
              ))}
            </select>
          </label>
        )}
        {p.needsLink && (
          <div className={s.linkRow}>
            <label className={s.setting}>
              <span>Your review link</span>
              <input className="input" name="link" type="url" inputMode="url" placeholder="https://g.page/r/..." defaultValue={p.settings.link} disabled={!p.canManage || pending} maxLength={500} data-testid={`boost-link-${p.boostKey}`} />
            </label>
            {p.canManage && (
              <button type="submit" className="btn" disabled={pending}>
                {pending ? "Saving" : "Save link"}
              </button>
            )}
          </div>
        )}
      </form>

      {p.extra}

      <footer className={s.cardFoot}>{p.stat}</footer>

      <div aria-live="polite">
        {state ? (
          <p className={`notice ${state.ok ? "notice-ok" : "notice-error"}`} data-testid="action-message">
            {state.message}
          </p>
        ) : on && p.blocked ? (
          <p className="notice notice-warn" data-testid={`boost-blocked-${p.boostKey}`}>
            {p.blocked}
          </p>
        ) : null}
      </div>
    </article>
  );
}
