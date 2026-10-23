"use client";

// Email series: the list of series, one series with its emails on a timeline,
// and each email in the builder. In the demo, series live in this browser.
import { Pencil, Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addStepAction, createSeriesAction, deleteSeriesAction, deleteStepAction, saveStepAction, setSeriesStatusAction, startSeriesForListAction, testStepAction, updateSeriesAction } from "@/app/(portal)/marketing/series/actions";
import { EmailBuilder, type EmailContent } from "@/components/email-builder/builder";
import type { SequenceTrigger } from "@/lib/db/types";
import { emailProblems } from "@/lib/email/ops";
import { renderEmail } from "@/lib/email/render";
import { type BrandKit, EMAIL_DOC_VERSION } from "@/lib/email/schema";
import { starterSeries } from "@/lib/marketing/starter";
import { useIsClient } from "@/lib/use-is-client";
import { useDemoMarketing } from "./demo-setup";
import { type DemoSeries, demoId, writeDemo } from "./demo-store";
import { EmailFrame } from "./email-frame";
import s from "./marketing.module.css";
import q from "./series.module.css";

export type StepView = { id: string; delayDays: number; subject: string; preheader: string; doc: EmailContent["doc"]; problems: number; sent: number };
export type SeriesView = { id: string; name: string; trigger: SequenceTrigger; triggerDetail: string; status: "on" | "off"; starter: boolean; steps: StepView[]; active: number; done: number; stopped: number };
export type TriggerInfo = Record<SequenceTrigger, { label: string; note: string; ready: boolean }>;

type Common = { storage: "server" | "browser"; tenantId: string; site: string; canEdit: boolean; triggers: TriggerInfo };

// ---- Demo storage ------------------------------------------------------------------------

