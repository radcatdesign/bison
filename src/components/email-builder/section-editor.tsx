"use client";

// Edit one email section by hand. Changes show in the email as soon as the
// section is valid; until then the form keeps what you typed and says what's
// missing.
import { ImageUp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { describeIssues, type EmailImage, type EmailSection, emailSectionSchema } from "@/lib/email/schema";
import m from "@/components/marketing/marketing.module.css";
import { uploadImage } from "@/components/marketing/upload";
import s from "./builder.module.css";

type Raw = Record<string, unknown>;
type Field =
  | { key: string; label: string; kind: "text" | "textarea"; rows?: number; optional?: boolean; hint?: string }
  | { key: string; label: string; kind: "choice"; options: { value: string | number; label: string }[] }
  | { key: string; label: string; kind: "image" }
  | { key: string; label: string; kind: "button"; optional?: boolean }
  | { key: string; label: string; kind: "link"; optional?: boolean; hint?: string }
  | { key: string; label: string; kind: "cards" }
  | { key: string; label: string; kind: "note"; text: string; href?: string; cta?: string };

const BODY_HINT = "A blank line starts a new paragraph. **Two stars** make text bold, [words](https://...) make a link, and lines starting with - make a list. {first name} becomes each person's first name.";
const ALIGN = { key: "align", label: "Line up", kind: "choice" as const, options: [{ value: "left", label: "Left" }, { value: "center", label: "Centered" }] };

const SPECS: Record<EmailSection["type"], Field[]> = {
  text: [{ key: "heading", label: "Heading", kind: "text", optional: true }, { key: "body", label: "Text", kind: "textarea", rows: 7, hint: BODY_HINT }, ALIGN],
  photo: [
    { key: "image", label: "Photo", kind: "image" },
    { key: "caption", label: "Caption", kind: "text", optional: true },
    { key: "href", label: "Link the photo to", kind: "link", optional: true },
    { key: "width", label: "Width", kind: "choice", options: [{ value: "inset", label: "With margins" }, { value: "full", label: "Edge to edge" }] },
  ],
  "photo-text": [
    { key: "image", label: "Photo", kind: "image" },
    { key: "heading", label: "Heading", kind: "text", optional: true },
    { key: "body", label: "Text", kind: "textarea", rows: 4, hint: BODY_HINT },
    { key: "button", label: "Button", kind: "button", optional: true },
    { key: "side", label: "Photo on the", kind: "choice", options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }] },
  ],
  "header-photo": [
    { key: "image", label: "Photo", kind: "image" },
    { key: "heading", label: "Headline", kind: "text", optional: true },
    { key: "body", label: "Text under it", kind: "textarea", rows: 2, optional: true },
  ],
  cards: [
    { key: "columns", label: "Side by side", kind: "choice", options: [{ value: 2, label: "Two" }, { value: 3, label: "Three" }] },
    { key: "cards", label: "Cards", kind: "cards" },
  ],
  button: [
    { key: "label", label: "Button text", kind: "text" },
    { key: "href", label: "Goes to", kind: "link", hint: "A full web address, like https://yoursite.com/sale." },
    { key: "style", label: "Style", kind: "choice", options: [{ value: "solid", label: "Solid" }, { value: "outline", label: "Outline" }] },
    ALIGN,
  ],
  highlight: [
    { key: "heading", label: "Heading", kind: "text", optional: true },
    { key: "body", label: "Text", kind: "textarea", rows: 3, hint: BODY_HINT },
    { key: "button", label: "Button", kind: "button", optional: true },
  ],
  divider: [{ key: "style", label: "Style", kind: "choice", options: [{ value: "line", label: "A line" }, { value: "space", label: "Just space" }] }],
  offer: [
    { key: "heading", label: "Heading", kind: "text" },
    { key: "body", label: "Text", kind: "textarea", rows: 2, optional: true },
    { key: "note", label: "", kind: "note", text: "Each new subscriber sees their own one-time code here, with what it's worth and when it ends. People without a code don't see this box at all.", href: "/marketing/offer", cta: "Welcome offer settings" },
  ],
};

function clean(raw: Raw, type: EmailSection["type"]): Raw {
  const out: Raw = { ...raw };
  for (const f of SPECS[type]) {
    if ((f.kind === "text" || f.kind === "textarea" || f.kind === "link") && "optional" in f && f.optional && typeof out[f.key] === "string" && !(out[f.key] as string).trim()) delete out[f.key];
  }
  return out;
}

