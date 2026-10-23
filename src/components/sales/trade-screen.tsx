"use client";

// Sales, Trade accounts: applications waiting for a decision, the accounts
// with their tier and 12-month spend, one account's details in a side panel,
// and the program's own settings (applications, intro, tiers).
import { Copy, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { decideTradeAction, saveSalesSettingsAction, saveTradeAccountAction, sendTradeLinkAction } from "@/app/(portal)/sales/actions";
import m from "@/components/marketing/marketing.module.css";
import { Card, Help } from "@/components/ui";
import { formatMoney, moneyInput, parseMoney } from "@/lib/sales/money";
import { nextTier, type Tier, type TradeSettings, tierFor } from "@/lib/sales/settings";
import type { TradeRow } from "@/lib/sales/types";
import { pillClass, TRADE_STATUS } from "./labels";
import x from "./screens.module.css";
import s from "./sales.module.css";
import { DEMO_MESSAGE } from "@/config/demo-text";

/** Same words as the server's demo answer. lib/demo is server-only, so it can't be imported here. */

type Props = {
  rows: TradeRow[];
  settings: TradeSettings;
  currency: string;
  timeZone: string;
  canEdit: boolean;
  canSend: boolean;
  demo: boolean;
  sample: boolean;
  publicUrl: string;
};

type Notice = { ok: boolean; text: string } | null;

const SAMPLE_NOTE = "Sample data is on, so these accounts are made up and can't be changed. Turn it off in Settings to work with your own.";

function NoticeLine({ value, testId }: { value: Notice; testId: string }) {
  if (!value) return null;
  return (
    <p className={`notice ${value.ok ? "notice-ok" : "notice-error"}`} role={value.ok ? "status" : "alert"} data-testid={testId}>
      {value.text}
    </p>
  );
}

const DETAIL_LABELS: Record<string, string> = { type: "Business type", resale: "Resale number", volume: "Expected volume", message: "Message" };

function Details({ details }: { details: Record<string, string> }) {
  const list = Object.entries(details).filter(([, v]) => v && String(v).trim());
  if (!list.length) return null;
  return (
    <dl className={m.facts}>
      {list.map(([k, v]) => (
        <div key={k} className={x.contents}>
          <dt>{DETAIL_LABELS[k] ?? k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TradeScreen(p: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();
  const fmtDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: p.timeZone });
  const money = (n: number) => formatMoney(n, p.currency, { trim: true });
  const applied = p.rows.filter((r) => r.status === "applied");
  const accounts = p.rows.filter((r) => r.status !== "applied").sort((a, b) => (a.status === "approved" ? 0 : 1) - (b.status === "approved" ? 0 : 1) || b.spendCents - a.spendCents);
  const open = p.rows.find((r) => r.id === openId) ?? null;
  const locked = p.demo ? DEMO_MESSAGE : p.sample ? SAMPLE_NOTE : null;

  const decide = (id: string, status: "approved" | "declined" | "paused") =>
    start(async () => {
      if (locked) return setNotice({ ok: false, text: locked });
      const r = await decideTradeAction(id, status);
      setNotice({ ok: r.ok, text: r.message });
    });

  return (
    <div className={s.stack}>
      {p.sample && !p.demo && <p className="notice">{SAMPLE_NOTE} The program settings at the bottom are your own, and they save.</p>}
      <NoticeLine value={notice} testId="trade-notice" />

      {applied.length > 0 && (
        <Card title="Waiting for you" note="Approve a buyer and they get an email with a link to sign in. Decline and they keep seeing regular prices." testId="trade-applications">
          <ul className={x.applications}>
            {applied.map((r) => (
              <li key={r.id} className={x.application} data-testid="trade-application" data-company={r.company}>
                <div className={x.applicationHead}>
                  <strong>{r.company}</strong>
                  <span>Applied {fmtDate.format(r.appliedAt)}</span>
                </div>
                <dl className={m.facts}>
                  <dt>Contact</dt>
                  <dd>{r.contactName || "No name given"}</dd>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${r.email}`} className="link">
                      {r.email}
                    </a>
                  </dd>
                  {r.phone && (
                    <>
                      <dt>Phone</dt>
                      <dd>{r.phone}</dd>
                    </>
                  )}
                  {r.website && (
                    <>
                      <dt>Website</dt>
                      <dd>
                        <a href={/^https?:\/\//.test(r.website) ? r.website : `https://${r.website}`} className="link" target="_blank" rel="noopener noreferrer">
                          {r.website.replace(/^https?:\/\//, "")}
                        </a>
                      </dd>
                    </>
                  )}
                </dl>
                <Details details={r.details} />
                {p.canEdit && (
                  <div className={x.actions}>
                    <button type="button" className="btn btn-primary" disabled={pending} onClick={() => decide(r.id, "approved")} data-testid="trade-approve">
                      Approve
                    </button>
                    <button type="button" className="btn" disabled={pending} onClick={() => decide(r.id, "declined")} data-testid="trade-decline">
                      Decline
                    </button>
                    <button type="button" className={m.linkButton} onClick={() => setOpenId(r.id)}>
                      Add a note first
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Accounts" flush testId="trade-accounts">
        {accounts.length === 0 ? (
          <div className={m.empty}>
            <strong>No trade accounts yet.</strong>
            <span>Share your application page with builders, designers and resellers. Applications land here for you to approve.</span>
          </div>
        ) : (
          <div className={x.scrollX}>
            <table className={m.table}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th className={m.hideSm}>Tier</th>
                  <th>
                    <span className={x.thHelp}>
                      12-month spend
                      <Help title="12-month spend">
                        <p>What the account paid for products in the last 12 months, from the shop and from paid estimates. It&apos;s after discounts and refunds, and before shipping and tax. Their tier follows it, unless you set one by hand.</p>
                      </Help>
                    </span>
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((r) => {
                  const tier = tierFor(p.settings.tiers, r.spendCents, r.tierOverride);
                  return (
                    <tr key={r.id} data-testid="trade-row" data-company={r.company}>
                      <td>
                        <button type="button" className={x.rowButton} onClick={() => setOpenId(r.id)} aria-label={`Open ${r.company}`}>
                          <span className={m.cellMain}>
                            <strong>{r.company}</strong>
                            <span>{[r.contactName, r.email].filter(Boolean).join(" · ")}</span>
                          </span>
                        </button>
                      </td>
                      <td className={m.hideSm}>
                        {r.status === "approved" ? (
                          <>
                            {tier.name}, {tier.percentOff}% off{r.tierOverride ? <span className="muted"> (set by hand)</span> : null}
                          </>
                        ) : (
                          <span className="muted">None</span>
                        )}
                      </td>
                      <td className={s.money}>
                        {money(r.spendCents)}
                        <span className="muted">
                          {" "}
                          · {r.orderCount} {r.orderCount === 1 ? "order" : "orders"}
                        </span>
                      </td>
                      <td>
                        <span className={pillClass(TRADE_STATUS[r.status].tone)}>{TRADE_STATUS[r.status].label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className={m.pager}>
          <span>
            <span className="num">{p.rows.filter((r) => r.status === "approved").length.toLocaleString("en-US")}</span> approved · <span className="num">{applied.length.toLocaleString("en-US")}</span> waiting
          </span>
        </div>
      </Card>

      <ProgramSettings {...p} />

      {open && <AccountPanel key={open.id} row={open} {...p} locked={locked} onClose={() => setOpenId(null)} fmtDate={fmtDate} />}
    </div>
  );
}

// ---- One account ---------------------------------------------------------------------------------

function AccountPanel({ row, settings, currency, canEdit, canSend, locked, onClose, fmtDate }: Props & { row: TradeRow; locked: string | null; onClose: () => void; fmtDate: Intl.DateTimeFormat }) {
  const [tierKey, setTierKey] = useState(row.tierOverride);
  const [note, setNote] = useState(row.note);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, start] = useTransition();
  const busy = pending;
  const money = (n: number) => formatMoney(n, currency, { trim: true });
  const byVolume = tierFor(settings.tiers, row.spendCents);
  const current = tierFor(settings.tiers, row.spendCents, row.tierOverride);
  const next = row.tierOverride ? null : nextTier(settings.tiers, row.spendCents);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () =>
    start(async () => {
      if (locked) return setNotice({ ok: false, text: locked });
      const r = await saveTradeAccountAction(row.id, { tierOverride: tierKey, note });
      setNotice({ ok: r.ok, text: r.message });
    });

  const decide = (status: "approved" | "declined" | "paused") =>
    start(async () => {
      if (locked) return setNotice({ ok: false, text: locked });
      const r = await decideTradeAction(row.id, status);
      setNotice({ ok: r.ok, text: r.message });
    });

  const sendLink = () =>
    start(async () => {
      if (locked) return setNotice({ ok: false, text: locked });
      const r = await sendTradeLinkAction(row.id);
      setNotice({ ok: r.ok, text: r.message });
    });

  return (
    <>
      <button type="button" className={x.scrim} aria-label="Close the account" tabIndex={-1} onClick={onClose} />
      <aside className={m.panel} aria-label={row.company} data-testid="trade-panel">
        <div className={m.panelHead}>
          <div>
            <strong>{row.company}</strong>
            <span>{row.email}</span>
          </div>
          <span className={pillClass(TRADE_STATUS[row.status].tone)}>{TRADE_STATUS[row.status].label}</span>
          <button type="button" className={m.iconButton} onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={m.panelBody}>
          <section className={m.panelSection}>
            <h3>Buying</h3>
            <dl className={m.facts}>
              <dt>Tier now</dt>
              <dd data-testid="trade-panel-tier">
                {row.status === "approved" ? `${current.name}, ${current.percentOff}% off` : "None until approved"}
                {row.tierOverride ? " (set by hand)" : ""}
              </dd>
              <dt>
                <span className={x.thHelp}>
                  12-month spend
                  <Help title="12-month spend" idSuffix="-panel">
                    <p>Products paid for in the last 12 months, from the shop and from paid estimates, after discounts and refunds, before shipping and tax.</p>
                  </Help>
                </span>
              </dt>
              <dd className={s.money}>
                <span className={x.spend}>
                  {money(row.spendCents)} over {row.orderCount} {row.orderCount === 1 ? "order" : "orders"}
                  {next && row.status === "approved" && (
                    <small>
                      {money(next.moreCents)} more reaches {next.tier.name} ({next.tier.percentOff}% off)
                    </small>
                  )}
                </span>
              </dd>
              <dt>Applied</dt>
              <dd>{fmtDate.format(row.appliedAt)}</dd>
              {row.decidedAt && (
                <>
                  <dt>Decided</dt>
                  <dd>{fmtDate.format(row.decidedAt)}</dd>
                </>
              )}
            </dl>
          </section>

          <section className={m.panelSection}>
            <h3>Contact</h3>
            <dl className={m.facts}>
              <dt>Name</dt>
              <dd>{row.contactName || "No name given"}</dd>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${row.email}`} className="link">
                  {row.email}
                </a>
              </dd>
              {row.phone && (
                <>
                  <dt>Phone</dt>
                  <dd>{row.phone}</dd>
                </>
              )}
              {row.website && (
                <>
                  <dt>Website</dt>
                  <dd>{row.website.replace(/^https?:\/\//, "")}</dd>
                </>
              )}
            </dl>
          </section>

          {Object.values(row.details).some((v) => v) && (
            <section className={m.panelSection}>
              <h3>Their application</h3>
              <Details details={row.details} />
            </section>
          )}

          <section className={m.panelSection}>
            <h3>Your settings for them</h3>
            <div className={m.field}>
              <label htmlFor="ta-tier" className={m.fieldLabel}>
                Tier
              </label>
              <select id="ta-tier" className="select" value={tierKey} disabled={!canEdit || busy} onChange={(e) => setTierKey(e.target.value)} data-testid="trade-tier">
                <option value="">
                  By 12-month spend ({byVolume.name} now)
                </option>
                {settings.tiers.map((t) => (
                  <option key={t.key} value={t.key}>
                    Always {t.name}, {t.percentOff}% off
                  </option>
                ))}
              </select>
              <span className={m.hint}>Set a tier by hand for a buyer you&apos;ve agreed terms with. It stays until you change it back.</span>
            </div>
            <div className={m.field}>
              <label htmlFor="ta-note" className={m.fieldLabel}>
                Team note <em>Optional</em>
              </label>
              <textarea id="ta-note" className={`input ${m.textarea}`} rows={3} maxLength={2000} value={note} disabled={!canEdit || busy} onChange={(e) => setNote(e.target.value)} data-testid="trade-note" />
              <span className={m.hint}>Only your team sees this.</span>
            </div>
            {canEdit && (
              <div className={x.actions}>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={save} data-testid="trade-save">
                  {pending ? "Saving" : "Save"}
                </button>
              </div>
            )}
          </section>

          <NoticeLine value={notice} testId="trade-panel-notice" />

          {canEdit && (
            <section className={m.panelSection}>
              <h3>Account</h3>
              <div className={x.actions}>
                {row.status === "approved" && canSend && (
                  <button type="button" className="btn" disabled={busy} onClick={sendLink} data-testid="trade-send-link">
                    Email a sign-in link
                  </button>
                )}
                {row.status !== "approved" && (
                  <button type="button" className="btn" disabled={busy} onClick={() => decide("approved")} data-testid="trade-panel-approve">
                    {row.status === "applied" ? "Approve" : "Approve again"}
                  </button>
                )}
                {row.status === "approved" && (
                  <button type="button" className="btn" disabled={busy} onClick={() => decide("paused")} data-testid="trade-pause">
                    Pause
                  </button>
                )}
                {(row.status === "applied" || row.status === "paused") && (
                  <button type="button" className={`btn ${m.danger}`} disabled={busy} onClick={() => decide("declined")} data-testid="trade-panel-decline">
                    Decline
                  </button>
                )}
              </div>
              <p className={m.hint}>Pausing or declining signs them out everywhere, and they see regular prices until you approve them again.</p>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

// ---- The program -----------------------------------------------------------------------------------

type TierDraft = { key: string; name: string; spend: string; percent: string };

const toDraft = (t: Tier, currency: string): TierDraft => ({ key: t.key, name: t.name, spend: moneyInput(t.minSpendCents, currency), percent: String(t.percentOff) });

function keyFor(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 34) || "tier";
  let k = base;
  for (let i = 2; taken.has(k); i++) k = `${base}-${i}`;
  return k;
}

function ProgramSettings({ settings, currency, canEdit, demo, publicUrl }: Props) {
  const [open, setOpen] = useState(settings.open);
  const [intro, setIntro] = useState(settings.intro);
  const [tiers, setTiers] = useState<TierDraft[]>(() => [...settings.tiers].sort((a, b) => a.minSpendCents - b.minSpendCents).map((t) => toDraft(t, currency)));
  const [notice, setNotice] = useState<Notice>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const setTier = (i: number, patch: Partial<TierDraft>) => setTiers((list) => list.map((t, n) => (n === i ? { ...t, ...patch } : t)));

  const save = () =>
    start(async () => {
      if (demo) return setNotice({ ok: false, text: DEMO_MESSAGE });
      const taken = new Set(tiers.map((t) => t.key).filter(Boolean));
      const out: Tier[] = [];
      for (const t of tiers) {
        const minSpendCents = t.spend.trim() === "" ? 0 : parseMoney(t.spend, currency);
        const percentOff = Number(t.percent.replace(/[%\s]/g, ""));
        if (minSpendCents === null) return setNotice({ ok: false, text: `Enter the spend for ${t.name || "each tier"} as an amount, like 5000.` });
        if (!Number.isFinite(percentOff) || percentOff < 0 || percentOff > 90) return setNotice({ ok: false, text: `The percent off for ${t.name || "each tier"} has to be between 0 and 90.` });
        let key = t.key;
        if (!key) {
          key = keyFor(t.name, taken);
          taken.add(key);
        }
        out.push({ key, name: t.name.trim(), minSpendCents, percentOff });
      }
      const r = await saveSalesSettingsAction("trade", { open, intro, tiers: out });
      setNotice({ ok: r.ok, text: r.ok ? "Saved. Prices follow the new tiers from the next page a buyer opens." : r.message });
      if (r.ok) setTiers(out.sort((a, b) => a.minSpendCents - b.minSpendCents).map((t) => toDraft(t, currency)));
    });

  return (
    <Card title="Trade program" id="tiers" note="Who can apply, what the application page says, and the tiers that set each buyer's price." testId="trade-settings">
      <form
        className={s.stack}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className={m.field}>
          <span className={m.fieldLabel}>Your application and sign-in page</span>
          <div className={s.copyRow}>
            <input className="input mono" readOnly value={publicUrl} aria-label="Trade page address" data-testid="trade-public-url" />
            <button
              type="button"
              className="btn"
              onClick={() => {
                navigator.clipboard?.writeText(publicUrl).then(() => setCopied(true), () => setCopied(false));
              }}
            >
              <Copy aria-hidden="true" />
              {copied ? "Copied" : "Copy"}
            </button>
            <a href={publicUrl} className="btn" target="_blank" rel="noopener">
              Open
            </a>
          </div>
          <span className={m.hint}>Buyers apply here, and approved buyers sign in here with an emailed link. The shop also links to it.</span>
        </div>

        <fieldset className={x.plainFieldset} disabled={!canEdit || pending}>
          <label className={m.checkRow}>
            <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} data-testid="trade-open" />
            <span>
              Take new applications
              <span className={`${m.hint} ${x.block}`}>Turn this off and approved buyers can still sign in.</span>
            </span>
          </label>

          <div className={m.field}>
            <label htmlFor="tp-intro" className={m.fieldLabel}>
              A few lines at the top of the application <em>Optional</em>
            </label>
            <textarea id="tp-intro" className={`input ${m.textarea}`} rows={3} maxLength={600} value={intro} placeholder="For pool builders and dealers. Approved accounts get trade prices across the shop, and better prices as they buy more." onChange={(e) => setIntro(e.target.value)} data-testid="trade-intro" />
          </div>

          <div className={m.field}>
            <span className={m.fieldLabel}>Tiers</span>
            <span className={m.hint}>Each approved account gets the highest tier its 12-month spend reaches, and the lowest tier is where everyone starts. Spend counts products after discounts and refunds, not shipping or tax.</span>
            <div className={x.tierList} data-testid="trade-tiers">
              <div className={x.tierHead} aria-hidden="true">
                <span>Name</span>
                <span>From 12-month spend</span>
                <span>Percent off</span>
                <span />
              </div>
              {tiers.map((t, i) => (
                <div key={t.key || `new-${i}`} className={x.tierRow} data-testid="trade-tier-row">
                  <input className="input" aria-label="Tier name" maxLength={40} value={t.name} placeholder="Pro" onChange={(e) => setTier(i, { name: e.target.value })} data-testid="tier-name" />
                  <input className="input num" inputMode="decimal" aria-label={`Spend that reaches ${t.name || "this tier"}`} value={t.spend} placeholder="0" onChange={(e) => setTier(i, { spend: e.target.value })} data-testid="tier-spend" />
                  <input className="input num" inputMode="decimal" aria-label={`Percent off for ${t.name || "this tier"}`} value={t.percent} placeholder="10" onChange={(e) => setTier(i, { percent: e.target.value })} data-testid="tier-percent" />
                  <button type="button" className={`${m.iconButton} ${m.danger}`} aria-label={`Remove ${t.name || "tier"}`} disabled={tiers.length <= 1} onClick={() => setTiers((list) => list.filter((_, n) => n !== i))}>
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            {tiers.length < 8 && (
              <button type="button" className={m.linkButton} onClick={() => setTiers((list) => [...list, { key: "", name: "", spend: "", percent: "" }])} data-testid="add-tier">
                <Plus aria-hidden="true" />
                Add a tier
              </button>
            )}
          </div>
        </fieldset>

        <NoticeLine value={notice} testId="trade-settings-notice" />
        {canEdit && (
          <div className={x.actions}>
            <button type="submit" className="btn btn-primary" disabled={pending} data-testid="trade-settings-save">
              {pending ? "Saving" : "Save the program"}
            </button>
          </div>
        )}
      </form>
    </Card>
  );
}
