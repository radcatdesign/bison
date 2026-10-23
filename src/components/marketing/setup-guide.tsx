"use client";

// A tool's setup steps, in order, each saying what to do, why, and whether it's
// done. Ticks off on its own as the real settings get saved. Sits at the top of
// each tool until everything required is done, then folds down to one line.
import { Check, ChevronDown, Circle } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";
import { toolProgress, type ToolSetup } from "@/lib/marketing/setup-steps";
import s from "./marketing.module.css";

const listeners = new Set<() => void>();
const hiddenKey = (tool: string) => `bo-setup-folded:${tool}`;

function readFolded(tool: string): boolean | null {
  try {
    const v = localStorage.getItem(hiddenKey(tool));
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

function writeFolded(tool: string, folded: boolean) {
  try {
    localStorage.setItem(hiddenKey(tool), folded ? "1" : "0");
  } catch {
    /* fine: it just won't be remembered */
  }
  listeners.forEach((l) => l());
}

type Props = {
  tool: ToolSetup;
  /** In the hub every tool shows its steps; on a tool's own page, the guide can fold away. */
  variant?: "page" | "hub";
  onMark?: (stepKey: string, done: boolean) => Promise<{ ok: boolean; message: string }>;
  /** The tool's number in the recommended order, shown in the hub. */
  number?: number;
};

export function SetupGuide({ tool, variant = "page", onMark, number }: Props) {
  const progress = toolProgress(tool);
  const stored = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => readFolded(tool.key),
    () => null,
  );
  const folded = variant === "hub" ? false : (stored ?? progress.complete);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const next = tool.steps.find((st) => !st.done && !st.optional) ?? tool.steps.find((st) => !st.done);

  if (folded && variant === "page") {
    return (
      <div className={s.setupFolded} data-testid={`setup-${tool.key}`} data-complete={progress.complete || undefined}>
        <span className={s.setupFoldedIcon} aria-hidden="true">
          {progress.complete ? <Check /> : <Circle />}
        </span>
        <span>{progress.complete ? `${tool.name} is set up.` : `${tool.name} setup: ${progress.done} of ${progress.total} done.`}</span>
        <button type="button" className={s.linkButton} onClick={() => writeFolded(tool.key, false)}>
          Show the steps
        </button>
      </div>
    );
  }

  return (
    <section className={s.setup} data-variant={variant} data-complete={progress.complete || undefined} aria-labelledby={`setup-${tool.key}-title`} data-testid={`setup-${tool.key}`}>
      <header className={s.setupHead}>
        <Ring done={progress.done} total={progress.total} number={number} complete={progress.complete} />
        <div className={s.setupHeadText}>
          <h2 id={`setup-${tool.key}-title`}>
            {variant === "hub" ? (
              <Link href={tool.href} className={s.setupToolLink}>
                {tool.name}
              </Link>
            ) : (
              `Set up ${tool.name.toLowerCase()}`
            )}
            {tool.optional && <span className="pill">Optional</span>}
          </h2>
          <p>{tool.summary}</p>
        </div>
        <span className={s.setupCount} data-testid={`setup-${tool.key}-count`}>
          {progress.complete ? "Done" : `${progress.done} of ${progress.total}`}
        </span>
        {variant === "page" && (
          <button type="button" className={s.iconButton} aria-label="Fold the setup steps away" title="Fold away" onClick={() => writeFolded(tool.key, true)}>
            <ChevronDown aria-hidden="true" />
          </button>
        )}
      </header>

      <ol className={s.steps}>
        {tool.steps.map((step, i) => {
          const isNext = step === next;
          return (
            <li key={step.key} className={s.step} data-done={step.done || undefined} data-next={isNext || undefined} data-testid={`step-${step.key}`}>
              <span className={s.stepMark} aria-hidden="true">
                {step.done ? <Check /> : i + 1}
              </span>
              <div className={s.stepText}>
                <strong>
                  {step.title}
                  {step.optional && <em>Optional</em>}
                  {isNext && !step.done && <span className="pill pill-accent">Next</span>}
                </strong>
                <p>{step.body}</p>
                {step.blockedNote && !step.done && <p className={s.stepBlocked}>{step.blockedNote}</p>}
              </div>
              <div className={s.stepAction}>
                {step.manual && onMark ? (
                  <button
                    type="button"
                    className={step.done ? "btn btn-ghost" : "btn"}
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await onMark(step.key, !step.done);
                        if (!r.ok) setMessage(r.message);
                      })
                    }
                  >
                    {step.done ? "Mark as not done" : "Mark as done"}
                  </button>
                ) : null}
                {!step.done && (!step.manual || !onMark) && (
                  <Link href={step.href} className={isNext ? "btn btn-primary" : "btn"}>
                    {step.cta}
                  </Link>
                )}
                {step.manual && onMark && !step.done && (
                  <Link href={step.href} className={s.linkButton}>
                    {step.cta}
                  </Link>
                )}
                <span className="visually-hidden">{step.done ? "Done" : "Not done yet"}</span>
              </div>
            </li>
          );
        })}
      </ol>
      {message && (
        <p className="notice notice-error" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}

function Ring({ done, total, number, complete }: { done: number; total: number; number?: number; complete: boolean }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const share = total ? done / total : 0;
  return (
    <span className={s.ring} data-complete={complete || undefined} aria-hidden="true">
      <svg viewBox="0 0 40 40" width="40" height="40">
        <circle cx="20" cy="20" r={r} className={s.ringTrack} />
        <circle cx="20" cy="20" r={r} className={s.ringFill} strokeDasharray={`${c * share} ${c}`} transform="rotate(-90 20 20)" />
      </svg>
      <span className={s.ringLabel}>{complete ? <Check /> : (number ?? `${done}/${total}`)}</span>
    </span>
  );
}
