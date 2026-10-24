"use client";

// Marketing > A/B tests: every test, and the form that starts a new one on a
// live page. The test itself is set up on its own screen.
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { createTestAction, type TestActionResult } from "@/app/(portal)/marketing/tests/actions";
import { useSay } from "@/components/edition";
import m from "@/components/marketing/marketing.module.css";
import { Card, PageHeader } from "@/components/ui";
import type { VerdictKind, VersionKey } from "@/lib/pages/test-stats";
import s from "./tests.module.css";

export type TestCardView = {
  id: string;
  name: string;
  pageTitle: string;
  pageSlug: string;
  status: "draft" | "running" | "ended";
  statusLabel: string;
  goalLabel: string;
  line: string;
  verdict: VerdictKind | null;
  leader: VersionKey | null;
};

type Props = {
  tests: TestCardView[];
  /** Live pages that don't have a test yet. */
  pages: { id: string; title: string; slug: string }[];
  hasLivePage: boolean;
  canEdit: boolean;
  /** Sample data is on, so the results shown are made up. */
  sampleResults?: boolean;
};

export const VERDICT_PILL: Record<VerdictKind, { label: string; tone: string }> = {
  waiting: { label: "Waiting for visitors", tone: "pill" },
  "too-early": { label: "Too early to tell", tone: "pill" },
  "keep-going": { label: "Not sure yet", tone: "pill pill-accent" },
  winner: { label: "Clear winner", tone: "pill pill-good" },
  "no-difference": { label: "No clear difference", tone: "pill" },
};

const STATUS_TONE: Record<TestCardView["status"], string> = { draft: "pill", running: "pill pill-accent", ended: "pill" };

/** The screen's title and note, in the company's words. Also the loading frame. */
export function TestsHeader() {
  const say = useSay();
  return (
    <PageHeader
      title="A/B tests"
      note={say("Show visitors two or three versions of a landing page, and keep the one that gets more form sends or clicks.", "Show visitors two or three versions of a funnel page, and keep the one that gets more form sends or clicks.")}
    />
  );
}

