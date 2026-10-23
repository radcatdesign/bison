"use client";

// Welcome offer: what each new subscriber's one-time code is worth, a preview
// of how it shows in the welcome email, and the codes people have.
import { useMemo, useState, useTransition } from "react";
import { markCodeAction, saveOfferAction } from "@/app/(portal)/marketing/actions";
import { renderEmail } from "@/lib/email/render";
import { type BrandKit, EMAIL_DOC_VERSION } from "@/lib/email/schema";
import { type OfferSettings, offerSettingsSchema, offerTerms } from "@/lib/marketing/settings";
import { useIsClient } from "@/lib/use-is-client";
import { useDemoMarketing } from "./demo-setup";
import { writeDemo } from "./demo-store";
import { EmailFrame } from "./email-frame";
import s from "./marketing.module.css";

type Props = { initial: OfferSettings; storage: "server" | "browser"; tenantId: string; canEdit: boolean; brand: BrandKit; baseUrl: string; timeZone: string; inEmail: boolean; now: string };

export function OfferSettingsScreen(props: Props) {
  const demo = useDemoMarketing(props.tenantId);
  const client = useIsClient();
  const initial = props.storage === "browser" ? (demo.offer ?? props.initial) : props.initial;
  const inEmail = props.storage === "browser" ? Boolean(demo.series?.some((x) => x.steps.some((st) => st.doc.sections.some((y) => y.type === "offer")))) || !demo.series : props.inEmail;
  return <OfferForm key={props.storage === "browser" && client ? "b" : "s"} {...props} initial={initial} inEmail={inEmail} />;
}

