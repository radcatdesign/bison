"use client";

// Search pack: the business details search engines and AI assistants read,
// and copy buttons for the files and snippets that go on the company's own site.
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { saveSearchAction } from "@/app/(portal)/marketing/actions";
import { BUSINESS_TYPES, type BusinessType, type SearchSettings, searchSettingsSchema } from "@/lib/marketing/settings";
import { useIsClient } from "@/lib/use-is-client";
import { useDemoMarketing } from "./demo-setup";
import { writeDemo } from "./demo-store";
import s from "./marketing.module.css";

type Props = { initial: SearchSettings; storage: "server" | "browser"; tenantId: string; canEdit: boolean };

export function SearchBusinessScreen(props: Props) {
  const demo = useDemoMarketing(props.tenantId);
  const client = useIsClient();
  const initial = props.storage === "browser" ? (demo.search ?? props.initial) : props.initial;
  return <BusinessForm key={props.storage === "browser" && client ? "b" : "s"} {...props} initial={initial} />;
}

function BusinessForm({ initial, storage, tenantId, canEdit }: Props) {
  const [v, setV] = useState<SearchSettings>(initial);
  const [offering, setOffering] = useState("");
  const [profile, setProfile] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof SearchSettings>(k: K, value: SearchSettings[K]) => setV((x) => ({ ...x, [k]: value }));

  const save = () =>
    start(async () => {
      const parsed = searchSettingsSchema.safeParse(v);
      if (!parsed.success) return setResult({ ok: false, message: parsed.error.issues[0]?.message ?? "Check the details." });
      if (storage === "browser") {
        writeDemo(tenantId, (d) => ({ ...d, search: parsed.data }));
        return setResult({ ok: true, message: "Saved in this browser." });
      }
      setResult(await saveSearchAction(parsed.data));
    });

  return (
    <fieldset className={s.group} id="business" disabled={!canEdit} data-testid="search-business">
      <legend>Your business, for search and AI</legend>
      <div className={s.field}>
        <label htmlFor="search-description" className={s.fieldLabel}>
          What you do, in a paragraph
        </label>
        <textarea id="search-description" className={`input ${s.textarea}`} rows={4} maxLength={600} value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="We build and resurface pools in Central Oregon, known for glow-in-the-dark finishes..." />
        <span className={s.hint}>Plain and specific: what you do, who for, and where. AI assistants often quote this when someone asks about businesses like yours.</span>
      </div>
      <div className={s.field}>
        <span className={s.fieldLabel}>What you offer</span>
        {v.offerings.length > 0 && (
          <ul className={s.miniList}>
            {v.offerings.map((o, i) => (
              <li key={`${o}-${i}`}>
                <span>{o}</span>
                {canEdit && (
                  <button type="button" className={`${s.iconButton} ${s.danger}`} aria-label={`Remove ${o}`} onClick={() => set("offerings", v.offerings.filter((_, j) => j !== i))}>
                    <Trash2 aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && v.offerings.length < 12 && (
          <div className={s.inline}>
            <input className="input" value={offering} onChange={(e) => setOffering(e.target.value)} maxLength={80} placeholder="Pool resurfacing" aria-label="Something you offer" style={{ flex: 1 }} />
            <button
              type="button"
              className="btn"
              disabled={!offering.trim()}
              onClick={() => {
                set("offerings", [...v.offerings, offering.trim()]);
                setOffering("");
              }}
            >
              <Plus aria-hidden="true" />
              Add
            </button>
          </div>
        )}
      </div>
      <div className={s.twoUp}>
        <div className={s.field}>
          <label htmlFor="search-type" className={s.fieldLabel}>
            Kind of business
          </label>
          <select id="search-type" className="select" value={v.businessType} onChange={(e) => set("businessType", e.target.value as BusinessType)}>
            {(Object.keys(BUSINESS_TYPES) as BusinessType[]).map((t) => (
              <option key={t} value={t}>
                {BUSINESS_TYPES[t]}
              </option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label htmlFor="search-areas" className={s.fieldLabel}>
            Areas you serve
          </label>
          <input id="search-areas" className="input" value={v.areas} maxLength={200} onChange={(e) => set("areas", e.target.value)} placeholder="Bend, Redmond and Sisters, Oregon" />
        </div>
      </div>
      <div className={s.twoUp}>
        <div className={s.field}>
          <label htmlFor="search-phone" className={s.fieldLabel}>
            Phone
          </label>
          <input id="search-phone" className="input" value={v.phone} maxLength={30} onChange={(e) => set("phone", e.target.value)} inputMode="tel" />
        </div>
        <div className={s.field}>
          <label htmlFor="search-email" className={s.fieldLabel}>
            Email
          </label>
          <input id="search-email" className="input" type="email" value={v.email} maxLength={254} onChange={(e) => set("email", e.target.value)} />
        </div>
      </div>
      <div className={s.field}>
        <label htmlFor="search-hours" className={s.fieldLabel}>
          Hours
        </label>
        <input id="search-hours" className="input" value={v.hours} maxLength={200} onChange={(e) => set("hours", e.target.value)} placeholder="Mon to Fri 8 to 5, Sat 9 to 1" />
      </div>
      <div className={s.field}>
        <span className={s.fieldLabel}>Your profiles elsewhere</span>
        {v.profiles.length > 0 && (
          <ul className={s.miniList}>
            {v.profiles.map((p, i) => (
              <li key={p}>
                <span className="mono" style={{ overflowWrap: "anywhere" }}>
                  {p}
                </span>
                {canEdit && (
                  <button type="button" className={`${s.iconButton} ${s.danger}`} aria-label={`Remove ${p}`} onClick={() => set("profiles", v.profiles.filter((_, j) => j !== i))}>
                    <Trash2 aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && v.profiles.length < 6 && (
          <div className={s.inline}>
            <input className="input" value={profile} onChange={(e) => setProfile(e.target.value.trim())} placeholder="https://www.instagram.com/yourcompany" aria-label="Profile address" style={{ flex: 1 }} />
            <button
              type="button"
              className="btn"
              disabled={!/^https:\/\/\S+$/.test(profile)}
              onClick={() => {
                set("profiles", [...v.profiles, profile]);
                setProfile("");
              }}
            >
              <Plus aria-hidden="true" />
              Add
            </button>
          </div>
        )}
        <span className={s.hint}>Google Business Profile, Instagram, Facebook, Yelp, Houzz. Search engines use these to tie your profiles to you.</span>
      </div>
      <label className={s.checkRow}>
        <input type="checkbox" checked={v.allowAi} onChange={(e) => set("allowAi", e.target.checked)} />
        <span>
          Let AI assistants read your pages
          <br />
          <span className={s.hint}>On, ChatGPT, Claude, Perplexity and others can find and recommend you. Off, they&apos;re asked to skip your landing pages (most respect it).</span>
        </span>
      </label>
      {canEdit && (
        <div className={s.saveRow}>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={save} data-testid="save-search">
            {pending ? "Saving" : "Save details"}
          </button>
          {result && (
            <span className={result.ok ? s.saveNote : undefined} role={result.ok ? "status" : "alert"} data-testid="search-message" style={result.ok ? undefined : { color: "var(--bo-bad)", fontSize: "var(--bo-text-sm)" }}>
              {result.message}
            </span>
          )}
        </div>
      )}
    </fieldset>
  );
}

export function CopyBlock({ label, value, testId }: { label: string; value: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={s.field} data-testid={testId}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span className={s.fieldLabel}>{label}</span>
        <button
          type="button"
          className={`btn ${s.copy}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              /* blocked clipboard: the text is on screen to select */
            }
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre style={{ margin: 0, maxHeight: 220, overflow: "auto", padding: 12, borderRadius: "var(--bo-r-control)", background: "var(--bo-sunken)", fontFamily: "var(--bo-font-mono)", fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{value}</pre>
    </div>
  );
}
