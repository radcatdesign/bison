"use client";

// Templates to start a page from. Each card shows the real page, built with the
// company's name; opening one previews it at desktop or phone size before use.
import { Monitor, Smartphone, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Device } from "@/components/page-preview";
import { buildFromTemplate, PAGE_TEMPLATES, type PageTemplate } from "@/lib/pages/page-templates";
import { findPlaceholders } from "@/lib/pages/schema";
import { Canvas } from "./canvas";
import s from "./template-gallery.module.css";

type Props = {
  tenant: { name: string; accent: string };
  canEdit: boolean;
  busy: boolean;
  /** Creates a page from the template and opens it. */
  onUse: (template: PageTemplate, brandColor: boolean) => void;
};

export function TemplateGallery({ tenant, canEdit, busy, onUse }: Props) {
  const [open, setOpen] = useState<PageTemplate | null>(null);
  const [brandColor, setBrandColor] = useState(true);
  const [device, setDevice] = useState<Device>("desktop");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ctx = { brand: tenant.name, accent: tenant.accent };

  // Cards show each template in its own colors, so the choices look different.
  const cards = useMemo(() => PAGE_TEMPLATES.map((t) => ({ template: t, doc: buildFromTemplate(t, ctx, false) })), [ctx.brand, ctx.accent]); // eslint-disable-line react-hooks/exhaustive-deps
  const previewDoc = open ? buildFromTemplate(open, ctx, brandColor) : null;
  const toFill = previewDoc ? findPlaceholders(previewDoc).length : 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <ul className={s.grid} data-testid="template-gallery">
        {cards.map(({ template, doc }) => (
          <li key={template.key}>
            <button
              type="button"
              className={s.card}
              onClick={() => {
                setDevice(window.matchMedia("(max-width: 600px)").matches ? "phone" : "desktop");
                setOpen(template);
              }}
              data-testid={`template-${template.key}`}
            >
              <span className={s.thumb}>
                <Canvas doc={doc} brand={tenant.name} thumb title={`Preview of the ${template.name} template`} />
              </span>
              <span className={s.cardBody}>
                <strong>{template.name}</strong>
                <span className={s.desc}>{template.description}</span>
                <span className={s.tags}>
                  {template.tags.map((tag) => (
                    <span key={tag} className="pill">
                      {tag}
                    </span>
                  ))}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <dialog ref={dialogRef} className={s.dialog} onClose={() => setOpen(null)} onCancel={() => setOpen(null)} aria-labelledby="template-title" data-testid="template-preview">
        {open && previewDoc && (
          <div className={s.sheet}>
            <header className={s.head}>
              <div className={s.headText}>
                <h2 id="template-title">{open.name}</h2>
                <p>{open.description}</p>
              </div>
              <div className={s.devices} role="radiogroup" aria-label="Preview size">
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
              <button type="button" className={s.close} onClick={() => setOpen(null)} aria-label="Close">
                <X aria-hidden="true" />
              </button>
            </header>

            <div className={s.stage}>
              <Canvas doc={previewDoc} brand={tenant.name} device={device} outlines={false} testId="template-frame" title={`${open.name} template`} />
            </div>

            <footer className={s.foot}>
              <label className={s.colorToggle}>
                <input type="checkbox" checked={brandColor} onChange={(e) => setBrandColor(e.target.checked)} />
                <span className={s.swatch} style={{ background: tenant.accent }} aria-hidden="true" />
                Use my brand color
              </label>
              <span className={s.note}>
                {toFill ? `Your company name is in. ${toFill} yellow ${toFill === 1 ? "spot" : "spots"} for things only you know.` : "Your company name is in. Ready to edit."}
              </span>
              {canEdit && (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onUse(open, brandColor)} data-testid="use-template">
                  {busy ? "Opening" : "Use this template"}
                </button>
              )}
            </footer>
          </div>
        )}
      </dialog>
    </>
  );
}
