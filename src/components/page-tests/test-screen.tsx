"use client";

// One A/B test. Before it starts: its versions, what it counts, the split and a
// checklist that says what's left. Once it runs: the verdict in a sentence, the
// numbers behind it, the rate so far by day, and ending it keeping a version.
import { ArrowLeft, Check, CircleAlert, ExternalLink, FlaskConical, Monitor, Pencil, Plus, Smartphone, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { addVersionAction, deleteTestAction, endTestAction, removeVersionAction, startTestAction, updateTestAction } from "@/app/(portal)/marketing/tests/actions";
import type { SignupChoices } from "@/components/landing/landing-page";
import m from "@/components/marketing/marketing.module.css";
import { Canvas } from "@/components/page-builder/canvas";
import g from "@/components/page-builder/template-gallery.module.css";
import type { Device } from "@/components/page-preview";
import { Card, Help, Metric, MetricStrip } from "@/components/ui";
import type { PageDoc } from "@/lib/pages/schema";
import { HOLD_DAYS, MIN_DAYS, MIN_VISITORS, SURE, type Verdict, type VersionKey } from "@/lib/pages/test-stats";
import { type ChartPoint, TestChart } from "./test-chart";
import { VERDICT_PILL } from "./tests-home";
import s from "./tests.module.css";

export type VersionView = {
  id: string;
  key: VersionKey;
  name: string;
  weight: number;
  doc: PageDoc | null;
  visitors: number;
  conversions: number;
  rate: number | null;
  lift: number | null;
  chance: number | null;
  change: string;
  kept: boolean;
};

export type TestScreenView = {
  id: string;
  name: string;
  hypothesis: string;
  goal: "form" | "click";
  goalLabel: string;
  goalVerb: string;
  status: "draft" | "running" | "ended";
  statusLabel: string;
  autoEnd: boolean;
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  pageLive: boolean;
  days: number;
  startedLabel: string | null;
  endedLabel: string | null;
  endReason: "" | "team" | "winner" | "unpublished";
  versions: VersionView[];
  verdict: Verdict;
  problems: string[];
  notes: string[];
  totals: { visitors: number; conversions: number };
  chart: ChartPoint[];
};

type Props = {
  view: TestScreenView;
  brand: string;
  publicUrl: string | null;
  canEdit: boolean;
  canPublish: boolean;
  /** The demo: everything shows, nothing saves. */
  demo: boolean;
  /** Results are made up while sample data is on. */
  sample: boolean;
  signup?: SignupChoices | null;
};

type Notice = { ok: boolean; text: string } | null;

const pctText = (x: number | null) => {
  if (x === null) return "None yet";
  const v = x * 100;
  return `${v < 10 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v)}%`;
};
const liftText = (x: number | null) => (x === null ? "" : `${x >= 0 ? "+" : "−"}${Math.round(Math.abs(x) * 100)}%`);
const int = (n: number) => n.toLocaleString("en-US");
/** A is "the live page" until the test ends, then "the page as it was". */
const versionLabel = (v: { key: VersionKey; name: string }, ended = false) => (v.key === "a" ? (ended ? "The page as it was" : "The live page") : v.name || `Version ${v.key.toUpperCase()}`);
const rateLine = (x: { rate: number | null; visitors: number }, verb: string) => (x.visitors ? `${pctText(x.rate)} ${verb} out of ${int(x.visitors)} visitors` : "No visitors yet");

function Key({ k, large }: { k: VersionKey; large?: boolean }) {
  return (
    <span className={`${s.key} ${large ? s.keyLarge : ""}`} data-key={k} aria-hidden="true">
      {k.toUpperCase()}
    </span>
  );
}

/** A version at full size, at desktop or phone width. */
function PreviewDialog({ version, brand, signup, onClose }: { version: VersionView | null; brand: string; signup?: SignupChoices | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [device, setDevice] = useState<Device>("desktop");
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (version && !d.open) {
      setDevice(window.matchMedia("(max-width: 600px)").matches ? "phone" : "desktop");
      d.showModal();
    }
    if (!version && d.open) d.close();
  }, [version]);
  return (
    <dialog ref={ref} className={g.dialog} onClose={onClose} onCancel={onClose} aria-labelledby="version-preview-title" data-testid="version-preview">
      {version?.doc && (
        <div className={g.sheet}>
          <header className={g.head}>
            <div className={g.headText}>
              <h2 id="version-preview-title">
                {version.key.toUpperCase()}: {versionLabel(version)}
              </h2>
              <p>{version.key === "a" ? "The live page, as visitors in A see it." : version.change}</p>
            </div>
            <div className={g.devices} role="radiogroup" aria-label="Preview size">
              {(
                [
                  ["desktop", "Desktop", Monitor],
                  ["phone", "Phone", Smartphone],
                ] as const
              ).map(([key, label, Icon]) => (
                <button key={key} type="button" role="radio" aria-checked={device === key} aria-label={label} onClick={() => setDevice(key)}>
                  <Icon aria-hidden="true" />
                </button>
              ))}
            </div>
            <button type="button" className={g.close} onClick={onClose} aria-label="Close">
              <X aria-hidden="true" />
            </button>
          </header>
          <div className={g.stage}>
            <Canvas doc={version.doc} brand={brand} signup={signup} device={device} outlines={false} title={`Version ${version.key.toUpperCase()}`} />
          </div>
        </div>
      )}
    </dialog>
  );
}

