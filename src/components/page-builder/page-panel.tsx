"use client";

// The look of the page, its address, search details and whether it's live.
import { useState } from "react";
import { useSay } from "@/components/edition";
import type { PageStatus } from "@/lib/pages/repo";
import type { PageDoc, PageTheme } from "@/lib/pages/schema";
import s from "./builder.module.css";
import type { Result } from "./store";

const SWATCHES = ["#3b5bff", "#14b8a6", "#16a34a", "#f97316", "#e5484d", "#ec4899", "#7c3aed", "#111111"];
const FONTS: { value: PageTheme["font"]; label: string; family: string }[] = [
  { value: "modern", label: "Modern", family: '"Mona Sans Variable", ui-sans-serif, sans-serif' },
  { value: "editorial", label: "Editorial", family: '"Fraunces Variable", ui-serif, Georgia, serif' },
  { value: "technical", label: "Technical", family: '"Geist Mono Variable", ui-monospace, monospace' },
];

type Props = {
  doc: PageDoc;
  meta: { title: string; slug: string; status: PageStatus; publicUrl: string | null };
  /** A version in an A/B test: only its look can change; the name, address and search details are the page's. */
  lookOnly?: boolean;
  /** The page is in a running A/B test. */
  inTest?: boolean;
  storage: "server" | "browser";
  publicBase: string;
  canPublish: boolean;
  accentDefault: string;
  onTheme: (changes: Partial<PageTheme>) => void;
  onSeo: (changes: { title?: string; description?: string }) => void;
  onRename: (title: string, slug: string) => Promise<Result>;
  onUnpublish: () => void;
  onDelete: () => void;
};

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      <div className={s.segmented} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PagePanel({ doc, meta, lookOnly, inTest, storage, publicBase, canPublish, accentDefault, onTheme, onSeo, onRename, onUnpublish, onDelete }: Props) {
  const say = useSay();
  const inbox = say("Contacts", "Leads");
  const [title, setTitle] = useState(meta.title);
  const [slug, setSlug] = useState(meta.slug);
  const [renameMsg, setRenameMsg] = useState<Result | null>(null);
  // What's typed in the color box, until the page's accent changes some other way.
  const [typed, setTyped] = useState({ for: doc.theme.accent, value: doc.theme.accent });
  const hex = typed.for === doc.theme.accent ? typed.value : doc.theme.accent;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const swatches = [accentDefault, ...SWATCHES.filter((c) => c !== accentDefault)].slice(0, 8);

  const renameDirty = title !== meta.title || slug !== meta.slug;

  return (
    <div className={s.pagePanel} data-testid="page-panel">
      <section className={s.panelSection} aria-labelledby="look">
        <h2 id="look" className={s.panelHeading}>
          Look
        </h2>
        <Choice label="Mode" value={doc.theme.mode} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} onChange={(mode) => onTheme({ mode })} />

        <div className={s.field}>
          <span className={s.fieldLabel}>Accent</span>
          <div className={s.swatches}>
            {swatches.map((c) => (
              <button key={c} type="button" className={s.swatch} style={{ background: c }} aria-label={`Use ${c}`} aria-pressed={doc.theme.accent === c} onClick={() => onTheme({ accent: c })} />
            ))}
            <label className={s.swatchCustom}>
              <input type="color" value={doc.theme.accent} onChange={(e) => onTheme({ accent: e.target.value })} aria-label="Pick any color" />
            </label>
            <input
              className={`mono ${s.hex}`}
              value={hex}
              onChange={(e) => {
                setTyped({ for: doc.theme.accent, value: e.target.value });
                if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onTheme({ accent: e.target.value });
              }}
              aria-label="Accent color code"
            />
          </div>
        </div>

        <div className={s.field}>
          <span className={s.fieldLabel}>Type</span>
          <div className={s.fonts} role="radiogroup" aria-label="Type">
            {FONTS.map((f) => (
              <button key={f.value} type="button" role="radio" aria-checked={doc.theme.font === f.value} className={s.fontCard} onClick={() => onTheme({ font: f.value })}>
                <span style={{ fontFamily: f.family }}>Aa</span>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <Choice label="Corners" value={doc.theme.corners} options={[{ value: "sharp", label: "Sharp" }, { value: "soft", label: "Soft" }, { value: "round", label: "Round" }]} onChange={(corners) => onTheme({ corners })} />
      </section>

      {lookOnly ? (
        <section className={s.panelSection} aria-labelledby="version-note">
          <h2 id="version-note" className={s.panelHeading}>
            Name, address and search
          </h2>
          <p className={s.hint}>Every version shares the page&apos;s name, address and search details, so search engines see one page. Change those on the page itself.</p>
        </section>
      ) : (
        <>

      <section className={s.panelSection} aria-labelledby="address">
        <h2 id="address" className={s.panelHeading}>
          Name and address
        </h2>
        <div className={s.field}>
          <label className={s.fieldLabel} htmlFor="page-title">
            Name in your list
          </label>
          <input id="page-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </div>
        <div className={s.field}>
          <label className={s.fieldLabel} htmlFor="page-slug">
            Address
          </label>
          <span className={s.slugRow}>
            <span className={`mono ${s.slugBase}`}>{publicBase.replace(/^https?:\/\//, "")}</span>
            <input id="page-slug" className="mono" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} maxLength={60} />
          </span>
        </div>
        {renameDirty && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const r = await onRename(title.trim(), slug.replace(/-+/g, "-").replace(/^-|-$/g, ""));
              setRenameMsg(r);
            }}
          >
            Save name and address
          </button>
        )}
        {renameMsg && <p className={renameMsg.ok ? s.hint : s.fieldError}>{renameMsg.ok ? "Saved." : renameMsg.message}</p>}
      </section>

      <section className={s.panelSection} aria-labelledby="search">
        <h2 id="search" className={s.panelHeading}>
          Search and sharing
        </h2>
        <div className={s.field}>
          <label className={s.fieldLabel} htmlFor="seo-title">
            Title<em>{doc.seo.title.length}/70</em>
          </label>
          <input id="seo-title" value={doc.seo.title} maxLength={70} onChange={(e) => onSeo({ title: e.target.value })} />
        </div>
        <div className={s.field}>
          <label className={s.fieldLabel} htmlFor="seo-description">
            Description<em>{doc.seo.description.length}/160</em>
          </label>
          <textarea id="seo-description" rows={3} value={doc.seo.description} maxLength={160} onChange={(e) => onSeo({ description: e.target.value })} />
        </div>
      </section>

      <section className={s.panelSection} aria-labelledby="live">
        <h2 id="live" className={s.panelHeading}>
          Publishing
        </h2>
        {storage === "browser" ? (
          <p className={s.hint}>This is a demo, so pages stay in your browser. In your own account, Publish puts the page at {publicBase.replace(/^https?:\/\//, "")}{meta.slug} and its form sends land in {inbox}.</p>
        ) : meta.status === "draft" ? (
          <p className={s.hint}>Not live yet. Publish puts it at {publicBase.replace(/^https?:\/\//, "")}{meta.slug}. Form sends land in {inbox}.</p>
        ) : (
          <>
            <p className={s.hint}>
              Live at{" "}
              <a href={meta.publicUrl ?? "#"} target="_blank" rel="noreferrer" className="link">
                {(meta.publicUrl ?? "").replace(/^https?:\/\//, "")}
              </a>
              {meta.status === "changed" && (inTest ? ". You have changes that aren't live yet; they can go live once the A/B test ends." : ". You have changes that aren't live yet; press Update to publish them.")}
            </p>
            {inTest && <p className={s.hint}>Taking the page offline ends its A/B test and keeps A, the page as it was.</p>}
            {canPublish && (
              <button type="button" className="btn" onClick={onUnpublish}>
                Take it offline
              </button>
            )}
          </>
        )}
      </section>

      <section className={s.panelSection} aria-labelledby="danger">
        <h2 id="danger" className={s.panelHeading}>
          Delete
        </h2>
        {confirmDelete ? (
          <div className={s.confirmRow}>
            <span>Delete this page{meta.status !== "draft" ? " and take it offline" : ""}? This can&apos;t be undone.</span>
            <button type="button" className={`btn ${s.dangerButton}`} onClick={onDelete} data-testid="confirm-delete">
              Delete page
            </button>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>
            Delete this page
          </button>
        )}
      </section>
        </>
      )}
    </div>
  );
}
