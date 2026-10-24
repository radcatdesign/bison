"use client";

// The landing page editor. One page document drives everything: the agent
// changes it, the section forms change it, and the preview shows it. Changes
// save on their own (to the account, or to this browser in the demo).
import { ArrowLeft, Eye, ExternalLink, Monitor, Palette, Redo2, Rows3, Smartphone, Sparkles, Tablet, Undo2, X } from "lucide-react";
import { saveVersionAction } from "@/app/(portal)/marketing/tests/actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useEditionKey } from "@/components/edition";
import type { SignupChoices } from "@/components/landing/landing-page";
import type { Device } from "@/components/page-preview";
import { sayFor } from "@/config/editions";
import type { AgentEvent } from "@/lib/pages/agent/types";
import { applyOp, type PageOp } from "@/lib/pages/ops";
import type { PageStatus } from "@/lib/pages/repo";
import { findPlaceholders, type PageDoc, type Section, type SectionType } from "@/lib/pages/schema";
import { starterSection } from "@/lib/pages/templates";
import { useIsClient } from "@/lib/use-is-client";
import { AgentPanel } from "./agent-panel";
import s from "./builder.module.css";
import { Canvas } from "./canvas";
import { PagePanel } from "./page-panel";
import { SectionsPanel } from "./sections-panel";
import { browserStore, demoPage, type PageStore, saveDemoPage, serverStore, type ThreadItem } from "./store";

export type EditorInitial = { title: string; slug: string; doc: PageDoc; status: PageStatus; publicUrl: string | null; thread: ThreadItem[] };

type Props = {
  pageId: string;
  /** Server pages arrive loaded; demo pages load from this browser. */
  initial: EditorInitial | null;
  storage: "server" | "browser";
  tenant: { id: string; name: string };
  publicBase: string;
  canPublish: boolean;
  agentName: "claude" | "stand-in";
  autoBuild: string | null;
  /** The "I am a..." choices, so form previews show them. */
  signup?: SignupChoices | null;
  /** Editing version B or C of an A/B test instead of the page itself. */
  version?: { id: string; key: "b" | "c"; testId: string; testName: string } | null;
  /** A test running on this page; publishing waits until it ends. */
  runningTest?: { id: string; name: string } | null;
};

type Tab = "agent" | "sections" | "page" | "preview";
type Notice = { tone: "ok" | "error" | "info"; text: string; url?: string; href?: string; linkText?: string } | null;

const DEVICE_ICONS = { desktop: Monitor, tablet: Tablet, phone: Smartphone } as const;
const uid = () => Math.random().toString(36).slice(2, 10);
const MAX_UNDO = 60;

/** Loads a demo page from this browser, then opens the editor on it. */
export function Editor(props: Props) {
  const say = sayFor(useEditionKey());
  const client = useIsClient();
  const page = useMemo(() => (props.initial || !client ? null : demoPage(props.tenant.id, props.pageId)), [props.initial, client, props.tenant.id, props.pageId]);
  if (props.initial) return <EditorCore {...props} initial={props.initial} />;
  if (!client) return <div className={s.editor} aria-busy="true" />;
  if (!page) {
    return (
      <div className={s.missing}>
        <h1>This page isn&apos;t here</h1>
        <p>Demo pages live in the browser they were made in.</p>
        <Link href="/marketing/pages" className="btn">
          {say("Back to Pages", "Back to Funnel pages")}
        </Link>
      </div>
    );
  }
  const initial: EditorInitial = { title: page.title, slug: page.slug, doc: page.doc, status: "draft", publicUrl: null, thread: page.thread.filter((t) => t.state !== "working") };
  return <EditorCore {...props} initial={initial} />;
}

/** A test version saves to the test; it's never published or renamed on its own. */
function versionStore(versionId: string): PageStore {
  const no = async () => ({ ok: false, message: "This is a version in an A/B test. It goes live when you end the test and keep it." });
  return { kind: "server", save: (_id, doc) => saveVersionAction(versionId, doc), rename: no, publish: no, unpublish: no, remove: no };
}