export function TestScreen({ view, brand, publicUrl, canEdit, canPublish, demo, sample, signup }: Props) {
  const [notice, setNotice] = useState<Notice>(null);
  const [preview, setPreview] = useState<VersionView | null>(null);
  const [pending, start] = useTransition();
  const editable = view.status === "draft" && canEdit;

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: (r: { ok: boolean; message: string }) => void) =>
    start(async () => {
      const r = await fn();
      // An action that redirects (deleting) has nothing to say here.
      if (!r) return;
      setNotice({ ok: r.ok, text: r.message });
      after?.(r);
    });

  return (
    <div className={`${s.stack} ${s.root}`} data-testid="test-screen" data-status={view.status}>
      <div className={s.head}>
        <Link href="/marketing/tests" className={s.backLink}>
          <ArrowLeft aria-hidden="true" />
          All tests
        </Link>
        <span className={view.status === "running" ? "pill pill-accent" : "pill"} data-testid="test-status">
          {view.statusLabel}
        </span>
        <span>
          On{" "}
          <Link href={`/marketing/pages/${view.pageId}`} className="link">
            {view.pageTitle}
          </Link>
        </span>
        {publicUrl && view.pageLive && (
          <a href={publicUrl} target="_blank" rel="noreferrer" className="link">
            <span className="mono">/{view.pageSlug}</span> <ExternalLink aria-hidden="true" width={13} height={13} />
          </a>
        )}
      </div>

      {sample && !demo && view.status !== "draft" && (
        <p className="notice" data-testid="sample-results">
          Sample data is on, so these results are made up. The test itself is real and saves as normal. Turn sample data off in Settings to see what visitors actually did.
        </p>
      )}

      {notice && (
        <p className={`notice ${notice.ok ? "notice-ok" : "notice-error"}`} role={notice.ok ? "status" : "alert"} data-testid="test-notice">
          {notice.text}
        </p>
      )}

      {view.status === "draft" ? (
        <Setup view={view} brand={brand} editable={editable} canPublish={canPublish} demo={demo} pending={pending} run={run} onPreview={setPreview} />
      ) : (
        <Results view={view} brand={brand} canPublish={canPublish} canEdit={canEdit} demo={demo} pending={pending} run={run} onPreview={setPreview} />
      )}

      <PreviewDialog version={preview} brand={brand} signup={signup} onClose={() => setPreview(null)} />
    </div>
  );
}

type Run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: (r: { ok: boolean; message: string }) => void) => void;

const DEMO = "This is a demo, so the tests here are examples and can't be changed. In your own account you set them up the same way.";

// ---- Before it starts ------------------------------------------------------------------------

