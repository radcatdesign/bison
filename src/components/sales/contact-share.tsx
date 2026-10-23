"use client";

// Share this contact's page at a link that expires, and turn links off.
import { Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { revokeShareAction, shareContactAction } from "@/app/(portal)/sales/actions";
import m from "@/components/marketing/marketing.module.css";
import s from "./sales.module.css";

type Share = { id: string; url: string; expiresAt: string };

export function ShareContact({ contactId, shares, canShare }: { contactId: string; shares: Share[]; canShare: boolean }) {
  const [days, setDays] = useState(7);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const d = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return (
    <div className={s.stack} style={{ gap: 10 }} data-testid="contact-share">
      <p className={m.hint} style={{ margin: 0 }}>
        A read-only page of this person, their orders, estimates and carts, for someone outside your team. It never shows team notes.
      </p>
      {canShare && (
        <div className={s.copyRow}>
          <select className="select" aria-label="How long the link works" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>For 1 day</option>
            <option value={7}>For 7 days</option>
            <option value={30}>For 30 days</option>
          </select>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await shareContactAction(contactId, days);
                setNotice({ ok: r.ok, text: r.message });
                if (r.ok && r.url) setMade(r.url);
              })
            }
            data-testid="share-make"
          >
            Make a link
          </button>
        </div>
      )}
      {made && (
        <div className={s.copyRow}>
          <input className="input mono" readOnly value={made} aria-label="Share link" data-testid="share-url" />
          <button type="button" className={m.iconButton} aria-label="Copy the link" onClick={() => void navigator.clipboard?.writeText(made)}>
            <Copy aria-hidden="true" />
          </button>
        </div>
      )}
      {notice && (
        <p className={`notice ${notice.ok ? "notice-ok" : "notice-error"}`} role={notice.ok ? "status" : "alert"} data-testid="share-notice">
          {notice.text}
        </p>
      )}
      {shares.length > 0 && (
        <ul className={s.lines}>
          {shares.map((sh) => (
            <li key={sh.id}>
              <div>
                Link until {d.format(new Date(sh.expiresAt))}
                <br />
                <span>{sh.url.slice(0, 48)}…</span>
              </div>
              {canShare && (
                <button
                  type="button"
                  className={`${m.linkButton} ${m.danger}`}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await revokeShareAction(sh.id);
                      setNotice({ ok: r.ok, text: r.message });
                    })
                  }
                  data-testid="share-revoke"
                >
                  Turn off
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