type Props = { section: EmailSection; onCommit: (next: EmailSection, key: string) => void; storage: "server" | "browser"; disabled?: boolean };

export function SectionEditor({ section, onCommit, storage, disabled }: Props) {
  const [raw, setRaw] = useState<Raw>(section as unknown as Raw);
  const [error, setError] = useState<string | null>(null);
  const committed = useRef(JSON.stringify(section));

  // Pick up changes made elsewhere (undo, duplicate) without clobbering typing.
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
    const parsed = emailSectionSchema.safeParse(clean(next, section.type));
    if (parsed.success) {
      committed.current = JSON.stringify(parsed.data);
      setError(null);
      onCommit(parsed.data, `${section.id}.${key}`);
    } else {
      setError(describeIssues(parsed.error).replace(/^[a-z.0-9]+: /i, ""));
    }
  };

  const id = (k: string) => `${section.id}-${k}`;
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  return (
    <fieldset className={s.form} data-testid={`email-section-form-${section.type}`} disabled={disabled}>
      {SPECS[section.type].map((f) => {
        switch (f.kind) {
          case "text":
          case "textarea":
            return (
              <div key={f.key} className={m.field}>
                <label className={m.fieldLabel} htmlFor={id(f.key)}>
                  {f.label}
                  {f.optional && <em>Optional</em>}
                </label>
                {f.kind === "text" ? (
                  <input id={id(f.key)} className="input" value={str(raw[f.key])} onChange={(e) => update(f.key, e.target.value)} />
                ) : (
                  <textarea id={id(f.key)} className={`input ${m.textarea}`} rows={f.rows ?? 3} value={str(raw[f.key])} onChange={(e) => update(f.key, e.target.value)} aria-describedby={f.hint ? id(`${f.key}-hint`) : undefined} />
                )}
                {f.hint && (
                  <span id={id(`${f.key}-hint`)} className={m.hint}>
                    {f.hint}
                  </span>
                )}
              </div>
            );
          case "link":
            return (
              <div key={f.key} className={m.field}>
                <label className={m.fieldLabel} htmlFor={id(f.key)}>
                  {f.label}
                  {f.optional && <em>Optional</em>}
                </label>
                <input id={id(f.key)} className="input" inputMode="url" placeholder="https://" value={str(raw[f.key])} onChange={(e) => update(f.key, e.target.value.trim())} />
                {f.hint && <span className={m.hint}>{f.hint}</span>}
              </div>
            );
          case "choice":
            return (
              <div key={f.key} className={m.field} role="radiogroup" aria-label={f.label}>
                <span className={m.fieldLabel}>{f.label}</span>
                <div className={m.choices}>
                  {f.options.map((o) => (
                    <button key={String(o.value)} type="button" role="radio" aria-checked={raw[f.key] === o.value} className={m.choice} onClick={() => update(f.key, o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          case "image":
            return (
              <ImageField
                key={f.key}
                id={id(f.key)}
                label={f.label}
                image={(raw.image as EmailImage | null) ?? null}
                alt={str(raw.alt)}
                storage={storage}
                onImage={(img) => update("image", img)}
                onAlt={(alt) => update("alt", alt)}
              />
            );
          case "button":
            return <ButtonField key={f.key} id={id(f.key)} label={f.label} value={raw[f.key] as { label: string; href: string } | undefined} onChange={(v) => update(f.key, v)} />;
          case "cards":
            return <CardsField key={f.key} id={id(f.key)} cards={(raw.cards as Raw[]) ?? []} storage={storage} onChange={(cards) => update("cards", cards)} />;
          case "note":
            return (
              <p key={f.key} className={m.hint}>
                {f.text}{" "}
                {f.href && (
                  <Link href={f.href} className="link">
                    {f.cta}
                  </Link>
                )}
              </p>
            );
        }
      })}
      {error && (
        <p className={s.formError} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function ImageField({ id, label, image, alt, storage, onImage, onAlt }: { id: string; label: string; image: EmailImage | null; alt: string; storage: "server" | "browser"; onImage: (i: EmailImage | null) => void; onAlt: (a: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={m.field}>
      <span className={m.fieldLabel}>{label}</span>
      <div className={s.imageRow}>
        <div className={s.imageThumb}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.src} alt="" />
          ) : (
            <span>No photo yet</span>
          )}
        </div>
        <div className={s.imageActions}>
          <input
            ref={input}
            id={id}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/heic"
            className="visually-hidden"
            data-testid="image-file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setError(null);
              const r = await uploadImage(file, "email-image", storage);
              setBusy(false);
              if (input.current) input.current.value = "";
              if (r.ok) onImage(r.image);
              else setError(r.message);
            }}
          />
          <label htmlFor={id} className="btn">
            <ImageUp aria-hidden="true" />
            {busy ? "Uploading" : image ? "Replace" : "Upload a photo"}
          </label>
          {image && (
            <button type="button" className="btn btn-ghost" onClick={() => onImage(null)}>
              Remove
            </button>
          )}
        </div>
      </div>
      {error && (
        <span className={s.formError} role="alert">
          {error}
        </span>
      )}
      <label className={m.fieldLabel} htmlFor={`${id}-alt`}>
        Describe the photo <em>For people who can&apos;t see images</em>
      </label>
      <input id={`${id}-alt`} className="input" value={alt} maxLength={200} onChange={(e) => onAlt(e.target.value)} placeholder="A finished pool lit blue at night" />
    </div>
  );
}

function ButtonField({ id, label, value, onChange }: { id: string; label: string; value: { label: string; href: string } | undefined; onChange: (v: { label: string; href: string } | undefined) => void }) {
  const [draft, setDraft] = useState(value ?? { label: "", href: "" });
  const on = Boolean(value) || Boolean(draft.label || draft.href);
  const push = (next: { label: string; href: string }) => {
    setDraft(next);
    onChange(next.label.trim() || next.href.trim() ? next : undefined);
  };
  return (
    <div className={m.field}>
      <span className={m.fieldLabel}>
        {label} <em>Optional</em>
      </span>
      {on ? (
        <div className={m.twoUp}>
          <input className="input" aria-label={`${label} text`} placeholder="Button text" value={draft.label} onChange={(e) => push({ ...draft, label: e.target.value })} id={id} />
          <input className="input" aria-label={`${label} link`} placeholder="https://" inputMode="url" value={draft.href} onChange={(e) => push({ ...draft, href: e.target.value.trim() })} />
        </div>
      ) : (
        <button type="button" className={m.linkButton} onClick={() => setDraft({ label: "Take a look", href: "https://" })}>
          <Plus aria-hidden="true" />
          Add a button
        </button>
      )}
    </div>
  );
}

function CardsField({ id, cards, storage, onChange }: { id: string; cards: Raw[]; storage: "server" | "browser"; onChange: (cards: Raw[]) => void }) {
  const set = (i: number, change: Raw) => onChange(cards.map((c, j) => (j === i ? { ...c, ...change } : c)));
  return (
    <div className={s.cards}>
      {cards.map((c, i) => (
        <div key={i} className={s.cardEditor}>
          <div className={s.cardHead}>
            <strong>Card {i + 1}</strong>
            {cards.length > 2 && (
              <button type="button" className={`${m.iconButton} ${m.danger}`} aria-label={`Remove card ${i + 1}`} onClick={() => onChange(cards.filter((_, j) => j !== i))}>
                <Trash2 aria-hidden="true" />
              </button>
            )}
          </div>
          <ImageField id={`${id}-${i}-image`} label="Photo" image={(c.image as EmailImage | null) ?? null} alt={typeof c.alt === "string" ? c.alt : ""} storage={storage} onImage={(image) => set(i, { image })} onAlt={(alt) => set(i, { alt })} />
          <div className={m.field}>
            <label className={m.fieldLabel} htmlFor={`${id}-${i}-heading`}>
              Heading
            </label>
            <input id={`${id}-${i}-heading`} className="input" value={typeof c.heading === "string" ? c.heading : ""} onChange={(e) => set(i, { heading: e.target.value })} />
          </div>
          <div className={m.field}>
            <label className={m.fieldLabel} htmlFor={`${id}-${i}-body`}>
              Text <em>Optional</em>
            </label>
            <textarea id={`${id}-${i}-body`} className={`input ${m.textarea}`} rows={2} value={typeof c.body === "string" ? c.body : ""} onChange={(e) => set(i, { body: e.target.value || undefined })} />
          </div>
          <ButtonField id={`${id}-${i}-button`} label="Button" value={c.button as { label: string; href: string } | undefined} onChange={(button) => set(i, { button })} />
        </div>
      ))}
      {cards.length < 6 && (
        <button type="button" className={m.linkButton} onClick={() => onChange([...cards, { image: null, alt: "", heading: "Another card" }])}>
          <Plus aria-hidden="true" />
          Add a card
        </button>
      )}
    </div>
  );
}
