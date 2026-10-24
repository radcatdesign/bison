"use client";

// Marketing > Pages: describe a new page for the agent, or open one you've made.
// Fit Funnels calls them funnel pages and shows its own club templates.
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createPageAction } from "@/app/(portal)/marketing/pages/actions";
import { useSay } from "@/components/edition";
import { PageHeader } from "@/components/ui";
import type { PageStatus } from "@/lib/pages/repo";
import { useIsClient } from "@/lib/use-is-client";
import { emptyPageDoc, type PageDoc, titleFromBrief } from "@/lib/pages/schema";
import s from "./pages-home.module.css";
import { Canvas } from "./canvas";
import { buildFromTemplate, type PageTemplate } from "@/lib/pages/page-templates";
import { createDemoPage, demoPages } from "./store";
import { TemplateGallery } from "./template-gallery";

export type PageCard = { id: string; title: string; slug: string; status: PageStatus; edited: string; doc: PageDoc; /** A running A/B test on the page. */ testId?: string | null };

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

/** The screen's title and note, in the company's words. Also the loading frame. */
export function PagesHeader() {
  const say = useSay();
  return (
    <PageHeader
      title={say("Pages", "Funnel pages")}
      note={say("Landing pages you build by describing them. Forms on every page send to Contacts.", "Funnel pages you build by describing them: free passes, intro offers, classes and more. Forms on every page send to Leads.")}
    />
  );
}

export function PagesHome({ storage, pages: serverPages, tenant, seed, canEdit, error }: Props) {
  const say = useSay();
  const router = useRouter();
  const client = useIsClient();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, startCreating] = useTransition();

  const startFromTemplate = (template: PageTemplate, brandColor: boolean) => {
    if (storage === "browser") {
      const page = createDemoPage(tenant.id, template.name, buildFromTemplate(template, { brand: tenant.name, accent: tenant.accent }, brandColor));
      setBusy(true);
      router.push(`/marketing/pages/${page.id}`);
      return;
    }
    const data = new FormData();
    data.set("template", template.key);
    if (brandColor) data.set("brandColor", "on");
    startCreating(() => createPageAction(data));
  };

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
              {say("Describe a new page", "Describe a new funnel page")}
            </label>
            <textarea
              id="new-page-prompt"
              name="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={say(
                "A page for our spring sale on glow aggregate, 15% off through May, with a quote form and a few common questions",
                "A free week pass page for first-time visitors, with what's included, a short form and a few common questions",
              )}
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
              <span className={s.composerNote}>
                {say(
                  "The agent writes plain copy and leaves yellow placeholders for anything only you know, like prices and quotes.",
                  "The agent writes plain copy and leaves yellow placeholders for anything only you know, like prices, class times and member quotes.",
                )}
              </span>
            </div>
          </div>
        </form>
      )}

      <section className={s.block} aria-labelledby="templates-heading">
        <div className={s.blockHead}>
          <h2 id="templates-heading">{say("Start from a template", "Start from a club template")}</h2>
          <p>{say("Each one is filled in with your company name. Open one to see it at full size.", "Each one is filled in with your club's name. Open one to see it at full size.")}</p>
        </div>
        <TemplateGallery tenant={tenant} canEdit={canEdit} busy={busy || creating} onUse={startFromTemplate} />
      </section>

      <section className={s.block} aria-labelledby="your-pages-heading">
        <div className={s.blockHead}>
          <h2 id="your-pages-heading">{say("Your pages", "Your funnel pages")}</h2>
        </div>
      {pages === null ? (
        <div className={s.grid} aria-busy="true">
          <div className={s.skeleton} />
        </div>
      ) : pages.length === 0 ? (
        <p className={s.empty}>{say("No pages yet. Describe one above, or start from a template.", "No funnel pages yet. Describe one above, or start from a club template.")}</p>
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
                    {p.testId && <span className="pill pill-accent">In an A/B test</span>}
                    <span className="mono">/{p.slug}</span>
                  </span>
                  <span className={s.edited}>{p.edited}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      </section>
    </div>
  );
}