function demoSeed(site: string): DemoSeries[] {
  const st = starterSeries(site.replace(/^https:\/\//, ""));
  return [{ id: "welcome", name: st.name, trigger: "joined", triggerDetail: "", status: "off", starter: true, steps: st.steps.map((x, i) => ({ id: `step-${i}`, delayDays: x.delayDays, subject: x.subject, preheader: x.preheader, doc: x.doc })) }];
}

function toView(d: DemoSeries): SeriesView {
  return {
    id: d.id,
    name: d.name,
    trigger: d.trigger as SequenceTrigger,
    triggerDetail: d.triggerDetail,
    status: d.status,
    starter: d.starter,
    steps: [...d.steps].sort((a, b) => a.delayDays - b.delayDays).map((x) => ({ ...x, problems: emailProblems(x.doc, x.subject, x.preheader).length, sent: d.starter && d.status === "on" ? 0 : 0 })),
    active: d.starter ? 23 : 0,
    done: d.starter ? 412 : 0,
    stopped: d.starter ? 9 : 0,
  };
}

export function useSeries(c: Common, server: SeriesView[]): SeriesView[] | null {
  const demo = useDemoMarketing(c.tenantId);
  const client = useIsClient();
  return useMemo(() => {
    if (c.storage === "server") return server;
    if (!client) return null;
    return (demo.series ?? demoSeed(c.site)).map(toView);
  }, [c.storage, c.site, server, demo.series, client]);
}

function writeSeries(tenantId: string, site: string, change: (all: DemoSeries[]) => DemoSeries[]) {
  writeDemo(tenantId, (d) => ({ ...d, series: change(d.series ?? demoSeed(site)) }));
}

// ---- Pieces -----------------------------------------------------------------------------

function triggerText(v: SeriesView, triggers: TriggerInfo, forms: { value: string; label: string }[]): string {
  if (v.trigger === "form") return `Starts when someone sends ${forms.find((f) => f.value === v.triggerDetail)?.label ?? (v.triggerDetail || "a form you pick")}`;
  return `Starts when ${triggers[v.trigger].label.charAt(0).toLowerCase()}${triggers[v.trigger].label.slice(1)}`.replace("when you start it for a list", "you start it for a list");
}

function StatusSwitch({ view, c }: { view: SeriesView; c: Common }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const on = view.status === "on";
  return (
    <div className={q.statusBox}>
      <label className={q.switchRow}>
        <input
          type="checkbox"
          className="switch"
          checked={on}
          disabled={!c.canEdit || pending}
          data-testid={`series-switch-${view.starter ? "starter" : view.id}`}
          onChange={(e) => {
            const next = e.target.checked;
            start(async () => {
              if (c.storage === "browser") {
                const blocked = view.steps.find((x) => x.problems);
                if (next && blocked) return setMessage({ ok: false, text: `The day ${blocked.delayDays} email isn't ready: fill in the yellow spots first.` });
                writeSeries(c.tenantId, c.site, (all) => all.map((x) => (x.id === view.id ? { ...x, status: next ? "on" : "off" } : x)));
                return setMessage({ ok: true, text: next ? "On in this browser. In your own account, new subscribers start it from now." : "Off." });
              }
              const r = await setSeriesStatusAction(view.id, next);
              setMessage({ ok: r.ok, text: r.message });
              if (r.ok) router.refresh();
            });
          }}
        />
        <span className={on ? "pill pill-good" : "pill"}>{on ? "On" : "Off"}</span>
      </label>
      {message && (
        <p className={`notice ${message.ok ? "notice-ok" : "notice-error"}`} role={message.ok ? "status" : "alert"} data-testid="series-message">
          {message.text}
        </p>
      )}
    </div>
  );
}

function StepThumb({ step, brand, baseUrl }: { step: StepView; brand: BrandKit; baseUrl: string }) {
  const html = useMemo(() => renderEmail({ doc: step.doc, brand, subject: step.subject, baseUrl, builder: { selectedId: null, outlines: false } }).html, [step, brand, baseUrl]);
  return (
    <span className={q.thumb}>
      <EmailFrame html={html} thumb={{ height: 150 }} title={`Preview of the day ${step.delayDays} email`} />
    </span>
  );
}

// ---- The list ---------------------------------------------------------------------------

export function SeriesList({ c, server, forms, brand, baseUrl }: { c: Common; server: SeriesView[]; forms: { value: string; label: string }[]; brand: BrandKit; baseUrl: string }) {
  const router = useRouter();
  const list = useSeries(c, server);
  const [trigger, setTrigger] = useState<SequenceTrigger>("joined");
  if (!list) return <div aria-busy="true" style={{ minHeight: 300 }} />;
  return (
    <div className={q.page}>
      <ul className={q.list} data-testid="series-list">
        {list.map((v) => (
          <li key={v.id} className={`card ${q.item}`} data-testid="series-card">
            <div className={q.itemHead}>
              <div className={q.itemText}>
                <Link href={`/marketing/series/${v.id}`} className={q.name}>
                  {v.name}
                </Link>
                <span>{triggerText(v, c.triggers, forms)}</span>
              </div>
              <StatusSwitch view={v} c={c} />
            </div>
            <ol className={q.timeline}>
              {v.steps.map((st) => (
                <li key={st.id}>
                  <Link href={`/marketing/series/${v.id}/steps/${st.id}`} className={q.stepCard} data-testid="series-step">
                    <StepThumb step={st} brand={brand} baseUrl={baseUrl} />
                    <span className={q.stepText}>
                      <span className={q.day}>{st.delayDays === 0 ? "Right away" : `Day ${st.delayDays}`}</span>
                      <strong>{st.subject || "(no subject)"}</strong>
                      {st.problems > 0 && <span className={q.flag}>{st.problems} to fill in</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            <div className={q.stats}>
              <span>
                <strong className="num">{v.active.toLocaleString("en-US")}</strong> in it now
              </span>
              <span>
                <strong className="num">{v.done.toLocaleString("en-US")}</strong> finished
              </span>
              {v.stopped > 0 && (
                <span>
                  <strong className="num">{v.stopped.toLocaleString("en-US")}</strong> stopped when they unsubscribed
                </span>
              )}
              <Link href={`/marketing/series/${v.id}`} className="link" style={{ marginLeft: "auto" }}>
                Open
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {c.canEdit && (
        <form
          className={`card ${q.newSeries}`}
          action={c.storage === "server" ? createSeriesAction : undefined}
          onSubmit={
            c.storage === "browser"
              ? (e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const id = demoId("series");
                  writeSeries(c.tenantId, c.site, (all) => [
                    ...all,
                    {
                      id,
                      name: String(data.get("name") || "New series").slice(0, 80),
                      trigger,
                      triggerDetail: String(data.get("detail") ?? ""),
                      status: "off",
                      starter: false,
                      steps: [{ id: demoId("step"), delayDays: 0, subject: "[Add a subject]", preheader: "", doc: { version: EMAIL_DOC_VERSION, signOff: true, fallbackName: "there", sections: [{ id: "note", type: "text", body: "Hi {first name},\n\n[Add what this first email says.]", align: "left" }] } }],
                    },
                  ]);
                  router.push(`/marketing/series/${id}`);
                }
              : undefined
          }
          data-testid="new-series"
        >
          <h2>Make another series</h2>
          <p className={s.hint}>Emails go out a set number of days after someone starts. Day 0 goes right away. Anyone already in a series is skipped, so nobody gets it twice.</p>
          <div className={s.twoUp}>
            <div className={s.field}>
              <label htmlFor="series-name" className={s.fieldLabel}>
                Name
              </label>
              <input id="series-name" name="name" className="input" maxLength={80} required placeholder="Quote follow-up" />
            </div>
            <div className={s.field}>
              <label htmlFor="series-trigger" className={s.fieldLabel}>
                Starts when
              </label>
              <select id="series-trigger" name="trigger" className="select" value={trigger} onChange={(e) => setTrigger(e.target.value as SequenceTrigger)}>
                {(Object.keys(c.triggers) as SequenceTrigger[]).map((t) => (
                  <option key={t} value={t}>
                    {c.triggers[t].label}
                    {c.triggers[t].ready ? "" : " (needs Sales)"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {trigger === "form" && (
            <div className={s.field}>
              <label htmlFor="series-form" className={s.fieldLabel}>
                Which form
              </label>
              <select id="series-form" name="detail" className="select" required>
                {forms.length === 0 && <option value="">No forms yet. Add one to a landing page first.</option>}
                {forms.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className={s.hint}>{c.triggers[trigger].note}</p>
          <div>
            <button type="submit" className="btn btn-primary" data-testid="create-series">
              <Plus aria-hidden="true" />
              Make the series
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ---- One series ---------------------------------------------------------------------------

export function SeriesDetail({ c, id, server, forms, lists, brand, baseUrl, canSend }: { c: Common; id: string; server: SeriesView[]; forms: { value: string; label: string }[]; lists: { id: string; name: string; count: number }[]; brand: BrandKit; baseUrl: string; canSend: boolean }) {
  const router = useRouter();
  const list = useSeries(c, server);
  const view = list?.find((x) => x.id === id) ?? null;
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [startList, setStartList] = useState("");

  if (!list) return <div aria-busy="true" style={{ minHeight: 300 }} />;
  if (!view) {
    return (
      <div className={s.empty}>
        <strong>This series isn&apos;t here</strong>
        <span>{c.storage === "browser" ? "Demo series live in the browser they were made in." : "It may have been deleted."}</span>
        <Link href="/marketing/series" className="btn">
          Back to Email series
        </Link>
      </div>
    );
  }
  const nextDay = day ?? (view.steps.length ? Math.max(...view.steps.map((x) => x.delayDays)) + 3 : 0);

  return (
    <div className={q.page} data-testid="series-detail">
      <div className={`card ${q.item}`}>
        <div className={q.itemHead}>
          <div className={q.itemText}>
            <span className={q.name}>{view.name}</span>
            <span>{triggerText(view, c.triggers, forms)}</span>
          </div>
          <StatusSwitch view={view} c={c} />
        </div>
        <div className={q.stats}>
          <span>
            <strong className="num">{view.active.toLocaleString("en-US")}</strong> in it now
          </span>
          <span>
            <strong className="num">{view.done.toLocaleString("en-US")}</strong> finished
          </span>
          <span>
            <strong className="num">{view.stopped.toLocaleString("en-US")}</strong> stopped
          </span>
        </div>
      </div>

      <section className={q.block} aria-labelledby="emails-heading">
        <h2 id="emails-heading">The emails</h2>
        <p className={s.hint}>Each one goes out a set number of days after someone starts, counted from when they started. Change an email any time; people get the version that&apos;s there on their day.</p>
        <ol className={q.steps}>
          {view.steps.map((st) => (
            <li key={st.id} className={q.stepRow} data-testid="series-step-row">
              <span className={q.dayBadge}>{st.delayDays === 0 ? "Day 0" : `Day ${st.delayDays}`}</span>
              <StepThumb step={st} brand={brand} baseUrl={baseUrl} />
              <span className={q.stepText}>
                <strong>{st.subject || "(no subject)"}</strong>
                <span>{st.delayDays === 0 ? "Goes out right away" : `${st.delayDays} day${st.delayDays === 1 ? "" : "s"} after they start`}</span>
                {st.problems > 0 ? <span className={q.flag}>{st.problems} to fill in</span> : <span className="muted">{st.sent ? `Sent ${st.sent.toLocaleString("en-US")} times` : "Ready"}</span>}
              </span>
              <span className={q.stepActions}>
                <Link href={`/marketing/series/${view.id}/steps/${st.id}`} className="btn" data-testid="edit-step">
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
                {c.canEdit && view.steps.length > 1 && (
                  <button
                    type="button"
                    className={`${s.iconButton} ${s.danger}`}
                    aria-label={`Remove the day ${st.delayDays} email`}
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(`Remove the day ${st.delayDays} email from this series?`)) return;
                      start(async () => {
                        if (c.storage === "browser") writeSeries(c.tenantId, c.site, (all) => all.map((x) => (x.id === view.id ? { ...x, steps: x.steps.filter((y) => y.id !== st.id) } : x)));
                        else {
                          const r = await deleteStepAction(st.id);
                          if (r && !r.ok) setMessage({ ok: false, text: r.message });
                        }
                      });
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ol>
        {c.canEdit && view.steps.length < 12 && (
          <form
            className={s.inline}
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                if (c.storage === "browser") {
                  if (view.steps.some((x) => x.delayDays === nextDay)) return setMessage({ ok: false, text: `There's already an email on day ${nextDay}. Pick another day.` });
                  const stepId = demoId("step");
                  writeSeries(c.tenantId, c.site, (all) =>
                    all.map((x) => (x.id === view.id ? { ...x, steps: [...x.steps, { id: stepId, delayDays: nextDay, subject: "[Add a subject]", preheader: "", doc: { version: EMAIL_DOC_VERSION, signOff: true, fallbackName: "there", sections: [{ id: "note", type: "text", body: "Hi {first name},\n\n[Add what this email says.]", align: "left" }] } }] } : x)),
                  );
                  router.push(`/marketing/series/${view.id}/steps/${stepId}`);
                  return;
                }
                const r = await addStepAction(view.id, nextDay);
                if (r && !r.ok) setMessage({ ok: false, text: r.message });
              });
            }}
          >
            <div className={s.field} style={{ flex: "0 1 160px" }}>
              <label htmlFor="new-step-day" className={s.fieldLabel}>
                Add an email on day
              </label>
              <input id="new-step-day" type="number" min={0} max={365} className="input" value={nextDay} onChange={(e) => setDay(Number(e.target.value))} />
            </div>
            <button type="submit" className="btn" disabled={pending} data-testid="add-step">
              <Plus aria-hidden="true" />
              Add email
            </button>
          </form>
        )}
      </section>

      {view.trigger === "manual" && canSend && (
        <section className={q.block} aria-labelledby="start-heading">
          <h2 id="start-heading">Start it</h2>
          <p className={s.hint}>Everyone subscribed on the list you pick starts today. People who&apos;ve been in this series before are skipped.</p>
          <div className={s.inline}>
            <div className={s.field}>
              <label htmlFor="start-list" className={s.fieldLabel}>
                For
              </label>
              <select id="start-list" className="select" value={startList} onChange={(e) => setStartList(e.target.value)}>
                <option value="">Everyone subscribed</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.count.toLocaleString("en-US")})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || view.status !== "on"}
              data-testid="start-series"
              onClick={() =>
                start(async () => {
                  if (c.storage === "browser") return setMessage({ ok: true, text: "This is a demo, so nobody was started. In your own account, they'd get the first email right away." });
                  const r = await startSeriesForListAction(view.id, startList || null);
                  setMessage({ ok: r.ok, text: r.message });
                })
              }
            >
              <Play aria-hidden="true" />
              Start
            </button>
          </div>
          {view.status !== "on" && <p className={s.hint}>Turn the series on to start it.</p>}
        </section>
      )}

      {c.canEdit && <SeriesSettings c={c} view={view} forms={forms} onMessage={setMessage} />}

      {message && (
        <p className={`notice ${message.ok ? "notice-ok" : "notice-error"}`} role={message.ok ? "status" : "alert"} data-testid="series-detail-message">
          {message.text}
        </p>
      )}

      {c.canEdit && !view.starter && (
        <button
          type="button"
          className={`${s.linkButton} ${s.danger}`}
          onClick={() => {
            if (!window.confirm(`Delete ${view.name}? Anyone in it stops getting its emails.`)) return;
            start(async () => {
              if (c.storage === "browser") {
                writeSeries(c.tenantId, c.site, (all) => all.filter((x) => x.id !== view.id));
                router.push("/marketing/series");
              } else {
                const r = await deleteSeriesAction(view.id);
                if (r && !r.ok) setMessage({ ok: false, text: r.message });
              }
            });
          }}
        >
          <Trash2 aria-hidden="true" />
          Delete this series
        </button>
      )}
    </div>
  );
}

function SeriesSettings({ c, view, forms, onMessage }: { c: Common; view: SeriesView; forms: { value: string; label: string }[]; onMessage: (m: { ok: boolean; text: string }) => void }) {
  const [name, setName] = useState(view.name);
  const [trigger, setTrigger] = useState<SequenceTrigger>(view.trigger);
  const [detail, setDetail] = useState(view.triggerDetail || forms[0]?.value || "");
  const [pending, start] = useTransition();
  return (
    <form
      className={q.block}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          if (c.storage === "browser") {
            writeSeries(c.tenantId, c.site, (all) => all.map((x) => (x.id === view.id ? { ...x, name, trigger, triggerDetail: trigger === "form" ? detail : "" } : x)));
            return onMessage({ ok: true, text: "Saved in this browser." });
          }
          const r = await updateSeriesAction(view.id, { name, trigger, detail });
          onMessage({ ok: r.ok, text: r.message });
        });
      }}
    >
      <h2>Settings</h2>
      <div className={s.twoUp}>
        <div className={s.field}>
          <label htmlFor="series-edit-name" className={s.fieldLabel}>
            Name
          </label>
          <input id="series-edit-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div className={s.field}>
          <label htmlFor="series-edit-trigger" className={s.fieldLabel}>
            Starts when
          </label>
          <select id="series-edit-trigger" className="select" value={trigger} onChange={(e) => setTrigger(e.target.value as SequenceTrigger)}>
            {(Object.keys(c.triggers) as SequenceTrigger[]).map((t) => (
              <option key={t} value={t}>
                {c.triggers[t].label}
                {c.triggers[t].ready ? "" : " (needs Sales)"}
              </option>
            ))}
          </select>
        </div>
      </div>
      {trigger === "form" && (
        <div className={s.field}>
          <label htmlFor="series-edit-form" className={s.fieldLabel}>
            Which form
          </label>
          <select id="series-edit-form" className="select" value={detail} onChange={(e) => setDetail(e.target.value)}>
            {forms.length === 0 && <option value="">No forms yet. Add one to a landing page first.</option>}
            {forms.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className={s.hint}>{c.triggers[trigger].note}</p>
      <div>
        <button type="submit" className="btn" disabled={pending}>
          Save settings
        </button>
      </div>
    </form>
  );
}

// ---- One email in a series ------------------------------------------------------------------

export function StepEditor(props: {
  c: Common;
  seriesId: string;
  stepId: string;
  server: { step: StepView; seriesName: string; seriesStatus: "on" | "off" } | null;
  brand: BrandKit;
  baseUrl: string;
  team: { email: string; name: string }[];
  me: string;
}) {
  const demo = useDemoMarketing(props.c.tenantId);
  const client = useIsClient();
  const found = useMemo(() => {
    if (props.c.storage === "server") return props.server;
    if (!client) return null;
    const series = (demo.series ?? demoSeed(props.c.site)).find((x) => x.id === props.seriesId);
    const st = series?.steps.find((x) => x.id === props.stepId);
    return series && st ? { step: { ...st, problems: 0, sent: 0 }, seriesName: series.name, seriesStatus: series.status } : null;
    // Read once: the builder keeps its own copy from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.c.storage, props.server, client, props.seriesId, props.stepId]);
  const [day, setDay] = useState<number | null>(null);

  if (props.c.storage === "browser" && !client) return <div aria-busy="true" style={{ minHeight: 400 }} />;
  if (!found) {
    return (
      <div className={s.empty}>
        <strong>This email isn&apos;t here</strong>
        <span>It may have been removed from the series.</span>
        <Link href={`/marketing/series/${props.seriesId}`} className="btn">
          Back to the series
        </Link>
      </div>
    );
  }
  const currentDay = day ?? found.step.delayDays;
  const browser = props.c.storage === "browser";

  const save = async (content: EmailContent) => {
    if (browser) {
      writeSeries(props.c.tenantId, props.c.site, (all) => all.map((x) => (x.id === props.seriesId ? { ...x, steps: x.steps.map((y) => (y.id === props.stepId ? { ...y, ...content, delayDays: currentDay } : y)) } : x)));
      return { ok: true, message: "Saved in this browser" };
    }
    return saveStepAction(props.stepId, { ...content, delayDays: currentDay });
  };

  return (
    <EmailBuilder
      heading={`${found.seriesName}: ${currentDay === 0 ? "day 0" : `day ${currentDay}`}`}
      backHref={`/marketing/series/${props.seriesId}`}
      backLabel={found.seriesName}
      initial={{ subject: found.step.subject, preheader: found.step.preheader, doc: found.step.doc }}
      brand={props.brand}
      baseUrl={props.baseUrl}
      site={props.c.site}
      storage={props.c.storage}
      save={save}
      dirtyKey={String(currentDay)}
      readOnly={!props.c.canEdit}
      readOnlyNote="Your role can see this series but not change it."
      banner={found.seriesStatus === "on" ? { tone: "info", text: "This series is on. Changes reach people whose day comes up after you save." } : null}
      status={<span className={found.seriesStatus === "on" ? "pill pill-good" : "pill"}>{found.seriesStatus === "on" ? "Series on" : "Series off"}</span>}
      test={
        props.c.canEdit
          ? {
              team: props.team,
              me: props.me,
              send: async (content, to) => {
                if (browser) {
                  writeDemo(props.c.tenantId, (d) => ({ ...d, tested: true }));
                  return { ok: true, message: "This is a demo, so nothing was sent." };
                }
                return testStepAction(props.stepId, content, to);
              },
            }
          : undefined
      }
      extraSettings={
        <div className={s.field}>
          <label htmlFor="step-day" className={s.fieldLabel}>
            Goes out on day
          </label>
          <input id="step-day" type="number" min={0} max={365} className="input" value={currentDay} disabled={!props.c.canEdit} onChange={(e) => setDay(Math.max(0, Math.min(365, Number(e.target.value) || 0)))} data-testid="step-day" />
          <span className={s.hint}>Days after someone starts. 0 goes right away. Saved with the email.</span>
        </div>
      }
    />
  );
}
