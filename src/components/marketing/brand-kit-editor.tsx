"use client";

// The brand kit: everything about how emails look, with a live preview of a
// real email beside it. Saved once, used by every newsletter and series.
import { ImageUp, Monitor, RotateCcw, Smartphone, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { saveBrandKitAction } from "@/app/(portal)/marketing/actions";
import { useEditionKey, useSay } from "@/components/edition";
import { renderEmail } from "@/lib/email/render";
import { sampleOfferCode } from "@/lib/marketing/settings";
import { useIsClient } from "@/lib/use-is-client";
import { BRAND_COLOR_KEYS, BRAND_COLOR_LABELS, type BrandKit, brandKitSchema, describeIssues, EMAIL_DOC_VERSION, EMAIL_FONTS, type EmailDoc, type EmailFont } from "@/lib/email/schema";
import { useDemoMarketing } from "./demo-setup";
import { writeDemo } from "./demo-store";
import { EmailFrame, type EmailDevice } from "./email-frame";
import s from "./marketing.module.css";
import { uploadImage } from "./upload";

const SAMPLE: EmailDoc = {
  version: EMAIL_DOC_VERSION,
  signOff: true,
  fallbackName: "there",
  sections: [
    { id: "intro", type: "text", heading: "Here's how your emails will look", body: "Hi {first name},\n\nThis is a sample email in your brand kit. Headings, **bold text** and [links](https://example.com) all pick up your colors and fonts.", align: "left" },
    { id: "cta", type: "button", label: "A button in your style", href: "https://example.com", align: "left", style: "solid" },
    { id: "box", type: "highlight", heading: "A highlight box", body: "For the one thing nobody should miss, like a deadline or an event date." },
    { id: "line", type: "divider", style: "line" },
    { id: "more", type: "text", body: "Your sign-off and footer come next. The footer always has your postal address and an unsubscribe link.", align: "left" },
  ],
};

/** The same sample in a club's words. */
const CLUB_SAMPLE: EmailDoc = {
  ...SAMPLE,
  sections: SAMPLE.sections.map((x) => (x.id === "box" && x.type === "highlight" ? { ...x, body: "For the one thing nobody should miss, like a class change or an event date." } : x)),
};

type Props = { initial: BrandKit; defaults: BrandKit; storage: "server" | "browser"; tenantId: string; canEdit: boolean; baseUrl: string };

export function BrandKitScreen(props: Props) {
  const demo = useDemoMarketing(props.tenantId);
  const client = useIsClient();
  const initial = props.storage === "browser" ? (demo.brand ?? props.initial) : props.initial;
  // In the demo the saved kit is read once the page runs in the browser; start the form from it.
  const ready = props.storage !== "browser" || client;
  return <BrandKitEditor key={ready ? "ready" : "first"} {...props} initial={initial} ready={ready} />;
}

function BrandKitEditor({ initial, defaults, storage, tenantId, canEdit, baseUrl, ready }: Props & { ready: boolean }) {
  const [kit, setKit] = useState<BrandKit>(initial);
  const [savedJson, setSavedJson] = useState(JSON.stringify(initial));
  const [device, setDevice] = useState<EmailDevice>("desktop");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const say = useSay();
  const edition = useEditionKey();
  const sample = edition === "fit" ? CLUB_SAMPLE : SAMPLE;

  const dirty = JSON.stringify(kit) !== savedJson;
  const set = <K extends keyof BrandKit>(key: K, value: BrandKit[K]) => setKit((k) => ({ ...k, [key]: value }));
  const setColor = (key: (typeof BRAND_COLOR_KEYS)[number], value: string) => setKit((k) => ({ ...k, colors: { ...k.colors, [key]: value.toLowerCase() } }));

  const html = useMemo(() => {
    const parsed = brandKitSchema.safeParse(kit);
    return renderEmail({ doc: sample, brand: parsed.success ? parsed.data : initial, subject: "Brand kit preview", preheader: "", baseUrl, builder: { selectedId: null, outlines: false, sampleCode: sampleOfferCode(edition) } }).html;
  }, [kit, initial, baseUrl, sample, edition]);

  const save = () =>
    startSaving(async () => {
      const parsed = brandKitSchema.safeParse(kit);
      if (!parsed.success) {
        setNotice({ ok: false, text: describeIssues(parsed.error) });
        return;
      }
      if (storage === "browser") {
        writeDemo(tenantId, (d) => ({ ...d, brand: parsed.data }));
        setSavedJson(JSON.stringify(parsed.data));
        setNotice({ ok: true, text: "Saved in this browser. In your own account, every email uses it from now on." });
        return;
      }
      const r = await saveBrandKitAction(parsed.data);
      if (r.ok) setSavedJson(JSON.stringify(parsed.data));
      setNotice({ ok: r.ok, text: r.message });
    });

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const r = await uploadImage(file, "logo", storage);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (r.ok) set("logo", r.image);
    else setNotice({ ok: false, text: r.message });
  };

  return (
    <div className={s.split} data-testid="brand-kit" data-ready={ready || undefined}>
      <div className={s.formCol}>
        <fieldset className={s.group} id="name" disabled={!canEdit}>
          <legend>Name</legend>
          <TextField id="bk-business" label={say("Business name", "Club name")} value={kit.businessName} onChange={(v) => set("businessName", v)} hint="Shown in the header when there's no logo, and in the footer." />
          <TextField id="bk-from" label="From name" value={kit.fromName} onChange={(v) => set("fromName", v)} hint="The name people see in their inbox." />
          <TextField id="bk-reply" label="Replies go to" type="email" optional value={kit.replyTo} onChange={(v) => set("replyTo", v)} hint="Leave empty to get replies at your sending address." />
        </fieldset>

        <fieldset className={s.group} id="logo" disabled={!canEdit}>
          <legend>Logo</legend>
          <div className={s.logoRow}>
            <div className={s.logoBox} style={{ background: kit.colors.headerBar }}>
              {kit.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={kit.logo.src.startsWith("/f/") ? `${baseUrl}${kit.logo.src}` : kit.logo.src} alt="Your logo" style={{ width: Math.min(kit.logoWidth, 200) }} />
              ) : (
                <span style={{ color: kit.colors.headerText }}>{kit.businessName}</span>
              )}
            </div>
            <div className={s.logoActions}>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" className="visually-hidden" id="bk-logo-file" onChange={(e) => onLogo(e.target.files?.[0])} data-testid="logo-file" />
              <label htmlFor="bk-logo-file" className="btn" aria-disabled={!canEdit || uploading}>
                <ImageUp aria-hidden="true" />
                {uploading ? "Uploading" : kit.logo ? "Replace logo" : "Upload logo"}
              </label>
              {kit.logo && (
                <button type="button" className="btn btn-ghost" onClick={() => set("logo", null)}>
                  <Trash2 aria-hidden="true" />
                  Remove
                </button>
              )}
            </div>
          </div>
          <p className={s.hint}>{say("A PNG with a transparent background looks best. Without a logo, your business name shows instead.", "A PNG with a transparent background looks best. Without a logo, your club's name shows instead.")}</p>
          {kit.logo && (
            <div className={s.field}>
              <label htmlFor="bk-logo-width" className={s.fieldLabel}>
                Logo width <span className="num">{kit.logoWidth}px</span>
              </label>
              <input id="bk-logo-width" type="range" min={40} max={280} step={4} value={kit.logoWidth} onChange={(e) => set("logoWidth", Number(e.target.value))} />
            </div>
          )}
          <Choice label="Header" value={kit.headerAlign} options={[{ value: "left", label: "Logo on the left" }, { value: "center", label: "Logo centered" }]} onChange={(v) => set("headerAlign", v as BrandKit["headerAlign"])} />
        </fieldset>

        <fieldset className={s.group} id="colors" disabled={!canEdit}>
          <legend>Colors</legend>
          <div className={s.colorGrid}>
            {BRAND_COLOR_KEYS.map((key) => (
              <div key={key} className={s.colorField}>
                <input id={`bk-color-${key}`} type="color" value={kit.colors[key]} onChange={(e) => setColor(key, e.target.value)} aria-describedby={`bk-color-${key}-note`} />
                <span className={s.colorText}>
                  <label htmlFor={`bk-color-${key}`}>{BRAND_COLOR_LABELS[key].label}</label>
                  <span id={`bk-color-${key}-note`}>{BRAND_COLOR_LABELS[key].note}</span>
                </span>
                <span className="mono">{kit.colors[key]}</span>
              </div>
            ))}
          </div>
          <button type="button" className={s.linkButton} onClick={() => setKit((k) => ({ ...k, colors: { ...defaults.colors, accent: k.colors.accent } }))}>
            <RotateCcw aria-hidden="true" />
            Reset the other colors to match
          </button>
        </fieldset>

        <fieldset className={s.group} id="fonts" disabled={!canEdit}>
          <legend>Type and buttons</legend>
          <p className={s.hint}>Email apps can only show fonts people already have, so these are the ones every phone and computer has.</p>
          <div className={s.twoUp}>
            <FontField id="bk-font-head" label="Headings" value={kit.fonts.headings} onChange={(v) => setKit((k) => ({ ...k, fonts: { ...k.fonts, headings: v } }))} />
            <FontField id="bk-font-body" label="Text" value={kit.fonts.body} onChange={(v) => setKit((k) => ({ ...k, fonts: { ...k.fonts, body: v } }))} />
          </div>
          <Choice label="Button shape" value={kit.buttonShape} options={[{ value: "square", label: "Square" }, { value: "rounded", label: "Rounded" }, { value: "pill", label: "Pill" }]} onChange={(v) => set("buttonShape", v as BrandKit["buttonShape"])} />
        </fieldset>

        <fieldset className={s.group} id="footer" disabled={!canEdit}>
          <legend>Sign-off and footer</legend>
          <TextArea id="bk-signoff" label="Sign-off" rows={3} value={kit.signOff} onChange={(v) => set("signOff", v)} hint="Goes at the end of each email. Each email can leave it out." />
          <TextArea
            id="bk-address"
            label="Postal address"
            rows={3}
            value={kit.address}
            onChange={(v) => set("address", v)}
            required
            hint="Required by law in every marketing email (CAN-SPAM in the US). A PO box or registered office is fine. Nothing sends until this is filled in."
          />
          <TextArea id="bk-note" label="Why they're getting it" rows={2} value={kit.footerNote} onChange={(v) => set("footerNote", v)} hint="One line in the footer, like how they signed up." />
        </fieldset>

        {canEdit && (
          <div className={s.saveBar}>
            {notice && (
              <p className={`notice ${notice.ok ? "notice-ok" : "notice-error"}`} role={notice.ok ? "status" : "alert"} data-testid="brand-notice">
                {notice.text}
              </p>
            )}
            <div className={s.saveRow}>
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving || (!dirty && storage === "server")} data-testid="save-brand">
                {saving ? "Saving" : "Save brand kit"}
              </button>
              <span className={s.saveNote}>{dirty ? "You have changes that aren't saved." : "Everything's saved."}</span>
            </div>
          </div>
        )}
      </div>

      <div className={s.previewCol} id="preview">
        <div className={s.previewHead}>
          <strong>Preview</strong>
          <DeviceSwitch device={device} onChange={setDevice} />
        </div>
        <div className={s.previewScroll} data-email-scroll>
          <EmailFrame html={html} device={device} title="Brand kit preview" testId="brand-frame" />
        </div>
      </div>
    </div>
  );
}