export function TestsHome({ tests, pages, hasLivePage, canEdit, sampleResults }: Props) {
  const say = useSay();
  const ref = useRef<HTMLDialogElement>(null);
  const [goal, setGoal] = useState<"form" | "click">("form");
  const [state, run, pending] = useActionState<TestActionResult | null, FormData>(createTestAction, null);

  return (
    <div className={`${s.stack} ${s.root}`}>
      {sampleResults && (
        <p className="notice" data-testid="sample-results">
          Sample data is on, so test results here are made up. Your tests and versions save as normal.
        </p>
      )}
      <Card
        title="Your tests"
        flush
        testId="test-list"
        aside={
          canEdit ? (
            <button type="button" className="btn btn-primary" onClick={() => ref.current?.showModal()} data-testid="new-test">
              <Plus aria-hidden="true" />
              New test
            </button>
          ) : null
        }
      >
        {tests.length === 0 ? (
          <div className={m.empty}>
            <strong>No tests yet.</strong>
            <span>Pick a live page, make a version with one change, and see which one gets more people to act.</span>
          </div>
        ) : (
          <ul className={s.list}>
            {tests.map((t) => (
              <li key={t.id}>
                <Link href={`/marketing/tests/${t.id}`} className={s.testLink} data-testid="test-row" data-status={t.status}>
                  <span className={s.testMain}>
                    <strong>{t.name}</strong>
                    <span className={s.testMeta}>
                      <span>On {t.pageTitle}</span>
                      <span className="mono">/{t.pageSlug}</span>
                      <span>Counting {t.goalLabel.toLowerCase()}</span>
                      <span className="num">{t.line}</span>
                    </span>
                  </span>
                  <span className={s.testSide}>
                    <span className={STATUS_TONE[t.status]}>{t.statusLabel}</span>
                    {t.status === "running" && t.verdict && <span className={VERDICT_PILL[t.verdict].tone}>{t.verdict === "winner" && t.leader ? `${t.leader.toUpperCase()} is ahead` : VERDICT_PILL[t.verdict].label}</span>}
                    <ChevronRight aria-hidden="true" className="muted" width={16} height={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="How a test works">
        <ol className={s.howGrid}>
          <li className={s.howItem}>
            <strong>
              <span className={s.howNum}>1</span>Make a version
            </strong>
            <p>
              {say(
                "B starts as a copy of the live page. Change one thing, like the headline, the button or the offer, so you know what made the difference.",
                "B starts as a copy of the live page. Change one thing, like the headline, the button or the intro offer, so you know what made the difference.",
              )}
            </p>
          </li>
          <li className={s.howItem}>
            <strong>
              <span className={s.howNum}>2</span>Split the visitors
            </strong>
            <p>Half see the page as it is (A), half see B. Each person sees the same one every time, and no cookie is set.</p>
          </li>
          <li className={s.howItem}>
            <strong>
              <span className={s.howNum}>3</span>Keep the winner
            </strong>
            <p>
              {say(
                "After a week and enough visitors, the results say which one gets more form sends or clicks. End the test and the winner goes live.",
                "After a week and enough visitors, the results say which one gets more form sends, like free pass requests, or more clicks. End the test and the winner goes live.",
              )}
            </p>
          </li>
        </ol>
      </Card>

      <dialog ref={ref} className={m.dialog} aria-labelledby="new-test-title" data-testid="new-test-dialog">
        <form action={run} className={m.dialogBody}>
          <div className={m.dialogHead}>
            <h2 id="new-test-title">New A/B test</h2>
          </div>
          {pages.length === 0 ? (
            <p className="notice">
              {hasLivePage ? "Every live page already has a test. End or delete one to test something new on that page." : "A test compares a live page with versions of it, so publish a page first."}{" "}
              <Link href="/marketing/pages" className="link">
                {say("Open Pages", "Open funnel pages")}
              </Link>
            </p>
          ) : (
            <fieldset className={`${s.settings} ${s.fieldset}`} disabled={pending}>
              <div className={m.field}>
                <label htmlFor="nt-page" className={m.fieldLabel}>
                  Page to test
                </label>
                <select id="nt-page" name="pageId" className="select" required defaultValue={pages[0].id} data-testid="new-test-page">
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (/{p.slug})
                    </option>
                  ))}
                </select>
                <span className={m.hint}>Only live pages are listed. Pick one that already gets visitors; a test needs a few hundred to learn anything.</span>
              </div>
              <div className={m.field}>
                <label htmlFor="nt-name" className={m.fieldLabel}>
                  Name the test
                </label>
                <input id="nt-name" name="name" className="input" required maxLength={120} placeholder="Shorter headline" data-testid="new-test-name" />
              </div>
              <div className={m.field}>
                <span className={m.fieldLabel}>What counts as a win</span>
                <input type="hidden" name="goal" value={goal} />
                <div className={s.goalChoices} role="radiogroup" aria-label="What counts as a win">
                  <button type="button" role="radio" aria-checked={goal === "form"} className={s.goalChoice} onClick={() => setGoal("form")} data-testid="new-test-goal-form">
                    <strong>Form sends</strong>
                    <span>{say("Someone sends the form on the page. Best for quote requests and signups.", "Someone sends the form, like a free pass request. Best for trial passes, tours and class sign-ups.")}</span>
                  </button>
                  <button type="button" role="radio" aria-checked={goal === "click"} className={s.goalChoice} onClick={() => setGoal("click")} data-testid="new-test-goal-click">
                    <strong>Button clicks</strong>
                    <span>
                      {say(
                        "Someone clicks any button, like Shop now or Call us. Best when the page sends people somewhere else.",
                        "Someone clicks any button, like Join online or Call us. Best when the page sends people somewhere else, like your online store.",
                      )}
                    </span>
                  </button>
                </div>
              </div>
              <div className={m.field}>
                <label htmlFor="nt-why" className={m.fieldLabel}>
                  What you expect <em>Optional</em>
                </label>
                <textarea
                  id="nt-why"
                  name="hypothesis"
                  className={`input ${m.textarea}`}
                  rows={3}
                  maxLength={1000}
                  placeholder={say(
                    "A headline that says the price up front should get more quote requests, because people ask about price first.",
                    "A headline that says the pass is free with no card needed should get more free pass requests, because people worry about being signed up.",
                  )}
                />
                <span className={m.hint}>Writing it down first keeps everyone honest about what the test showed.</span>
              </div>
            </fieldset>
          )}
          {state && !state.ok && (
            <p className="notice notice-error" role="alert" data-testid="new-test-error">
              {state.message}
            </p>
          )}
          <div className={m.dialogActions}>
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              Cancel
            </button>
            {pages.length > 0 && (
              <button type="submit" className="btn btn-primary" disabled={pending} data-testid="create-test">
                {pending ? "Creating" : "Create test"}
              </button>
            )}
          </div>
        </form>
      </dialog>
    </div>
  );
}
