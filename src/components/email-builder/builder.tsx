"use client";

// The email builder: the email itself is the canvas. Click any part of it to
// edit that section beside it, reorder or duplicate sections, preview at
// desktop or phone size, send yourself a test, and save it as a template.
// Changes save on their own. Newsletters and series emails both use it.
import { ArrowDown, ArrowLeft, ArrowUp, ChevronRight, Copy, Eye, Mail, Plus, Redo2, Rows3, Send, Settings2, Trash2, Undo2, X } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useEditionKey, useSay } from "@/components/edition";
import { DeviceSwitch } from "@/components/marketing/brand-kit-editor";
import { EmailFrame, type EmailDevice } from "@/components/marketing/email-frame";
import m from "@/components/marketing/marketing.module.css";
import { applyEmailOp, type EmailOp, emailProblems, starterEmailSection } from "@/lib/email/ops";
import { mergeLine, renderEmail } from "@/lib/email/render";
import { type BrandKit, EMAIL_SECTION_LABELS, EMAIL_SECTION_NOTES, EMAIL_SECTION_TYPES, type EmailDoc, type EmailSection, type EmailSectionType } from "@/lib/email/schema";
import s from "./builder.module.css";
import { SectionEditor } from "./section-editor";

export type EmailContent = { subject: string; preheader: string; doc: EmailDoc };
export type Result = { ok: boolean; message: string };

export type BuilderProps = {
  heading: string;
  backHref: string;
  backLabel: string;
  initial: EmailContent;
  brand: BrandKit;
  baseUrl: string;
  site: string;
  storage: "server" | "browser";
  /** Saves on its own a moment after each change. */
  save: (content: EmailContent) => Promise<Result>;
  status?: ReactNode;
  readOnly?: boolean;
  readOnlyNote?: string;
  /** A line across the top, like why the last send didn't go out. */
  banner?: { tone: "error" | "info"; text: string } | null;
  test?: { team: { email: string; name: string }[]; me: string; send: (content: EmailContent, to: string) => Promise<Result> };
  saveTemplate?: (name: string, content: EmailContent) => Promise<Result>;
  /** The main button (Send, Turn on...). Gets what's on screen and a way to save it first. */
  actions?: (ctx: { content: EmailContent; problems: { sectionId: string | null; text: string }[]; flush: () => Promise<boolean>; showProblems: () => void }) => ReactNode;
  /** Shown above the sections list, like a series step's day. */
  extraSettings?: ReactNode;
  /** Something saved along with the email that the builder doesn't own, like that day. A change saves too. */
  dirtyKey?: string;
};

type Tab = "sections" | "email" | "preview";
const MAX_UNDO = 60;