// ---- Small fields -------------------------------------------------------------------------

export function TextField({ id, label, value, onChange, hint, optional, type = "text", placeholder, maxLength }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; optional?: boolean; type?: string; placeholder?: string; maxLength?: number }) {
  return (
    <div className={s.field}>
      <label htmlFor={id} className={s.fieldLabel}>
        {label}
        {optional && <em>Optional</em>}
      </label>
      <input id={id} type={type} className="input" value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint && (
        <span id={`${id}-hint`} className={s.hint}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function TextArea({ id, label, value, onChange, hint, rows = 3, required, optional, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; rows?: number; required?: boolean; optional?: boolean; placeholder?: string }) {
  return (
    <div className={s.field}>
      <label htmlFor={id} className={s.fieldLabel}>
        {label}
        {required && <em className={s.required}>{value.trim() ? "Required" : "Required, not filled in"}</em>}
        {optional && <em>Optional</em>}
      </label>
      <textarea id={id} className={`input ${s.textarea}`} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint && (
        <span id={`${id}-hint`} className={s.hint}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function Choice({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className={s.field} role="radiogroup" aria-label={label}>
      <span className={s.fieldLabel}>{label}</span>
      <div className={s.choices}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={s.choice} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FontField({ id, label, value, onChange }: { id: string; label: string; value: EmailFont; onChange: (v: EmailFont) => void }) {
  return (
    <div className={s.field}>
      <label htmlFor={id} className={s.fieldLabel}>
        {label}
      </label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as EmailFont)} style={{ fontFamily: EMAIL_FONTS[value].stack }}>
        {(Object.keys(EMAIL_FONTS) as EmailFont[]).map((f) => (
          <option key={f} value={f} style={{ fontFamily: EMAIL_FONTS[f].stack }}>
            {EMAIL_FONTS[f].label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DeviceSwitch({ device, onChange }: { device: EmailDevice; onChange: (d: EmailDevice) => void }) {
  return (
    <div className={s.devices} role="radiogroup" aria-label="Preview size">
      <button type="button" role="radio" aria-checked={device === "desktop"} aria-label="Desktop" onClick={() => onChange("desktop")} data-testid="device-desktop">
        <Monitor aria-hidden="true" />
      </button>
      <button type="button" role="radio" aria-checked={device === "phone"} aria-label="Phone" onClick={() => onChange("phone")} data-testid="device-phone">
        <Smartphone aria-hidden="true" />
      </button>
    </div>
  );
}