function EditorCore({ pageId, initial, storage, tenant, publicBase, canPublish, agentName, autoBuild, signup, version, runningTest }: Props & { initial: EditorInitial }) {
  const router = useRouter();
  const edition = useEditionKey();
  const say = sayFor(edition);
  const store = useMemo(() => (version ? versionStore(version.id) : storage === "server" ? serverStore : browserStore(tenant.id, publicBase, edition)), [version, storage, tenant.id, publicBase, edition]);

  const [doc, setDoc] = useState<PageDoc | null>(initial.doc);
  const [meta, setMeta] = useState({ title: initial.title, slug: initial.slug, status: initial.status, publicUrl: initial.publicUrl });
  const [thread, setThread] = useState<ThreadItem[]>(initial.thread);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<{ id: string; nonce: number } | null>(null);
  const [tab, setTab] = useState<Tab>("agent");
  const [device, setDevice] = useState<Device>("desktop");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [notice, setNotice] = useState<Notice>(
    runningTest ? { tone: "info", text: `This page is in the A/B test "${runningTest.name}". Visitors see the test's versions, so publishing your changes waits until it ends.`, href: `/marketing/tests/${runningTest.id}`, linkText: "Open the test" } : null,
  );
  const [running, setRunning] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const history = useRef({ past: [] as PageDoc[], future: [] as PageDoc[], key: null as string | null, at: 0 });
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const savedJson = useRef(JSON.stringify(initial.doc));
  const abortRef = useRef<AbortController | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  // ---- Changes and undo ----
  const change = useCallback((next: PageDoc, key: string | null = null) => {
    const current = docRef.current;
    if (!current) return;
    const h = history.current;
    const now = Date.now();
    // Typing in one field counts as one step until you pause or move on.
    if (!(key && key === h.key && now - h.at < 1500)) {
      h.past = [...h.past.slice(-MAX_UNDO + 1), current];
    }
    h.future = [];
    h.key = key;
    h.at = now;
    setDoc(next);
    setMeta((m) => (m.status === "published" ? { ...m, status: "changed" } : m));
    rerender();
  }, []);

  const apply = useCallback(
    (op: PageOp, key: string | null = null) => {
      const current = docRef.current;
      if (!current) return null;
      try {
        const r = applyOp(current, op, edition);
        change(r.doc, key);
        return r;
      } catch (err) {
        setNotice({ tone: "error", text: err instanceof Error ? err.message : "That change didn't fit the page." });
        return null;
      }
    },
    [change, edition],
  );

  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev || !doc) return;
    h.future.push(doc);
    h.key = null;
    setDoc(prev);
    rerender();
  };
  const redo = () => {
    const h = history.current;
    const next = h.future.pop();
    if (!next || !doc) return;
    h.past.push(doc);
    h.key = null;
    setDoc(next);
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
  useEffect(() => {
    if (!doc || running) return;
    const json = JSON.stringify(doc);
    if (json === savedJson.current) return;
    setSaveState("saving");
    const timer = setTimeout(async () => {
      const r = await store.save(pageId, doc);
      if (r.ok) {
        savedJson.current = json;
        setSaveState("saved");
      } else {
        setSaveState("error");
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [doc, running, store, pageId]);

  // In the demo, the conversation is kept with the page in this browser.
  useEffect(() => {
    if (storage !== "browser") return;
    const page = demoPage(tenant.id, pageId);
    if (page) saveDemoPage(tenant.id, { ...page, thread: thread.filter((t) => t.state !== "working").slice(-30) });
  }, [thread, storage, tenant.id, pageId]);

  // ---- The agent ----
  const ask = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      const before = docRef.current;
      if (!text || !before || abortRef.current) return;

      history.current.past = [...history.current.past.slice(-MAX_UNDO + 1), before];
      history.current.future = [];
      history.current.key = null;
      rerender();

      const user: ThreadItem = { id: uid(), role: "user", text };
      const agent: ThreadItem = { id: uid(), role: "agent", text: "", steps: [], state: "working" };
      const turns = thread.filter((t) => t.state !== "error" && t.text).map((t) => ({ role: t.role, text: t.text }));
      setThread((t) => [...t, user, agent]);
      setRunning(true);
      setNotice(null);
      const patch = (fn: (x: ThreadItem) => ThreadItem) => setThread((t) => t.map((x) => (x.id === agent.id ? fn(x) : x)));
      const ac = new AbortController();
      abortRef.current = ac;

      const handle = (ev: AgentEvent) => {
        if (ev.type === "op") {
          setDoc(ev.doc);
          patch((x) => ({ ...x, steps: [...(x.steps ?? []), ev.label] }));
          if (ev.sectionId) setScrollTo({ id: ev.sectionId, nonce: Date.now() });
        } else if (ev.type === "done") {
          setDoc(ev.doc);
          patch((x) => ({ ...x, text: ev.reply, state: "done" }));
          if (ev.saved) {
            savedJson.current = JSON.stringify(ev.doc);
            setSaveState("saved");
          }
          if (ev.changes.length) setMeta((m) => (m.status === "published" ? { ...m, status: "changed" } : m));
          // After building a whole page, show it from the top.
          if (ev.changes.includes("Added hero") && ev.doc.sections[0]) setScrollTo({ id: ev.doc.sections[0].id, nonce: Date.now() });
        } else if (ev.type === "error") {
          patch((x) => ({ ...x, text: ev.message, state: "error" }));
        }
      };

      try {
        const res = await fetch("/api/pages/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pageId, versionId: version?.id, doc: before, instruction: text, history: turns }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          patch((x) => ({ ...x, text: body?.message ?? "The agent couldn't start. Try again in a moment.", state: "error" }));
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line) handle(JSON.parse(line) as AgentEvent);
          }
        }
        setThread((t) => t.map((x) => (x.id === agent.id && x.state === "working" ? { ...x, state: "error", text: "The agent stopped without finishing. The changes so far are kept." } : x)));
      } catch {
        patch((x) =>
          ac.signal.aborted
            ? { ...x, state: "done", text: x.steps?.length ? "Stopped. The changes so far are kept, and Undo takes them back." : "Stopped." }
            : { ...x, state: "error", text: "Lost the connection to the agent. The changes so far are kept." },
        );
      } finally {
        abortRef.current = null;
        setRunning(false);
      }
    },
    [pageId, thread, version],
  );

  const stop = () => abortRef.current?.abort();

  // A brief from the New page box runs as soon as the editor opens.
  const autoBuilt = useRef(false);
  useEffect(() => {
    if (!autoBuild || autoBuilt.current) return;
    autoBuilt.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    void ask(autoBuild);
  }, [autoBuild, ask]);

  // ---- Sections ----
  const select = (id: string | null, scroll = true) => {
    setSelectedId(id);
    if (id && scroll) setScrollTo({ id, nonce: Date.now() });
  };

  const addSection = (type: SectionType) => {
    const r = apply({ op: "add_section", section: starterSection(type, tenant.name, edition), after: selectedId ?? undefined });
    if (r?.sectionId) select(r.sectionId);
  };

  // ---- Publishing ----
  const placeholders = doc ? findPlaceholders(doc) : [];
  const showNextPlaceholder = () => {
    if (!placeholders.length) return;
    const i = Math.max(0, placeholders.findIndex((p) => p.sectionId === selectedId) + 1) % placeholders.length;
    select(placeholders[i].sectionId);
    setTab("sections");
  };

  const publish = async () => {
    if (!doc) return;
    if (placeholders.length) {
      setNotice({ tone: "error", text: `Fill in ${placeholders.length === 1 ? "the yellow placeholder" : `the ${placeholders.length} yellow placeholders`} before you publish.` });
      showNextPlaceholder();
      return;
    }
    setPublishing(true);
    const r = await store.publish(pageId, doc);
    setPublishing(false);
    if (r.ok) {
      savedJson.current = JSON.stringify(doc);
      setSaveState("saved");
      setMeta((m) => ({ ...m, status: "published", publicUrl: r.url ?? m.publicUrl }));
      // Anything after "Published." is XP earned, like "+3 XP."
      const xp = r.message.startsWith("Published.") ? r.message.slice("Published.".length) : "";
      setNotice({ tone: "ok", text: `Published. It's live now.${xp}`, url: r.url });
    } else {
      setNotice({ tone: store.kind === "browser" ? "info" : "error", text: r.message });
    }
  };

  if (!doc) return <div className={s.editor} aria-busy="true" />;

  const statusLabel = version ? `Version ${version.key.toUpperCase()}` : meta.status === "published" ? "Live" : meta.status === "changed" ? "Live, with changes" : "Draft";
  const backHref = version ? `/marketing/tests/${version.testId}` : "/marketing/pages";
  const tabs: { key: Tab; label: string; icon: typeof Sparkles }[] = [
    { key: "agent", label: "Agent", icon: Sparkles },
    { key: "sections", label: "Sections", icon: Rows3 },
    { key: "page", label: "Page", icon: Palette },
    { key: "preview", label: "Preview", icon: Eye },
  ];

  return (
    <div className={s.editor} data-tab={tab} data-testid="page-editor" data-no-pull>
      <header className={s.topbar}>
        <Link href={backHref} className={s.back} aria-label={version ? "Back to the test" : say("Back to Pages", "Back to Funnel pages")}>
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div className={s.titleBlock}>
          <strong className={s.pageName}>{version ? `${version.testName}: version ${version.key.toUpperCase()}` : meta.title}</strong>
          <span className={s.meta}>
            <span className={version || meta.status === "changed" ? "pill pill-accent" : meta.status === "draft" ? "pill" : "pill pill-good"} data-testid="page-status">
              {statusLabel}
            </span>
            <span className={s.saveState} data-state={saveState} data-testid="save-state">
              {saveState === "saving" ? "Saving" : saveState === "error" ? "Not saved, retrying" : storage === "browser" ? "Saved in this browser" : "Saved"}
            </span>
          </span>
        </div>

        <div className={s.devices} role="radiogroup" aria-label="Preview size">
          {(Object.keys(DEVICE_ICONS) as Device[]).map((d) => {
            const Icon = DEVICE_ICONS[d];
            return (
              <button key={d} type="button" role="radio" aria-checked={device === d} aria-label={d[0].toUpperCase() + d.slice(1)} className={s.deviceButton} onClick={() => setDevice(d)}>
                <Icon aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div className={s.topActions}>
          <button type="button" className={s.iconButton} onClick={undo} disabled={!history.current.past.length || running} aria-label="Undo" title="Undo">
            <Undo2 aria-hidden="true" />
          </button>
          <button type="button" className={s.iconButton} onClick={redo} disabled={!history.current.future.length || running} aria-label="Redo" title="Redo">
            <Redo2 aria-hidden="true" />
          </button>
          {placeholders.length > 0 && (
            <button type="button" className={s.todo} onClick={showNextPlaceholder} data-testid="placeholder-count">
              {placeholders.length} to fill in
            </button>
          )}
          {!version && meta.publicUrl && meta.status !== "draft" && (
            <a href={meta.publicUrl} target="_blank" rel="noreferrer" className={s.iconButton} aria-label="Open the live page" title="Open the live page">
              <ExternalLink aria-hidden="true" />
            </a>
          )}
          {version ? (
            <Link href={backHref} className="btn btn-primary" aria-disabled={saveState === "saving" || running} onClick={(e) => (saveState === "saving" || running) && e.preventDefault()} data-testid="version-done">
              Done
            </Link>
          ) : (
            canPublish && (
              <button type="button" className="btn btn-primary" onClick={publish} disabled={publishing || running || doc.sections.length === 0 || Boolean(runningTest)} title={runningTest ? "End the A/B test first" : undefined} data-testid="publish">
                {publishing ? "Publishing" : meta.status === "changed" ? "Update" : meta.status === "published" ? "Published" : "Publish"}
              </button>
            )
          )}
        </div>
      </header>

      {notice && (
        <div className={s.notice} data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"} data-testid="editor-notice">
          <span>
            {notice.text}{" "}
            {notice.url && (
              <a href={notice.url} target="_blank" rel="noreferrer" className="link">
                {notice.url.replace(/^https?:\/\//, "")}
              </a>
            )}
            {notice.href && (
              <Link href={notice.href} className="link">
                {notice.linkText ?? "Open"}
              </Link>
            )}
          </span>
          <button type="button" className={s.iconButton} aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      <nav className={s.tabs} aria-label="Editor">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" className={s.tab} data-key={key} aria-current={tab === key ? "true" : undefined} onClick={() => setTab(key)} data-testid={`tab-${key}`}>
            <Icon aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      <aside className={s.panel}>
        {tab === "agent" || tab === "preview" ? (
          <AgentPanel thread={thread} running={running} onAsk={ask} onStop={stop} agentName={agentName} empty={doc.sections.length === 0} onShowPreview={() => setTab("preview")} />
        ) : tab === "sections" ? (
          <SectionsPanel
            doc={doc}
            selectedId={selectedId}
            onSelect={(id) => select(id)}
            onCommit={(section: Section, key: string) => apply({ op: "update_section", id: section.id, changes: section as unknown as Record<string, unknown> }, key)}
            onAdd={addSection}
            onRemove={(id) => {
              apply({ op: "remove_section", id });
              if (selectedId === id) setSelectedId(null);
            }}
            onMove={(id, to) => apply({ op: "move_section", id, to })}
          />
        ) : (
          <PagePanel
            doc={doc}
            meta={meta}
            lookOnly={Boolean(version)}
            inTest={Boolean(runningTest)}
            storage={storage}
            publicBase={publicBase}
            canPublish={canPublish}
            accentDefault={initial.doc.theme.accent}
            onTheme={(changes) => apply({ op: "set_theme", changes }, `theme.${Object.keys(changes).join(",")}`)}
            onSeo={(changes) => apply({ op: "set_seo", changes }, `seo.${Object.keys(changes).join(",")}`)}
            onRename={async (title, slug) => {
              const r = await store.rename(pageId, title, slug);
              if (r.ok) setMeta((m) => ({ ...m, title, slug, publicUrl: r.url ?? m.publicUrl }));
              return r;
            }}
            onUnpublish={async () => {
              const r = await store.unpublish(pageId);
              if (r.ok) setMeta((m) => ({ ...m, status: "draft" }));
              setNotice({ tone: r.ok ? "ok" : "info", text: r.message });
            }}
            onDelete={async () => {
              const r = await store.remove(pageId);
              if (r.ok) router.push("/marketing/pages");
              else setNotice({ tone: "error", text: r.message });
            }}
          />
        )}
      </aside>

      <section className={s.canvasArea} aria-label="Preview">
        <Canvas doc={doc} brand={tenant.name} signup={signup} device={tab === "preview" ? "phone" : device} selectedId={tab === "sections" ? selectedId : null} onSelect={(id) => {
          select(id, false);
          if (tab !== "preview") setTab("sections");
        }} scrollTo={scrollTo} />
      </section>
    </div>
  );
}