function Setup({ view, brand, editable, canPublish, demo, pending, run, onPreview }: { view: TestScreenView; brand: string; editable: boolean; canPublish: boolean; demo: boolean; pending: boolean; run: Run; onPreview: (v: VersionView) => void }) {
  const initial = () => ({
    name: view.name,
    hypothesis: view.hypothesis,
    goal: view.goal,
    autoEnd: view.autoEnd,
    weights: Object.fromEntries(view.versions.map((v) => [v.id, String(v.weight)])),
    names: Object.fromEntries(view.versions.filter((v) => v.key !== "a").map((v) => [v.id, v.name])),
  });
  const [f, setF] = useState(initial);
  // When the server sends new versions (one added or removed), start from them.
  const shape = view.versions.map((v) => `${v.id}:${v.weight}:${v.name}`).join("|");
  const [seen, setSeen] = useState(shape);
  if (seen !== shape) {
    setSeen(shape);
    setF(initial());
  }

  const weights = view.versions.map((v) => Number(f.weights[v.id] ?? v.weight) || 0);
  const sum = weights.reduce((a, b) => a + b, 0);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial());
  const save = () =>
    run(() => (demo ? Promise.resolve({ ok: false, message: DEMO }) : updateTestAction(view.id, { name: f.name, hypothesis: f.hypothesis, goal: f.goal, ...(f.autoEnd !== view.autoEnd ? { autoEnd: f.autoEnd } : {}), weights: Object.fromEntries(Object.entries(f.weights).map(([k, v]) => [k, Number(v)])), versionNames: f.names })));
  const even = () => {
    const n = view.versions.length;
    const base = Math.floor(100 / n);
    setF((p) => ({ ...p, weights: Object.fromEntries(view.versions.map((v, i) => [v.id, String(base + (i < 100 - base * n ? 1 : 0))])) }));
  };
  const problems = view.problems;
  const ready = problems.length === 0 && !dirty;

  return (
    <>
      <Card title="Versions" note="A is the live page as it is when the test starts. Each other version is a copy you change. Change one thing per version, so you know what made the difference." testId="test-versions">
        <ul className={s.versions}>
          {view.versions.map((v) => (
            <li key={v.id} className={s.version} data-testid={`version-${v.key}`}>
              <button type="button" className={s.versionThumb} onClick={() => onPreview(v)} aria-label={`Preview version ${v.key.toUpperCase()}`} disabled={!v.doc}>
                {v.doc ? <Canvas doc={v.doc} brand={brand} thumb title={`Version ${v.key.toUpperCase()}`} /> : null}
              </button>
              <div className={s.versionBody}>
                <div className={s.versionTitle}>
                  <Key k={v.key} />
                  {v.key === "a" ? (
                    <strong>The live page</strong>
                  ) : (
                    <input
                      className={`input ${s.versionName}`}
                      value={f.names[v.id] ?? ""}
                      maxLength={60}
                      placeholder={`Name ${v.key.toUpperCase()}, like Price up front`}
                      aria-label={`Name for version ${v.key.toUpperCase()}`}
                      disabled={!editable || pending}
                      onChange={(e) => setF((p) => ({ ...p, names: { ...p.names, [v.id]: e.target.value } }))}
                      data-testid={`version-name-${v.key}`}
                    />
                  )}
                </div>
                <p className={s.change} data-testid={`version-change-${v.key}`}>
                  {v.key === "a" ? "Visitors in A see the page exactly as it's published. To change A, change the page itself." : v.change}
                </p>
                <div className={s.versionActions}>
                  {v.key !== "a" && editable && (
                    <Link href={`/marketing/tests/${view.id}/${v.id}`} className="btn btn-primary" data-testid={`edit-version-${v.key}`}>
                      <Pencil aria-hidden="true" />
                      Edit {v.key.toUpperCase()}
                    </Link>
                  )}
                  <button type="button" className="btn" onClick={() => onPreview(v)} disabled={!v.doc}>
                    Preview
                  </button>
                  {v.key !== "a" && editable && view.versions.length > 2 && (
                    <button type="button" className={`btn ${m.danger}`} disabled={pending} onClick={() => run(() => removeVersionAction(v.id))} data-testid={`remove-version-${v.key}`}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
          {editable && view.versions.length < 3 && (
            <li>
              <button type="button" className={s.addVersion} disabled={pending || dirty} onClick={() => run(() => (demo ? Promise.resolve({ ok: false, message: DEMO }) : addVersionAction(view.id)))} data-testid="add-version">
                <Plus aria-hidden="true" />
                Add version C
                <span>{dirty ? "Save your changes first." : "Try a second idea at the same time. Each version gets fewer visitors, so it takes longer."}</span>
              </button>
            </li>
          )}
        </ul>
      </Card>

      <Card title="What it counts and who sees what" testId="test-settings">
        <fieldset className={`${s.settings} ${s.fieldset}`} disabled={!editable || pending}>
          <div className={m.field}>
            <label htmlFor="t-name" className={m.fieldLabel}>
              Name
            </label>
            <input id="t-name" className="input" value={f.name} maxLength={120} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} data-testid="test-name" />
          </div>

          <div className={m.field}>
            <span className={m.fieldLabel}>What counts as a win</span>
            <div className={s.goalChoices} role="radiogroup" aria-label="What counts as a win">
              <button type="button" role="radio" aria-checked={f.goal === "form"} className={s.goalChoice} onClick={() => setF((p) => ({ ...p, goal: "form" }))} data-testid="goal-form">
                <strong>Form sends</strong>
                <span>Someone sends the form on the page.</span>
              </button>
              <button type="button" role="radio" aria-checked={f.goal === "click"} className={s.goalChoice} onClick={() => setF((p) => ({ ...p, goal: "click" }))} data-testid="goal-click">
                <strong>Button clicks</strong>
                <span>Someone clicks any button on the page.</span>
              </button>
            </div>
            <span className={m.hint}>Each visitor counts once a day, whether they do it once or five times.</span>
          </div>

          <div className={m.field}>
            <span className={m.fieldLabel}>
              Who sees which version
              <Help title="The split">
                <p>The share of visitors who see each version. Each person is placed by a code made from their network address and browser, so they see the same version every time. No cookie is set. An even split learns fastest; give a riskier version less if you want to limit the downside.</p>
              </Help>
            </span>
            <div className={s.split}>
              <div className={s.splitBar} aria-hidden="true">
                {view.versions.map((v, i) => (
                  <span key={v.id} data-key={v.key} style={{ flexGrow: Math.max(0, weights[i]) }} />
                ))}
              </div>
              <div className={s.splitRow}>
                {view.versions.map((v) => (
                  <label key={v.id} className={s.splitInput}>
                    <Key k={v.key} />
                    <input
                      className="input num"
                      inputMode="numeric"
                      value={f.weights[v.id] ?? ""}
                      onChange={(e) => setF((p) => ({ ...p, weights: { ...p.weights, [v.id]: e.target.value.replace(/\D/g, "").slice(0, 3) } }))}
                      aria-label={`Percent of visitors who see ${v.key.toUpperCase()}`}
                      data-testid={`weight-${v.key}`}
                    />
                    %
                  </label>
                ))}
                <button type="button" className="btn" onClick={even}>
                  Even split
                </button>
              </div>
              {sum !== 100 && <span className={m.hint}>These add up to {sum}%. They need to add up to 100%.</span>}
            </div>
          </div>

          <label className={m.checkRow}>
            <input type="checkbox" checked={f.autoEnd} disabled={!canPublish} onChange={(e) => setF((p) => ({ ...p, autoEnd: e.target.checked }))} data-testid="test-auto-end" />
            <span>
              End on its own when one version is clearly ahead, and keep that one live
              <span className={`${m.hint} ${s.block}`}>Checked once a day, after the first week. Leave it off to decide yourself.</span>
            </span>
          </label>

          <div className={m.field}>
            <label htmlFor="t-why" className={m.fieldLabel}>
              What you expect <em>Optional</em>
            </label>
            <textarea id="t-why" className={`input ${m.textarea}`} rows={3} maxLength={1000} value={f.hypothesis} onChange={(e) => setF((p) => ({ ...p, hypothesis: e.target.value }))} placeholder="Saying the price up front should get more quote requests, because people ask about price first." />
          </div>
        </fieldset>
        {editable && (
          <div className={`${m.saveRow} ${s.gapAbove}`}>
            <button type="button" className="btn btn-primary" disabled={!dirty || pending || sum !== 100} onClick={save} data-testid="save-test">
              {pending ? "Saving" : "Save changes"}
            </button>
            {dirty && <span className={m.saveNote}>You have changes that aren&apos;t saved.</span>}
          </div>
        )}
      </Card>

      <Card title="Ready to start?" testId="test-start">
        <ul className={s.checklist} data-testid="start-checklist">
          {problems.map((p) => (
            <li key={p} className={s.checkNo}>
              <CircleAlert aria-hidden="true" />
              <span>{p}</span>
            </li>
          ))}
          {view.notes.map((n) => (
            <li key={n} className={s.checkNo}>
              <CircleAlert aria-hidden="true" />
              <span>{n}</span>
            </li>
          ))}
          {dirty && (
            <li className={s.checkNo}>
              <CircleAlert aria-hidden="true" />
              <span>Save your changes.</span>
            </li>
          )}
          {problems.length === 0 && !dirty && (
            <>
              <li className={s.checkOk}>
                <Check aria-hidden="true" />
                <span>
                  {view.versions.length === 2 ? "B changes something from A." : "B and C each change something from A."} Visitors split{" "}
                  {view.versions.map((v) => `${v.weight}% ${v.key.toUpperCase()}`).join(", ")}.
                </span>
              </li>
              <li className={s.checkOk}>
                <Check aria-hidden="true" />
                <span>It counts {view.goalLabel.toLowerCase()}. Results need about a week and {MIN_VISITORS} visitors on each version.</span>
              </li>
            </>
          )}
        </ul>
        <div className={s.startRow}>
          {canPublish ? (
            <button type="button" className="btn btn-primary" disabled={!ready || pending} onClick={() => run(() => (demo ? Promise.resolve({ ok: false, message: DEMO }) : startTestAction(view.id)))} data-testid="start-test">
              <FlaskConical aria-hidden="true" />
              Start the test
            </button>
          ) : (
            <span className="notice">Someone who can publish pages starts the test.</span>
          )}
          <span className={s.startNote}>Once it starts, the versions and the split are locked so the results stay clean, and the page can&apos;t be published until it ends. You can end it any time.</span>
        </div>
      </Card>

      {editable && <DeleteTest view={view} demo={demo} pending={pending} run={run} />}
    </>
  );
}

function DeleteTest({ view, demo, pending, run }: { view: TestScreenView; demo: boolean; pending: boolean; run: Run }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={s.dangerZone}>
      <span>{view.status === "ended" ? "Deleting removes these results. The page stays as it is." : "Deleting removes the test and its versions. The page stays as it is."}</span>
      {confirm ? (
        <span className={m.saveRow}>
          <button type="button" className={`btn ${m.danger}`} disabled={pending} onClick={() => run(() => (demo ? Promise.resolve({ ok: false, message: DEMO }) : deleteTestAction(view.id)))} data-testid="delete-test-confirm">
            Delete the test
          </button>
          <button type="button" className="btn" onClick={() => setConfirm(false)}>
            Keep it
          </button>
        </span>
      ) : (
        <button type="button" className="btn" onClick={() => setConfirm(true)} data-testid="delete-test">
          Delete test
        </button>
      )}
    </div>
  );
}

// ---- Running and ended ------------------------------------------------------------------------

function Results({ view, brand, canPublish, canEdit, demo, pending, run, onPreview }: { view: TestScreenView; brand: string; canPublish: boolean; canEdit: boolean; demo: boolean; pending: boolean; run: Run; onPreview: (v: VersionView) => void }) {
  const endRef = useRef<HTMLDialogElement>(null);
  const v = view.verdict;
  const running = view.status === "running";
  const leader = v.kind === "winner" ? v.leader : null;
  const [keep, setKeep] = useState<string>(() => view.versions.find((x) => x.key === (leader ?? "a"))?.id ?? view.versions[0].id);
  const kept = view.versions.find((x) => x.kept);
  const keepVersion = view.versions.find((x) => x.id === keep);
  const [autoEnd, setAutoEnd] = useState(view.autoEnd);

  const title = running
    ? v.kind === "winner" && leader
      ? `${leader.toUpperCase()} is ahead`
      : VERDICT_PILL[v.kind].label
    : view.endReason === "unpublished"
      ? "Ended when the page went offline"
      : `Ended ${view.endedLabel ?? ""}. ${kept ? `Kept ${kept.key.toUpperCase()}` : "Kept A"}${view.endReason === "winner" ? ", on its own" : ""}.`;
  const endedNote = !running && kept && kept.key !== "a" && view.endReason !== "unpublished" ? `${kept.key.toUpperCase()} is the live page now.` : !running ? "The page stayed as it was." : "";

  return (
    <>
      <section className={s.verdict} data-kind={v.kind} data-testid="test-verdict" aria-live="polite">
        <span className={s.verdictIcon} aria-hidden="true">
          {v.kind === "winner" ? <Trophy /> : <FlaskConical />}
        </span>
        <div className={s.verdictText}>
          <strong>{title}</strong>
          <p data-testid="verdict-sentence">
            {endedNote && `${endedNote} `}
            {v.sentence}
          </p>
        </div>
        {running && canPublish && (
          <div className={s.verdictActions}>
            <button type="button" className={v.kind === "winner" ? "btn btn-primary" : "btn"} onClick={() => endRef.current?.showModal()} data-testid="end-test">
              End the test
            </button>
          </div>
        )}
      </section>

      <MetricStrip>
        <Metric label="Visitors" value={int(view.totals.visitors)} testId="metric-visitors" help={<p>People who opened the page while the test ran, across every version. Each person counts once a day. Bots, link previews and people signed in to Bison Ops in that browser aren&apos;t counted.</p>} />
        <Metric label={view.goalLabel} value={int(view.totals.conversions)} testId="metric-conversions" help={<p>Visitors who {view.goalVerb}, across every version. Each person counts once a day, however many times they did it.</p>} />
        <Metric label={running ? "Days running" : "Days it ran"} value={int(view.days)} testId="metric-days" help={<p>Counted from {view.startedLabel ?? "the start"}, including today. A test needs at least {MIN_DAYS} days so weekdays and weekends both count.</p>} />
      </MetricStrip>

      <Card title="Results" flush testId="test-results">
        <div className={s.scrollX}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Version</th>
                <th scope="col" className={s.hideSm}>
                  <span className={s.thInner}>
                    Visitors
                    <Help title="Visitors" idSuffix="-col">
                      <p>People who saw this version, counted once a day each.</p>
                    </Help>
                  </span>
                </th>
                <th scope="col" className={s.hideSm}>
                  <span className={s.thInner}>
                    {view.goalLabel}
                    <Help title={view.goalLabel} idSuffix="-col">
                      <p>Visitors to this version who {view.goalVerb}, once a day each.</p>
                    </Help>
                  </span>
                </th>
                <th scope="col">
                  <span className={s.thInner}>
                    Rate
                    <Help title="Rate">
                      <p>The share of this version&apos;s visitors who {view.goalVerb}: {view.goalLabel.toLowerCase()} divided by visitors.</p>
                    </Help>
                  </span>
                </th>
                <th scope="col">
                  <span className={s.thInner}>
                    vs A
                    <Help title="Compared with A">
                      <p>How much higher or lower the rate is than A&apos;s. +25% means 25% more of its visitors {view.goalVerb} than A&apos;s did.</p>
                    </Help>
                  </span>
                </th>
                <th scope="col" className={s.hideSm}>
                  <span className={s.thInner}>
                    Chance it&apos;s better
                    <Help title="Chance it's better">
                      <p>How likely it is that this version really does better than A, given the visitors so far. It&apos;s worked out from both rates and how many visitors each had (a Bayesian comparison). A winner is called at {Math.round(SURE * 100)}% (a little higher with three versions), after at least {MIN_DAYS} days and {MIN_VISITORS} visitors on each version, and only once it has held at the end of {HOLD_DAYS} days in a row. That keeps a lucky streak from deciding it.</p>
                    </Help>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.versions.map((x) => (
                <tr key={x.id} data-testid={`result-${x.key}`}>
                  <th scope="row">
                    <span className={s.versionCell}>
                      <Key k={x.key} />
                      <span>
                        <strong>{versionLabel(x, !running)}</strong>
                        <small className={s.hideSm}>
                          {x.weight}% of visitors{x.kept ? ", kept" : ""}
                        </small>
                        <small className={s.showSm}>
                          {int(x.visitors)} visitors{x.kept ? ", kept" : ""}
                        </small>
                      </span>
                    </span>
                  </th>
                  <td className={`num ${s.hideSm}`}>{int(x.visitors)}</td>
                  <td className={`num ${s.hideSm}`}>{int(x.conversions)}</td>
                  <td className="num">{pctText(x.rate)}</td>
                  <td className={`num ${x.lift === null ? "" : x.lift >= 0 ? s.up : s.down}`}>{x.key === "a" ? "Baseline" : x.lift === null ? "None yet" : liftText(x.lift)}</td>
                  <td className={`num ${s.hideSm}`}>{x.key === "a" ? "" : x.chance === null ? "None yet" : `${Math.round(x.chance * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`${view.goalLabel} rate so far`} note="Each line is a version's rate from the start to that day. Lines that keep crossing mean there's no real difference yet." flush testId="test-chart">
        <TestChart
          points={view.chart}
          keys={view.versions.map((x) => x.key)}
          goalLabel={view.goalLabel}
          aLabel={running ? "A, the live page" : "A, the page as it was"}
        />
      </Card>

      <Card title="Versions" testId="test-versions">
        <ul className={s.versions}>
          {view.versions.map((x) => (
            <li key={x.id} className={s.version} data-leader={leader === x.key || x.kept}>
              <button type="button" className={s.versionThumb} onClick={() => onPreview(x)} aria-label={`Preview version ${x.key.toUpperCase()}`} disabled={!x.doc}>
                {x.doc ? <Canvas doc={x.doc} brand={brand} thumb title={`Version ${x.key.toUpperCase()}`} /> : null}
              </button>
              <div className={s.versionBody}>
                <div className={s.versionTitle}>
                  <Key k={x.key} />
                  <strong>{versionLabel(x, !running)}</strong>
                  {x.kept && <span className="pill pill-good">Kept</span>}
                </div>
                <p className={s.change}>{x.key === "a" ? (running ? "The live page, held as it was when the test started." : "The live page as it was when the test started.") : x.change}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {view.hypothesis && (
        <Card title="What you expected">
          <p className={s.hypothesis}>{view.hypothesis}</p>
        </Card>
      )}

      {running && canPublish && (
        <Card title="Ending on its own">
          <label className={m.checkRow}>
            <input
              type="checkbox"
              checked={autoEnd}
              disabled={pending}
              onChange={(e) => {
                const next = e.target.checked;
                setAutoEnd(next);
                run(
                  () => (demo ? Promise.resolve({ ok: false, message: DEMO }) : updateTestAction(view.id, { autoEnd: next })),
                  (r) => !r.ok && setAutoEnd(!next),
                );
              }}
              data-testid="running-auto-end"
            />
            <span>
              End on its own when one version is clearly ahead, and keep that one live
              <span className={`${m.hint} ${s.block}`}>Checked once a day, after the first week. A version that&apos;s clearly behind never goes live on its own.</span>
            </span>
          </label>
        </Card>
      )}

      {!running && canEdit && <DeleteTest view={view} demo={demo} pending={pending} run={run} />}

      <dialog ref={endRef} className={m.dialog} aria-labelledby="end-test-title" data-testid="end-dialog">
        <div className={m.dialogBody}>
          <div className={m.dialogHead}>
            <h2 id="end-test-title">End the test</h2>
          </div>
          <p>Visitors stop being split. Pick the version everyone sees from now on.</p>
          <div className={s.keepChoices} role="radiogroup" aria-label="Version to keep">
            {view.versions.map((x) => (
              <label key={x.id} className={s.keepChoice}>
                <input type="radio" name="keep" checked={keep === x.id} onChange={() => setKeep(x.id)} data-testid={`keep-${x.key}`} />
                <Key k={x.key} />
                <span>
                  <strong>
                    Keep {x.key.toUpperCase()}: {versionLabel(x)}
                  </strong>
                  <small>
                    {rateLine(x, view.goalVerb)}
                    {leader === x.key ? ". It's ahead." : ""}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <p className={m.hint}>
            {keepVersion?.key === "a"
              ? "The page stays exactly as it is."
              : `${keepVersion?.key.toUpperCase()} is published as the page right away. Your draft of the page becomes ${keepVersion?.key.toUpperCase()} too, unless it has changes that aren't live yet; those are kept.`}{" "}
            The results stay here.
          </p>
          <div className={m.dialogActions}>
            <button type="button" className="btn" onClick={() => endRef.current?.close()}>
              Keep it running
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                run(
                  () => (demo ? Promise.resolve({ ok: false, message: DEMO }) : endTestAction(view.id, keep)),
                  () => endRef.current?.close(),
                )
              }
              data-testid="end-test-confirm"
            >
              End and keep {keepVersion?.key.toUpperCase()}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
