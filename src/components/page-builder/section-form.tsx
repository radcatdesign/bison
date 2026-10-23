"use client";

// Edit one section by hand. Typing updates the preview as soon as the section
// is valid; until then the field keeps what you typed and says what's missing.
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { describeIssues, FORM_FIELDS, type Section, sectionSchema } from "@/lib/pages/schema";
import s from "./builder.module.css";

type Raw = Record<string, unknown>;
type Field =
  | { key: string; label: string; kind: "text" | "textarea"; rows?: number; optional?: boolean; hint?: string }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[] }
  | { key: string; label: string; kind: "cta"; optional?: boolean }
  | { key: string; label: string; kind: "items"; itemFields: { key: string; label: string; kind: "text" | "textarea" }[]; min: number; max: number; noun: string }
  | { key: string; label: string; kind: "list"; max: number; noun: string }
  | { key: string; label: string; kind: "fields" };

const SPECS: Record<Section["type"], Field[]> = {
  hero: [
    { key: "eyebrow", label: "Label above the headline", kind: "text", optional: true },
    { key: "headline", label: "Headline", kind: "textarea", rows: 2 },
    { key: "body", label: "Text", kind: "textarea", rows: 3, optional: true },
    { key: "primary", label: "Main button", kind: "cta", optional: true },
    { key: "secondary", label: "Second button", kind: "cta", optional: true },
    { key: "align", label: "Layout", kind: "select", options: [{ value: "left", label: "Text left, art right" }, { value: "center", label: "Centered" }] },
    { key: "art", label: "Background", kind: "select", options: [{ value: "glow", label: "Glow" }, { value: "grid", label: "Grid" }, { value: "orbs", label: "Orbs" }, { value: "none", label: "Plain" }] },
  ],
  features: [
    { key: "heading", label: "Heading", kind: "text", optional: true },
    { key: "intro", label: "Intro", kind: "textarea", rows: 2, optional: true },
    { key: "items", label: "Points", kind: "items", itemFields: [{ key: "title", label: "Title", kind: "text" }, { key: "body", label: "Text", kind: "textarea" }], min: 1, max: 6, noun: "point" },
  ],
  steps: [
    { key: "heading", label: "Heading", kind: "text", optional: true },
    { key: "items", label: "Steps", kind: "items", itemFields: [{ key: "title", label: "Title", kind: "text" }, { key: "body", label: "Text", kind: "textarea" }], min: 2, max: 6, noun: "step" },
  ],
  stats: [
    { key: "heading", label: "Heading", kind: "text", optional: true },
    { key: "items", label: "Numbers", kind: "items", itemFields: [{ key: "value", label: "Number", kind: "text" }, { key: "label", label: "What it counts", kind: "text" }], min: 2, max: 4, noun: "number" },
  ],
  quote: [
    { key: "quote", label: "Quote", kind: "textarea", rows: 4, hint: "Use a real quote from a real customer." },
    { key: "name", label: "Name", kind: "text" },
    { key: "role", label: "Company or town", kind: "text", optional: true },
  ],
  offer: [
    { key: "heading", label: "Heading", kind: "text" },
    { key: "price", label: "Price or deal", kind: "text", optional: true },
    { key: "note", label: "Small print", kind: "text", optional: true },
    { key: "bullets", label: "What's included", kind: "list", max: 8, noun: "line" },
    { key: "cta", label: "Button", kind: "cta", optional: true },
  ],
  faq: [
    { key: "heading", label: "Heading", kind: "text", optional: true },
    { key: "items", label: "Questions", kind: "items", itemFields: [{ key: "q", label: "Question", kind: "text" }, { key: "a", label: "Answer", kind: "textarea" }], min: 1, max: 10, noun: "question" },
  ],
  form: [
    { key: "heading", label: "Heading", kind: "text" },
    { key: "body", label: "Text", kind: "textarea", rows: 2, optional: true },
    { key: "fields", label: "Fields", kind: "fields" },
    { key: "submit", label: "Button", kind: "text" },
    { key: "success", label: "Message after sending", kind: "textarea", rows: 2 },
  ],
  cta: [
    { key: "headline", label: "Headline", kind: "textarea", rows: 2 },
    { key: "body", label: "Text", kind: "textarea", rows: 2, optional: true },
    { key: "cta", label: "Button", kind: "cta" },
  ],
  text: [
    { key: "heading", label: "Heading", kind: "text", optional: true },
    { key: "body", label: "Text", kind: "textarea", rows: 8, hint: "A blank line starts a new paragraph." },
  ],
};

