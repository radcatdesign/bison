"use client";

// Marketing > Pages: describe a new page for the agent, or open one you've made.
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createPageAction } from "@/app/(portal)/marketing/pages/actions";
import type { PageStatus } from "@/lib/pages/repo";
import { useIsClient } from "@/lib/use-is-client";
import { emptyPageDoc, type PageDoc, titleFromBrief } from "@/lib/pages/schema";
import s from "./pages-home.module.css";
import { Canvas } from "./canvas";
import { createDemoPage, demoPages } from "./store";

export type PageCard = { id: string; title: string; slug: string; status: PageStatus; edited: string; doc: PageDoc };

type Props = {
  storage: "server" | "browser";
  pages: PageCard[];
  tenant: { id: string; name: string; accent: string };
  seed: { title: string; slug: string; doc: PageDoc } | null;
  canEdit: boolean;
  error: string | null;
};

const STATUS: Record<PageStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "pill" },
  published: { label: "Live", tone: "pill pill-good" },
  changed: { label: "Live, with changes", tone: "pill pill-accent" },
};

export function PagesHome({ storage, pages: serverPages, tenant, seed, canEdit, error }: Props) {
  const router = useRouter();
  const client = useIsClient();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  // Demo pages live in this browser, so they're read once the page is running here.
  const pages = useMemo<PageCard[] | null>(() => {
    if (storage === "server") return serverPages;
    if (!client || !seed) return null;
    const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return demoPages(tenant.id, seed).map((p) => ({ id: p.id, title: p.title, slug: p.slug, status: "draft", edited: `Edited ${fmt.format(new Date(p.updatedAt))}`, doc: p.doc }));
  }, [storage, serverPages, client, seed, tenant.id]);

  const startDemo = (withPrompt: boolean) => {
    const brief = withPrompt ? prompt.trim() : "";
    const title = brief ? titleFromBrief(brief) : "Untitled page";
    const page = createDemoPage(tenant.id, title, emptyPageDoc(tenant.accent));
    setBusy(true);
    router.push(`/marketing/pages/${page.id}${brief ? `?build=${encodeURIComponent(brief)}` : ""}`);
  };

  return (
    <div className={s.home}>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      {canEdit && (
        <form
          className={s.composer}
          action={storage === "server" ? createPageAction : undefined}
          onSubmit={
            storage === "browser"
              ? (e) => {
                  e.preventDefault();
                  const blank = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "blank";
                  startDemo(!blank);
                }
              : () => setBusy(true)
          }
          data-testid="new-page"
        >
          <span className={s.mark} aria-hidden="true">
            <Sparkles />
          </span>
          <div className={s.composerBody}>
            <label htmlFor="new-page-prompt" className={s.composerTitle}>
              Describe a new page
            </label>
            <textarea
              id="new-page-prompt"
              name="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="A page for our spring sale on glow aggregate, 15% off through May, with a quote form and a few common questions"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
              }}
            />
            <div className={s.composerActions}>
              <button type="submit" name="mode" value="build" className="btn btn-primary" disabled={busy || !prompt.trim()} data-testid="build-page">
                Build it
                <ArrowRight aria-hidden="true" />
              </button>
              <button type="submit" name="mode" value="blank" className="btn" disabled={busy} data-testid="blank-page">
                Start blank
              </button>
              <span className={s.composerNote}>The agent writes plain copy and leaves yellow placeholders for anything only you know, like prices and quotes.</span>
            </div>
          </div>
        </form>
      )}

      {pages === null ? (
        <div className={s.grid} aria-busy="true">
          <div className={s.skeleton} />
        </div>
      ) : pages.length === 0 ? (
        <p className={s.empty}>No pages yet. Describe one above and the agent will build it.</p>
      ) : (
        <ul className={s.grid} data-testid="page-list">
          {pages.map((p) => (
            <li key={p.id}>
              <Link href={`/marketing/pages/${p.id}`} className={`card ${s.card}`} data-testid="page-card">
                <div className={s.thumb}>
                  <Canvas doc={p.doc} brand={tenant.name} thumb title={`Preview of ${p.title}`} />
                </div>
                <div className={s.cardBody}>
                  <strong>{p.title}</strong>
                  <span className={s.cardMeta}>
                    <span className={STATUS[p.status].tone}>{STATUS[p.status].label}</span>
                    <span className="mono">/{p.slug}</span>
                  </span>
                  <span className={s.edited}>{p.edited}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