export function EmailBuilder(props: BuilderProps) {
  const { initial, brand, baseUrl, site, storage, save, readOnly } = props;
  const edition = useEditionKey();
  const say = useSay();
  // The offer section is the welcome offer in Bison Ops and the intro offer in Fit Funnels.
  const sectionLabel = (t: EmailSectionType) => (t === "offer" ? say(EMAIL_SECTION_LABELS.offer, "Intro offer code") : EMAIL_SECTION_LABELS[t]);
  const sectionNote = (t: EmailSectionType) => (t === "offer" ? say(EMAIL_SECTION_NOTES.offer, "Shows each new lead their own code") : EMAIL_SECTION_NOTES[t]);
  const [content, setContent] = useState<EmailContent>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<{ id: string; nonce: number } | null>(null);
  const [tab, setTab] = useState<Tab>("sections");
  const [device, setDevice] = useState<EmailDevice>("desktop");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const history = useRef({ past: [] as EmailContent[], future: [] as EmailContent[], key: null as string | null, at: 0 });
  // How many steps undo and redo have, kept in state so the buttons update.
  const [steps, setSteps] = useState({ past: 0, future: 0 });
  const rerender = () => setSteps({ past: history.current.past.length, future: history.current.future.length });
  const stamp = (c: EmailContent) => `${JSON.stringify(c)}|${props.dirtyKey ?? ""}`;
  const stampRef = useRef(stamp);
  useEffect(() => {
    stampRef.current = stamp;
  });
  const savedJson = useRef(stamp(initial));
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  });

  // ---- Changes and undo ----
  const change = useCallback((next: EmailContent, key: string | null = null) => {
    const h = history.current;
    const now = Date.now();
    if (!(key && key === h.key && now - h.at < 1500)) h.past = [...h.past.slice(-MAX_UNDO + 1), contentRef.current];
    h.future = [];
    h.key = key;
    h.at = now;
    setContent(next);
    rerender();
  }, []);

  const apply = (op: EmailOp, key: string | null = null) => {
    try {
      const r = applyEmailOp(contentRef.current.doc, op);
      change({ ...contentRef.current, doc: r.doc }, key);
      return r;
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "That change didn't fit the email." });
      return null;
    }
  };

  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(contentRef.current);
    h.key = null;
    setContent(prev);
    rerender();
  };
  const redo = () => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(contentRef.current);
    h.key = null;
    setContent(next);
    rerender();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- Saving on its own ----
  const flush = useCallback(async (): Promise<boolean> => {
    const json = stampRef.current(contentRef.current);
    if (json === savedJson.current) return true;
    setSaveState("saving");
    const r = await save(contentRef.current);
    if (r.ok) {
      savedJson.current = json;
      setSaveState("saved");
      return true;
    }
    setSaveState("error");
    setNotice({ ok: false, text: r.message });
    return false;
  }, [save]);

  const current = stamp(content);
  useEffect(() => {
    if (readOnly) return;
    if (current === savedJson.current) return;
    setSaveState("saving");
    const timer = setTimeout(() => void flush(), 800);
    return () => clearTimeout(timer);
  }, [current, flush, readOnly]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (stampRef.current(contentRef.current) !== savedJson.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  // ---- Selection ----
  const select = (id: string | null, scroll = true) => {
    setSelectedId(id);
    if (id && scroll) setScrollTo((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  const html = useMemo(
    () => renderEmail({ doc: content.doc, brand, subject: content.subject, preheader: content.preheader, baseUrl, builder: { selectedId: tab === "preview" ? null : selectedId } }).html,
    [content, brand, baseUrl, selectedId, tab],
  );

  const problems = emailProblems(content.doc, content.subject, content.preheader);
  const showProblems = () => {
    const first = problems.find((p) => p.sectionId) ?? problems[0];
    if (!first) return;
    if (first.sectionId) {
      setTab("sections");
      select(first.sectionId);
    } else setTab("email");
    setNotice({ ok: false, text: problems.length === 1 ? first.text : `${problems.length} things to fix before this can go out. First: ${first.text}` });
  };

  const addSection = (type: EmailSectionType) => {
    const r = apply({ op: "add", section: starterEmailSection(type, site, new Set(content.doc.sections.map((x) => x.id)), edition), after: selectedId });
    if (r?.selected) select(r.selected);
    setAdding(false);
  };

  const inboxSubject = mergeLine(content.subject || "(no subject yet)", { name: null, business: brand.businessName, fallback: content.doc.fallbackName });
  const inboxPreheader = mergeLine(content.preheader, { name: null, business: brand.businessName, fallback: content.doc.fallbackName });

  return (
    <div className={s.builder} data-tab={tab} data-testid="email-builder" data-no-pull>
      <header className={s.topbar}>
        <Link href={props.backHref} className={m.iconButton} aria-label={`Back to ${props.backLabel}`}>
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div className={s.titleBlock}>
          <strong className={s.title}>{props.heading}</strong>
          <span className={s.meta}>
            {props.status}
            {!readOnly && (
              <span className={s.saveState} data-state={saveState} data-testid="save-state">
                {saveState === "saving" ? "Saving" : saveState === "error" ? "Not saved" : storage === "browser" ? "Saved in this browser" : "Saved"}
              </span>
            )}
          </span>
        </div>
        <DeviceSwitch device={device} onChange={setDevice} />
        <div className={s.topActions}>
          {!readOnly && (
            <>
              <button type="button" className={m.iconButton} onClick={undo} disabled={!steps.past} aria-label="Undo" title="Undo">
                <Undo2 aria-hidden="true" />
              </button>
              <button type="button" className={m.iconButton} onClick={redo} disabled={!steps.future} aria-label="Redo" title="Redo">
                <Redo2 aria-hidden="true" />
              </button>
            </>
          )}
          {!readOnly && problems.length > 0 && (
            <button type="button" className={s.todo} onClick={showProblems} data-testid="problem-count">
              {problems.length} to fix
            </button>
          )}
          {props.test && <TestButton test={props.test} content={content} />}
          {props.actions && <Actions render={props.actions} content={content} problems={problems} flush={flush} showProblems={showProblems} />}
        </div>
      </header>

      {notice && (
        <div className={s.notice} data-ok={notice.ok || undefined} role={notice.ok ? "status" : "alert"} data-testid="builder-notice">
          <span>{notice.text}</span>
          <button type="button" className={m.iconButton} aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}
      {props.banner ? (
        <p className={`notice ${props.banner.tone === "error" ? "notice-error" : ""} ${s.readOnly}`} role={props.banner.tone === "error" ? "alert" : "status"} data-testid="builder-banner">
          {props.banner.text}
        </p>
      ) : (
        readOnly && props.readOnlyNote && <p className={`notice ${s.readOnly}`}>{props.readOnlyNote}</p>
      )}

      <nav className={s.tabs} aria-label="Builder">
        {(
          [
            ["sections", "Sections", Rows3],
            ["email", "Email", Settings2],
            ["preview", "Preview", Eye],
          ] as const
        ).map(([key, label, Icon]) => (
          <button key={key} type="button" className={s.tab} aria-current={tab === key ? "true" : undefined} onClick={() => setTab(key)} data-testid={`btab-${key}`}>
            <Icon aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      <aside className={s.panel}>
        {tab === "email" ? (
          <EmailSettings content={content} readOnly={readOnly} onChange={(next, key) => change(next, key)} extra={props.extraSettings} saveTemplate={props.saveTemplate} />
        ) : (
          <div className={s.sections} data-testid="email-sections">
            {props.extraSettings && <div className={s.extra}>{props.extraSettings}</div>}
            {content.doc.sections.length === 0 && <p className={s.empty}>This email is empty. Add a section to start, or go back and pick a template.</p>}
            <ol className={s.sectionList}>
              {content.doc.sections.map((section, i) => {
                const open = section.id === selectedId;
                const flagged = problems.some((p) => p.sectionId === section.id);
                return (
                  <li key={section.id} className={s.sectionItem} data-open={open || undefined} data-testid="email-section">
                    <button type="button" className={s.sectionHead} onClick={() => select(open ? null : section.id)} aria-expanded={open}>
                      <ChevronRight aria-hidden="true" className={s.chev} />
                      <span className={s.sectionText}>
                        <span className={s.sectionType}>
                          {sectionLabel(section.type)}
                          {flagged && <span className={s.flag}>To fix</span>}
                        </span>
                        <span className={s.sectionSummary}>{summary(section)}</span>
                      </span>
                    </button>
                    {open && (
                      <div className={s.sectionBody}>
                        {!readOnly && (
                          <div className={s.sectionTools}>
                            <button type="button" className={m.iconButton} aria-label="Move up" disabled={i === 0} onClick={() => apply({ op: "move", id: section.id, to: i - 1 })}>
                              <ArrowUp aria-hidden="true" />
                            </button>
                            <button type="button" className={m.iconButton} aria-label="Move down" disabled={i === content.doc.sections.length - 1} onClick={() => apply({ op: "move", id: section.id, to: i + 1 })}>
                              <ArrowDown aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className={m.iconButton}
                              aria-label="Duplicate"
                              onClick={() => {
                                const r = apply({ op: "duplicate", id: section.id });
                                if (r?.selected) select(r.selected);
                              }}
                            >
                              <Copy aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className={`${m.iconButton} ${m.danger}`}
                              aria-label="Remove"
                              onClick={() => {
                                apply({ op: "remove", id: section.id });
                                setSelectedId(null);
                              }}
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          </div>
                        )}
                        <SectionEditor section={section} storage={storage} disabled={readOnly} onCommit={(next, key) => apply({ op: "update", section: next }, key)} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {!readOnly &&
              (adding ? (
                <div className={s.addMenu} data-testid="email-add-menu">
                  <div className={s.addHead}>
                    <strong>Add a section</strong>
                    <button type="button" className={m.linkButton} onClick={() => setAdding(false)}>
                      Cancel
                    </button>
                  </div>
                  <div className={s.addGrid}>
                    {EMAIL_SECTION_TYPES.map((type) => (
                      <button key={type} type="button" className={s.addType} onClick={() => addSection(type)}>
                        <strong>{sectionLabel(type)}</strong>
                        <span>{sectionNote(type)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button type="button" className={s.addSection} onClick={() => setAdding(true)} data-testid="email-add-section">
                  <Plus aria-hidden="true" />
                  {selectedId ? "Add a section after this one" : "Add a section"}
                </button>
              ))}
          </div>
        )}
      </aside>

      <section className={s.canvasArea} aria-label="Email" data-email-scroll>
        <div className={s.inbox} aria-label="How it looks in an inbox">
          <span className={s.inboxIcon} aria-hidden="true">
            <Mail />
          </span>
          <span className={s.inboxText}>
            <strong>{brand.fromName}</strong>
            <span>
              <span className={s.inboxSubject} data-testid="inbox-subject">
                {inboxSubject}
              </span>
              {inboxPreheader && <span className={s.inboxPre}> {inboxPreheader}</span>}
            </span>
          </span>
        </div>
        <EmailFrame
          html={html}
          device={tab === "preview" ? "phone" : device}
          scrollTo={scrollTo}
          testId="email-canvas"
          onSelect={(id) => {
            if (tab === "preview") return;
            select(id, false);
            setTab("sections");
          }}
        />
      </section>
    </div>
  );
}

function Actions({ render, ...ctx }: { render: NonNullable<BuilderProps["actions"]> } & Parameters<NonNullable<BuilderProps["actions"]>>[0]) {
  return <>{render(ctx)}</>;
}

function summary(section: EmailSection): string {
  switch (section.type) {
    case "text":
    case "highlight":
      return section.heading || section.body.slice(0, 80) || "Empty";
    case "photo":
      return section.caption || section.alt || (section.image ? "Photo" : "No photo yet");
    case "photo-text":
    case "header-photo":
      return section.heading || section.alt || (section.image ? "Photo" : "No photo yet");
    case "cards":
      return section.cards.map((c) => c.heading).join(", ");
    case "button":
      return section.label;
    case "divider":
      return section.style === "line" ? "A line" : "Space";
    case "offer":
      return section.heading;
  }
}

function EmailSettings({ content, readOnly, onChange, extra, saveTemplate }: { content: EmailContent; readOnly?: boolean; onChange: (next: EmailContent, key: string) => void; extra?: ReactNode; saveTemplate?: (name: string, c: EmailContent) => Promise<Result> }) {
  const say = useSay();
  const [name, setName] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  return (
    <fieldset className={s.form} disabled={readOnly} data-testid="email-settings">
      {extra}
      <div className={m.field}>
        <label htmlFor="email-subject" className={m.fieldLabel}>
          Subject line
        </label>
        <input id="email-subject" className="input" value={content.subject} maxLength={150} onChange={(e) => onChange({ ...content, subject: e.target.value }, "subject")} />
        <span className={m.hint}>Under 50 characters reads best on phones. {"{first name}"} works here too.</span>
      </div>
      <div className={m.field}>
        <label htmlFor="email-preheader" className={m.fieldLabel}>
          Preview text <em>Optional</em>
        </label>
        <input id="email-preheader" className="input" value={content.preheader} maxLength={150} onChange={(e) => onChange({ ...content, preheader: e.target.value }, "preheader")} />
        <span className={m.hint}>The grey line most inboxes show after the subject.</span>
      </div>
      <div className={m.field}>
        <label htmlFor="email-fallback" className={m.fieldLabel}>
          When there&apos;s no first name, say
        </label>
        <input id="email-fallback" className="input" value={content.doc.fallbackName} maxLength={40} onChange={(e) => onChange({ ...content, doc: { ...content.doc, fallbackName: e.target.value } }, "fallback")} />
        <span className={m.hint}>So &quot;Hi {"{first name}"}&quot; reads &quot;Hi {content.doc.fallbackName || "there"}&quot; for people without a name on file.</span>
      </div>
      <label className={m.checkRow}>
        <input type="checkbox" checked={content.doc.signOff} onChange={(e) => onChange({ ...content, doc: { ...content.doc, signOff: e.target.checked } }, "signoff")} />
        <span>
          End with the sign-off from your{" "}
          <Link href="/marketing/brand#footer" className="link">
            brand kit
          </Link>
        </span>
      </label>
      {saveTemplate && !readOnly && (
        <form
          className={m.field}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveTemplate(name, content);
              setResult(r);
              if (r.ok) setName("");
            });
          }}
        >
          <label htmlFor="template-name" className={m.fieldLabel}>
            Save as a template
          </label>
          <div className={m.inline}>
            <input id="template-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={say("Monthly news", "Monthly club news")} style={{ flex: 1 }} />
            <button type="submit" className="btn" disabled={pending || !name.trim()} data-testid="save-template">
              Save
            </button>
          </div>
          {result && <span className={result.ok ? m.hint : s.formError}>{result.message}</span>}
        </form>
      )}
    </fieldset>
  );
}

function TestButton({ test, content }: { test: NonNullable<BuilderProps["test"]>; content: EmailContent }) {
  const say = useSay();
  const dialog = useRef<HTMLDialogElement>(null);
  const [to, setTo] = useState(test.me);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className="btn" onClick={() => dialog.current?.showModal()} data-testid="open-test">
        <Send aria-hidden="true" />
        <span className={s.hideSm}>Send test</span>
      </button>
      <dialog ref={dialog} className={m.dialog} aria-label="Send a test" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <form
          className={m.dialogBody}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => setResult(await test.send(content, to)));
          }}
        >
          <div className={m.dialogHead}>
            <h2>Send a test</h2>
            <button type="button" className={m.iconButton} aria-label="Close" onClick={() => dialog.current?.close()}>
              <X aria-hidden="true" />
            </button>
          </div>
          <p className={m.hint}>{say("Goes to someone on your team, exactly as subscribers will get it, with [Test] in front of the subject. Welcome codes show a sample.", "Goes to someone on your team, exactly as members and leads will get it, with [Test] in front of the subject. Intro offer codes show a sample.")}</p>
          <div className={m.field}>
            <label htmlFor="test-to-builder" className={m.fieldLabel}>
              Send to
            </label>
            <select id="test-to-builder" className="select" value={to} onChange={(e) => setTo(e.target.value)}>
              {test.team.map((t) => (
                <option key={t.email} value={t.email}>
                  {t.name ? `${t.name} (${t.email})` : t.email}
                </option>
              ))}
            </select>
          </div>
          {result && (
            <p className={`notice ${result.ok ? "notice-ok" : "notice-error"}`} role={result.ok ? "status" : "alert"} data-testid="test-result">
              {result.message}
            </p>
          )}
          <div className={m.dialogActions}>
            <button type="button" className="btn" onClick={() => dialog.current?.close()}>
              Close
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending} data-testid="send-test">
              {pending ? "Sending" : "Send test"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