const FIELD_NAMES: Record<string, string> = { name: "Name", email: "Email", phone: "Phone", company: "Company", message: "Message" };

/** Optional text fields left empty are removed rather than saved as "". */
function clean(raw: Raw, type: Section["type"]): Raw {
  const out: Raw = { ...raw };
  for (const f of SPECS[type]) {
    if ((f.kind === "text" || f.kind === "textarea") && f.optional && typeof out[f.key] === "string" && !(out[f.key] as string).trim()) delete out[f.key];
  }
  return out;
}

export function SectionForm({ section, onCommit, onEditStart }: { section: Section; onCommit: (next: Section) => void; onEditStart: (key: string) => void }) {
  const [raw, setRaw] = useState<Raw>(section as unknown as Raw);
  const [error, setError] = useState<string | null>(null);
  const committed = useRef(JSON.stringify(section));

  // Pick up changes made elsewhere (the agent, undo) without clobbering typing.
  useEffect(() => {
    const incoming = JSON.stringify(section);
    if (incoming !== committed.current) {
      committed.current = incoming;
      setRaw(section as unknown as Raw);
      setError(null);
    }
  }, [section]);

  const update = (key: string, value: unknown) => {
    const next = { ...raw, [key]: value };
    if (value === undefined) delete next[key];
    setRaw(next);
    onEditStart(`${section.id}.${key}`);
    const parsed = sectionSchema.safeParse(clean(next, section.type));
    if (parsed.success) {
      committed.current = JSON.stringify(parsed.data);
      setError(null);
      onCommit(parsed.data);
    } else {
      setError(describeIssues(parsed.error).replace(/^[a-z.0-9]+: /i, ""));
    }
  };

  const str = (v: unknown) => (typeof v === "string" ? v : "");

  return (
    <div className={s.form} data-testid={`section-form-${section.id}`}>
      {SPECS[section.type].map((f) => {
        const id = `${section.id}-${f.key}`;
        switch (f.kind) {
          case "text":
          case "textarea":
            return (
              <div key={f.key} className={s.field}>
                <label className={s.fieldLabel} htmlFor={id}>
                  {f.label}
                  {f.optional && <em>Optional</em>}
                </label>
                {f.kind === "text" ? (
                  <input id={id} value={str(raw[f.key])} aria-describedby={f.hint ? `${id}-hint` : undefined} onChange={(e) => update(f.key, e.target.value)} />
                ) : (
                  <textarea id={id} rows={f.rows ?? 3} value={str(raw[f.key])} aria-describedby={f.hint ? `${id}-hint` : undefined} onChange={(e) => update(f.key, e.target.value)} />
                )}
                {f.hint && (
                  <span id={`${id}-hint`} className={s.hint}>
                    {f.hint}
                  </span>
                )}
              </div>
            );
          case "select":
            return (
              <div key={f.key} className={s.field}>
                <label className={s.fieldLabel} htmlFor={id}>
                  {f.label}
                </label>
                <select id={id} value={str(raw[f.key])} onChange={(e) => update(f.key, e.target.value)}>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          case "cta": {
            const cta = raw[f.key] as { label?: string; href?: string } | undefined;
            if (!cta) {
              return (
                <div key={f.key} className={s.field}>
                  <span className={s.fieldLabel}>{f.label}</span>
                  <button type="button" className={s.addRow} onClick={() => update(f.key, { label: "Get in touch", href: "#form" })}>
                    <Plus aria-hidden="true" />
                    Add a button
                  </button>
                </div>
              );
            }
            return (
              <fieldset key={f.key} className={s.group}>
                <legend className={s.fieldLabel}>
                  {f.label}
                  {f.optional && (
                    <button type="button" className={s.linkButton} onClick={() => update(f.key, undefined)}>
                      Remove
                    </button>
                  )}
                </legend>
                <div className={s.pair}>
                  <input aria-label={`${f.label} text`} value={cta.label ?? ""} onChange={(e) => update(f.key, { ...cta, label: e.target.value })} />
                  <input aria-label={`${f.label} link`} className="mono" value={cta.href ?? ""} placeholder="#form or https://" onChange={(e) => update(f.key, { ...cta, href: e.target.value })} />
                </div>
              </fieldset>
            );
          }
          case "items": {
            const items = (Array.isArray(raw[f.key]) ? raw[f.key] : []) as Raw[];
            return (
              <fieldset key={f.key} className={s.group}>
                <legend className={s.fieldLabel}>{f.label}</legend>
                {items.map((item, i) => (
                  <div key={i} className={s.itemCard}>
                    {f.itemFields.map((sub) => (
                      <div key={sub.key} className={s.subField}>
                        <label htmlFor={`${id}-${i}-${sub.key}`}>{sub.label}</label>
                        {sub.kind === "text" ? (
                          <input id={`${id}-${i}-${sub.key}`} value={str(item[sub.key])} onChange={(e) => update(f.key, items.map((x, j) => (j === i ? { ...x, [sub.key]: e.target.value } : x)))} />
                        ) : (
                          <textarea id={`${id}-${i}-${sub.key}`} rows={2} value={str(item[sub.key])} onChange={(e) => update(f.key, items.map((x, j) => (j === i ? { ...x, [sub.key]: e.target.value } : x)))} />
                        )}
                      </div>
                    ))}
                    {items.length > f.min && (
                      <button type="button" className={s.iconButton} aria-label={`Remove ${f.noun} ${i + 1}`} onClick={() => update(f.key, items.filter((_, j) => j !== i))}>
                        <Trash2 aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
                {items.length < f.max && (
                  <button type="button" className={s.addRow} onClick={() => update(f.key, [...items, Object.fromEntries(f.itemFields.map((x) => [x.key, `New ${f.noun}`]))])}>
                    <Plus aria-hidden="true" />
                    Add a {f.noun}
                  </button>
                )}
              </fieldset>
            );
          }
          case "list": {
            const lines = (Array.isArray(raw[f.key]) ? raw[f.key] : []) as string[];
            return (
              <fieldset key={f.key} className={s.group}>
                <legend className={s.fieldLabel}>{f.label}</legend>
                {lines.map((line, i) => (
                  <div key={i} className={s.listRow}>
                    <input aria-label={`${f.label} ${i + 1}`} value={line} onChange={(e) => update(f.key, lines.map((x, j) => (j === i ? e.target.value : x)))} />
                    <button type="button" className={s.iconButton} aria-label={`Remove ${f.noun} ${i + 1}`} onClick={() => update(f.key, lines.filter((_, j) => j !== i))}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {lines.length < f.max && (
                  <button type="button" className={s.addRow} onClick={() => update(f.key, [...lines, `New ${f.noun}`])}>
                    <Plus aria-hidden="true" />
                    Add a {f.noun}
                  </button>
                )}
              </fieldset>
            );
          }
          case "fields": {
            const chosen = (Array.isArray(raw[f.key]) ? raw[f.key] : []) as string[];
            return (
              <fieldset key={f.key} className={s.group}>
                <legend className={s.fieldLabel}>{f.label}</legend>
                <div className={s.checks}>
                  {FORM_FIELDS.map((name) => (
                    <label key={name} className={s.check}>
                      <input
                        type="checkbox"
                        checked={chosen.includes(name)}
                        disabled={name === "email"}
                        onChange={(e) => update(f.key, FORM_FIELDS.filter((x) => (x === name ? e.target.checked : chosen.includes(x))))}
                      />
                      {FIELD_NAMES[name]}
                    </label>
                  ))}
                </div>
                <span className={s.hint}>Email is always on, so you can reply. Sends land in Contacts.</span>
              </fieldset>
            );
          }
        }
      })}
      {error && (
        <p className={s.fieldError} role="alert">
          Not shown yet: {error}
        </p>
      )}
    </div>
  );
}