function OfferForm({ initial, storage, tenantId, canEdit, brand, baseUrl, timeZone, inEmail, now }: Props) {
  const [o, setO] = useState<OfferSettings>(initial);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof OfferSettings>(k: K, v: OfferSettings[K]) => setO((x) => ({ ...x, [k]: v }));
  const parsed = offerSettingsSchema.safeParse(o);
  const sample = useMemo(() => new Date(Date.parse(now) + (o.days || 0) * 86_400_000), [o.days, now]);
  const html = useMemo(
    () =>
      renderEmail({
        doc: { version: EMAIL_DOC_VERSION, signOff: false, fallbackName: "there", sections: [{ id: "gift", type: "offer", heading: "A welcome gift", body: "Here's a code for your first order with us." }] },
        brand,
        subject: "",
        baseUrl,
        offer: { code: `${o.prefix || "WELCOME"}-7KQ2FA`, terms: offerTerms({ kind: o.kind, value: o.value || 0, fine: o.fine }, o.days ? sample : null, timeZone) },
      }).html,
    [o, brand, baseUrl, sample, timeZone],
  );

  const save = () =>
    start(async () => {
      if (!parsed.success) return setResult({ ok: false, message: parsed.error.issues[0]?.message ?? "Check the offer." });
      if (storage === "browser") {
        writeDemo(tenantId, (d) => ({ ...d, offer: parsed.data }));
        return setResult({ ok: true, message: "Saved in this browser." });
      }
      setResult(await saveOfferAction(parsed.data));
    });

  return (
    <div className={s.split} data-testid="offer-settings">
      <div className={s.formCol}>
        <fieldset className={s.group} disabled={!canEdit}>
          <legend>The offer</legend>
          <label className={s.checkRow}>
            <input type="checkbox" className="switch" checked={o.on} onChange={(e) => set("on", e.target.checked)} data-testid="offer-on" />
            <span>
              <strong>Give each new subscriber a code</strong>
              <br />
              <span className={s.hint}>People already on your list don&apos;t get one. Each person gets one code, once, even if they sign up again.</span>
            </span>
          </label>
          <div className={s.twoUp}>
            <div className={s.field}>
              <label htmlFor="offer-kind" className={s.fieldLabel}>
                Discount
              </label>
              <select id="offer-kind" className="select" value={o.kind} onChange={(e) => set("kind", e.target.value as OfferSettings["kind"])}>
                <option value="percent">Percent off</option>
                <option value="amount">Dollars off</option>
              </select>
            </div>
            <div className={s.field}>
              <label htmlFor="offer-value" className={s.fieldLabel}>
                {o.kind === "percent" ? "Percent" : "Dollars"}
              </label>
              <input id="offer-value" type="number" min={1} max={o.kind === "percent" ? 90 : 10000} step={o.kind === "percent" ? 1 : 0.01} className="input" value={o.value} onChange={(e) => set("value", Number(e.target.value))} />
            </div>
          </div>
          <div className={s.twoUp}>
            <div className={s.field}>
              <label htmlFor="offer-days" className={s.fieldLabel}>
                Each code works for
              </label>
              <select id="offer-days" className="select" value={o.days} onChange={(e) => set("days", Number(e.target.value))}>
                {[7, 14, 30, 60, 90, 365, 0].map((d) => (
                  <option key={d} value={d}>
                    {d === 0 ? "No end date" : `${d} days`}
                  </option>
                ))}
              </select>
            </div>
            <div className={s.field}>
              <label htmlFor="offer-prefix" className={s.fieldLabel}>
                Codes start with
              </label>
              <input id="offer-prefix" className="input" value={o.prefix} maxLength={12} onChange={(e) => set("prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            </div>
          </div>
          <div className={s.field}>
            <label htmlFor="offer-fine" className={s.fieldLabel}>
              Fine print <em>Optional</em>
            </label>
            <input id="offer-fine" className="input" value={o.fine} maxLength={200} onChange={(e) => set("fine", e.target.value)} placeholder="Not valid on installation." />
          </div>
          <p className={s.hint}>Codes are for first-time buyers only. Checking that at checkout comes with Sales; until then, look a code up below when someone uses it and mark it used.</p>
        </fieldset>
        {!inEmail && (
          <p className="notice" data-testid="offer-not-in-email">
            None of your emails show the code yet. Open your welcome series and add a &quot;Welcome offer code&quot; section to the first email.
          </p>
        )}
        {canEdit && (
          <div className={s.saveBar}>
            {result && (
              <p className={`notice ${result.ok ? "notice-ok" : "notice-error"}`} role={result.ok ? "status" : "alert"} data-testid="offer-message">
                {result.message}
              </p>
            )}
            <div className={s.saveRow}>
              <button type="button" className="btn btn-primary" disabled={pending} onClick={save} data-testid="save-offer">
                {pending ? "Saving" : "Save offer"}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className={s.previewCol}>
        <div className={s.previewHead}>
          <strong>How it shows in an email</strong>
        </div>
        <div className={s.previewScroll}>
          <EmailFrame html={html} title="Offer preview" testId="offer-frame" />
        </div>
      </div>
    </div>
  );
}

export type CodeView = { id: string; code: string; email: string; worth: string; issued: string; ends: string; usedOn: string | null; note: string; expired: boolean };

export function CodeActions({ code, canEdit }: { code: CodeView; canEdit: boolean }) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!canEdit) return null;
  if (code.usedOn) {
    return (
      <button type="button" className={s.linkButton} disabled={pending} onClick={() => start(async () => setMessage((await markCodeAction(code.id, false, "")).message))}>
        Undo
      </button>
    );
  }
  return open ? (
    <form
      className={s.inline}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await markCodeAction(code.id, true, note);
          setMessage(r.message);
          if (r.ok) setOpen(false);
        });
      }}
    >
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Order number or note" aria-label="Note" maxLength={200} style={{ flex: 1, minWidth: 140 }} />
      <button type="submit" className="btn" disabled={pending}>
        Mark used
      </button>
      {message && <span className={s.hint}>{message}</span>}
    </form>
  ) : (
    <button type="button" className="btn" onClick={() => setOpen(true)} data-testid="mark-used">
      Mark used
    </button>
  );
}
