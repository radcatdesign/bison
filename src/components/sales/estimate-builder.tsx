"use client";

// The estimate builder: who it's for, the lines (from the catalog or typed
// in), discount, shipping, notes and dates, with totals beside it. Drafts and
// open estimates save as you type. Sending, the client's link, the invoice,
// and the history are on the side.
import { Copy, ExternalLink, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createEstimateAction, estimateAction, saveEstimateAction, sendEstimateAction } from "@/app/(portal)/sales/actions";
import { useEditionKey, useSay } from "@/components/edition";
import m from "@/components/marketing/marketing.module.css";
import type { Say } from "@/config/editions";
import { EDITABLE, type EstimateInput, sendProblems } from "@/lib/sales/estimate-input";
import type { BuilderExtras } from "@/lib/sales/estimate-page";
import { formatMoney, moneyInput, parseMoney } from "@/lib/sales/money";
import { type EstimateDiscount, type EstimateLine, estimateTotals } from "@/lib/sales/pricing";
import { tradePrice } from "@/lib/sales/shop-view";
import type { EstimateDetail, EstimateEvent } from "@/lib/sales/types";
import { ESTIMATE_STATUS, pillClass } from "./labels";
import s from "./sales.module.css";

type Props = { estimate: EstimateDetail | null; extras: BuilderExtras; canEdit: boolean; canSend: boolean; locked: string | null; timeZone: string };

const lineId = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function inputOf(e: EstimateDetail | null, x: BuilderExtras): EstimateInput {
  if (!e) {
    return { title: "", client: { name: "", email: "", company: "", phone: "", address: {} }, tradeAccountId: null, items: [], discount: {}, shippingCents: 0, notes: x.terms, internalNote: "", validUntil: new Date(Date.now() + x.validDays * 86_400_000).toISOString().slice(0, 10) };
  }
  return { title: e.title, client: { ...e.client, address: e.client.address ?? {} }, tradeAccountId: e.tradeAccountId, items: e.items.map((i) => ({ ...i, productId: i.productId ?? null, variantId: i.variantId ?? null })), discount: e.discount as EstimateInput["discount"], shippingCents: e.shippingCents, notes: e.notes, internalNote: e.internalNote, validUntil: e.validUntil };
}

const eventLabels = (say: Say): Record<string, string> => ({
  created: "Started",
  edited: "Changed",
  sent: "Sent",
  email_failed: "Email didn't send",
  viewed: say("Opened by the client", "Opened by them"),
  changes_requested: say("Client asked for changes", "They asked for changes"),
  approved: "Approved",
  declined: "Declined",
  invoiced: "Invoice sent",
  invoice_failed: "Invoice didn't go out",
  paid: "Paid",
  void: "Voided",
  reopened: "Reopened",
});

function MoneyField({ cents, currency, onChange, label, testId }: { cents: number; currency: string; onChange: (c: number) => void; label: string; testId?: string }) {
  const [text, setText] = useState(moneyInput(cents, currency));
  const [focused, setFocused] = useState(false);
  return (
    <input
      className="input num"
      inputMode="decimal"
      aria-label={label}
      value={focused ? text : moneyInput(cents, currency)}
      onFocus={() => {
        setText(moneyInput(cents, currency));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        const c = parseMoney(e.target.value || "0", currency);
        if (c !== null) onChange(c);
      }}
      data-testid={testId}
    />
  );
}

export function EstimateBuilder({ estimate, extras, canEdit, canSend, locked, timeZone }: Props) {
  const router = useRouter();
  const say = useSay();
  const EVENT = eventLabels(say);
  const [input, setInput] = useState<EstimateInput>(() => inputOf(estimate, extras));
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "error"; message: string }>({ state: "idle", message: "" });
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [pickerQ, setPickerQ] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [paidNote, setPaidNote] = useState("");
  const [copied, setCopied] = useState(false);
  const dirty = useRef(false);
  const sendRef = useRef<HTMLDialogElement>(null);
  const paidRef = useRef<HTMLDialogElement>(null);
  const pickRef = useRef<HTMLDialogElement>(null);

  const id = estimate?.id ?? null;
  const status = estimate?.status ?? "draft";
  const editable = canEdit && !locked && EDITABLE.has(status);
  const currency = estimate?.currency ?? extras.currency;
  const money = (n: number) => formatMoney(n, currency);
  const totals = estimateTotals(input.items as EstimateLine[], input.discount as EstimateDiscount, input.shippingCents);
  const trade = extras.trade.find((t) => t.id === input.tradeAccountId) ?? null;
  const problems = sendProblems(input, useEditionKey());
  const fmt = useMemo(() => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }), [timeZone]);

  function change(next: EstimateInput) {
    dirty.current = true;
    setInput(next);
  }
  const setClient = (k: keyof EstimateInput["client"], v: string) => change({ ...input, client: { ...input.client, [k]: v } });
  const setAddress = (k: string, v: string) => change({ ...input, client: { ...input.client, address: { ...input.client.address, [k]: v } } });
  const setLine = (i: number, patch: Partial<EstimateLine>) => change({ ...input, items: input.items.map((l, n) => (n === i ? { ...l, ...patch } : l)) });

  // Saves a moment after the last change, for estimates that already exist.
  useEffect(() => {
    if (!id || !editable || !dirty.current) return;
    const t = window.setTimeout(() => {
      setSave({ state: "saving", message: "Saving" });
      void saveEstimateAction(id, input).then((r) => {
        if (r.ok) dirty.current = false;
        setSave(r.ok ? { state: "saved", message: "Saved" } : { state: "error", message: r.message });
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [input, id, editable]);

  function run(fn: () => Promise<{ ok: boolean; message: string; id?: string; url?: string }>, after?: (r: { ok: boolean; message: string; id?: string; url?: string }) => void) {
    setNotice(null);
    start(async () => {
      const r = await fn();
      setNotice({ ok: r.ok, text: r.message });
      after?.(r);
      if (r.ok) router.refresh();
    });
  }

  function createDraft() {
    run(
      () => createEstimateAction(input),
      (r) => {
        if (r.ok && r.id) {
          dirty.current = false;
          router.replace(`/sales/estimates/${r.id}`);
        }
      },
    );
  }

  function addPick(p: BuilderExtras["catalog"][number]) {
    const unit = trade ? tradePrice(p.priceCents, trade.percentOff) : p.priceCents;
    change({ ...input, items: [...input.items, { id: lineId(), productId: p.productId, variantId: p.variantId, name: p.variant ? `${p.name}, ${p.variant}` : p.name, detail: p.sku, qty: 1, unitCents: unit }] });
    pickRef.current?.close();
    setPickerQ("");
  }

  const q = pickerQ.trim().toLowerCase();
  const picks = extras.catalog.filter((p) => !q || `${p.name} ${p.variant} ${p.sku}`.toLowerCase().includes(q)).slice(0, 60);
  const events: EstimateEvent[] = estimate?.events ?? [];
  const deliveryError = estimate?.delivery?.error;
  const st = ESTIMATE_STATUS[status];

  return (
    <div className={s.builder} data-testid="estimate-builder">
      <div className={s.builderMain}>
        {locked && <p className="notice">{locked}</p>}
        {!EDITABLE.has(status) && (
          <p className="notice">
            {say("This estimate", "This quote")} is {st.label.toLowerCase()}, so it can&apos;t change. Duplicate it to start a new one from it.
          </p>
        )}
        {estimate?.changeRequest && status === "changes_requested" && (
          <div className="notice notice-warn" role="status" data-testid="change-request">
            <strong>{say("The client asked for changes:", "They asked for changes:")}</strong> {estimate.changeRequest}
          </div>
        )}

        <section className="card" style={{ padding: 18 }} aria-labelledby="est-client">
          <h2 id="est-client" className={m.fieldLabel} style={{ fontSize: "var(--bo-text-md)", marginBottom: 12 }}>
            {say("Client", "Who it's for")}
          </h2>
          {extras.trade.length > 0 && (
            <div className={m.field}>
              <label htmlFor="est-trade" className={m.fieldLabel}>
                {say("Trade account", "Corporate account")} <span className={m.hint}>Optional</span>
              </label>
              <select
                id="est-trade"
                className="select"
                disabled={!editable}
                value={input.tradeAccountId ?? ""}
                onChange={(e) => {
                  const t = extras.trade.find((x) => x.id === e.target.value);
                  change({ ...input, tradeAccountId: t?.id ?? null, client: t ? { ...input.client, company: t.company, name: input.client.name || t.name, email: input.client.email || t.email, phone: input.client.phone || t.phone } : input.client });
                }}
              >
                <option value="">{say("Not a trade account", "Not a corporate account")}</option>
                {extras.trade.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.company} ({t.tierName}, {t.percentOff}% off)
                  </option>
                ))}
              </select>
              {trade && (
                <span className={m.hint}>
                  Lines you add from {say("the catalog", "your memberships")} get {trade.company}&apos;s {trade.tierName} price. Lines already here keep theirs.
                </span>
              )}
            </div>
          )}
          <div className={m.twoUp}>
            <div className={m.field}>
              <label htmlFor="est-name" className={m.fieldLabel}>
                Name
              </label>
              <input id="est-name" className="input" disabled={!editable} value={input.client.name} onChange={(e) => setClient("name", e.target.value)} maxLength={120} data-testid="est-client-name" />
            </div>
            <div className={m.field}>
              <label htmlFor="est-email" className={m.fieldLabel}>
                Email
              </label>
              <input id="est-email" className="input" type="email" disabled={!editable} value={input.client.email} onChange={(e) => setClient("email", e.target.value)} maxLength={254} data-testid="est-client-email" />
            </div>
            <div className={m.field}>
              <label htmlFor="est-company" className={m.fieldLabel}>
                Company <span className={m.hint}>Optional</span>
              </label>
              <input id="est-company" className="input" disabled={!editable} value={input.client.company} onChange={(e) => setClient("company", e.target.value)} maxLength={120} />
            </div>
            <div className={m.field}>
              <label htmlFor="est-phone" className={m.fieldLabel}>
                Phone <span className={m.hint}>Optional</span>
              </label>
              <input id="est-phone" className="input" type="tel" disabled={!editable} value={input.client.phone} onChange={(e) => setClient("phone", e.target.value)} maxLength={40} />
            </div>
          </div>
          <details style={{ marginTop: 10 }}>
            <summary className={m.linkButton} style={{ cursor: "pointer" }}>
              {say("Job or shipping address", "Address")}
            </summary>
            <div className={m.twoUp} style={{ marginTop: 10 }}>
              {(
                [
                  ["line1", "Street address"],
                  ["line2", "Apartment, suite, unit"],
                  ["city", "City"],
                  ["state", "State"],
                  ["postal", "ZIP or postal code"],
                  ["country", "Country code"],
                ] as const
              ).map(([k, label]) => (
                <div key={k} className={m.field}>
                  <label htmlFor={`est-a-${k}`} className={m.fieldLabel}>
                    {label}
                  </label>
                  <input id={`est-a-${k}`} className="input" disabled={!editable} value={(input.client.address as Record<string, string>)[k] ?? ""} onChange={(e) => setAddress(k, k === "country" ? e.target.value.toUpperCase().slice(0, 2) : e.target.value)} />
                </div>
              ))}
            </div>
          </details>
        </section>

        <section className="card" style={{ padding: 18 }} aria-labelledby="est-lines">
          <div className={m.field}>
            <label htmlFor="est-title" className={m.fieldLabel}>
              What it&apos;s for <span className={m.hint}>{say("Shown at the top of the estimate", "Shown at the top of the quote")}</span>
            </label>
            <input id="est-title" className="input" disabled={!editable} value={input.title} onChange={(e) => change({ ...input, title: e.target.value })} maxLength={160} placeholder={say("Backyard pool resurfacing", "Corporate memberships for your staff")} data-testid="est-title" />
          </div>
          <h2 id="est-lines" className="visually-hidden">
            Lines
          </h2>
          <div className={s.lineHead} aria-hidden="true">
            <span>Item</span>
            <span>Qty</span>
            <span>Price each</span>
            <span style={{ textAlign: "right" }}>Total</span>
            <span />
          </div>
          {input.items.map((l, i) => (
            <div key={l.id} className={s.lineRow} data-testid="est-line">
              <div className={s.lineName}>
                <input className="input" aria-label="Item" disabled={!editable} value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} maxLength={200} data-testid="est-line-name" />
                <input className="input" aria-label="Details" placeholder="Details, optional" disabled={!editable} value={l.detail} onChange={(e) => setLine(i, { detail: e.target.value })} maxLength={500} />
              </div>
              <input
                className="input num"
                inputMode="decimal"
                aria-label="Quantity"
                disabled={!editable}
                value={String(l.qty)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0) setLine(i, { qty: Math.round(n * 100) / 100 });
                }}
                data-testid="est-line-qty"
              />
              {editable ? <MoneyField cents={l.unitCents} currency={currency} label="Price each" onChange={(c) => setLine(i, { unitCents: c })} testId="est-line-price" /> : <span className={s.lineTotal}>{money(l.unitCents)}</span>}
              <span className={s.lineTotal}>{money(Math.round(l.qty * l.unitCents))}</span>
              {editable ? (
                <button type="button" className={m.iconButton} aria-label={`Remove ${l.name || "line"}`} onClick={() => change({ ...input, items: input.items.filter((_, n) => n !== i) })}>
                  <Trash2 aria-hidden="true" />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
          {!input.items.length && <p className="muted" style={{ margin: "10px 0" }}>{say("No lines yet. Add from your catalog or type one in.", "No lines yet. Add a membership, pack or training package, or type one in.")}</p>}
          {editable && (
            <div className={s.lineActions}>
              {extras.catalog.length > 0 && (
                <button type="button" className="btn" onClick={() => pickRef.current?.showModal()} data-testid="est-add-catalog">
                  <Search aria-hidden="true" />
                  {say("Add from catalog", "Add from Memberships")}
                </button>
              )}
              <button type="button" className="btn" onClick={() => change({ ...input, items: [...input.items, { id: lineId(), productId: null, variantId: null, name: "", detail: "", qty: 1, unitCents: 0 }] })} data-testid="est-add-line">
                <Plus aria-hidden="true" />
                Add a line
              </button>
            </div>
          )}

          <div className={m.twoUp} style={{ marginTop: 16 }}>
            <div className={m.field}>
              <span className={m.fieldLabel}>Discount</span>
              <div className={m.choices} role="radiogroup" aria-label="Discount">
                {(
                  [
                    ["none", "None"],
                    ["percent", "Percent"],
                    ["amount", "Amount"],
                  ] as const
                ).map(([k, label]) => {
                  const cur = "kind" in input.discount ? input.discount.kind : "none";
                  return (
                    <button key={k} type="button" role="radio" aria-checked={cur === k} className={m.choice} disabled={!editable} onClick={() => change({ ...input, discount: k === "none" ? {} : { kind: k, value: 0 } })}>
                      {label}
                    </button>
                  );
                })}
              </div>
              {"kind" in input.discount && input.discount.kind === "percent" && (
                <input
                  className="input num"
                  inputMode="decimal"
                  aria-label="Percent off"
                  disabled={!editable}
                  value={String(input.discount.value)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 0 && n <= 100) change({ ...input, discount: { kind: "percent", value: n } });
                  }}
                />
              )}
              {"kind" in input.discount && input.discount.kind === "amount" && editable && <MoneyField cents={input.discount.value} currency={currency} label="Amount off" onChange={(c) => change({ ...input, discount: { kind: "amount", value: c } })} />}
            </div>
            <div className={m.field}>
              <label className={m.fieldLabel} htmlFor="est-ship">
                Shipping or delivery
              </label>
              {editable ? <MoneyField cents={input.shippingCents} currency={currency} label="Shipping or delivery" onChange={(c) => change({ ...input, shippingCents: c })} testId="est-shipping" /> : <span>{money(input.shippingCents)}</span>}
            </div>
          </div>
        </section>

        <section className="card" style={{ padding: 18 }} aria-label="Notes and dates">
          <div className={m.field}>
            <label htmlFor="est-notes" className={m.fieldLabel}>
              {say("Notes for the client", "Notes for them")} <span className={m.hint}>{say("Terms, lead times, what's included", "Start dates, cancellation, what's included")}</span>
            </label>
            <textarea id="est-notes" className={`input ${m.textarea}`} rows={4} disabled={!editable} value={input.notes} onChange={(e) => change({ ...input, notes: e.target.value })} maxLength={5000} />
          </div>
          <div className={m.twoUp}>
            <div className={m.field}>
              <label htmlFor="est-valid" className={m.fieldLabel}>
                Good until
              </label>
              <input id="est-valid" type="date" className="input" disabled={!editable} value={input.validUntil ?? ""} onChange={(e) => change({ ...input, validUntil: e.target.value || null })} />
            </div>
            <div className={m.field}>
              <label htmlFor="est-internal" className={m.fieldLabel}>
                Team note <span className={m.hint}>Only your team sees this</span>
              </label>
              <input id="est-internal" className="input" disabled={!canEdit || Boolean(locked)} value={input.internalNote} onChange={(e) => change({ ...input, internalNote: e.target.value })} maxLength={5000} />
            </div>
          </div>
        </section>
      </div>

      <aside className={s.builderSide}>
        <section className="card" style={{ padding: 18, display: "grid", gap: 14 }} aria-label="Totals and actions">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span className={pillClass(st.tone)} data-testid="estimate-status">
              {st.label}
            </span>
            {id && editable && (
              <span className={m.saveNote} role="status" data-testid="estimate-save-state">
                {save.state === "idle" ? "" : save.message}
              </span>
            )}
          </div>
          <dl className={s.totals}>
            <dt>Subtotal</dt>
            <dd>{money(totals.subtotalCents)}</dd>
            {totals.discountCents > 0 && (
              <>
                <dt>Discount</dt>
                <dd>−{money(totals.discountCents)}</dd>
              </>
            )}
            {input.shippingCents > 0 && (
              <>
                <dt>Shipping</dt>
                <dd>{money(input.shippingCents)}</dd>
              </>
            )}
            <dt className={s.grand}>Total</dt>
            <dd className={s.grand} data-testid="estimate-total">
              {money(totals.totalCents)}
            </dd>
          </dl>
          <p className={m.hint} style={{ margin: 0 }}>
            Tax, if you charge it, is added on the invoice.
          </p>

          {notice && (
            <p className={`notice ${notice.ok ? "notice-ok" : "notice-error"}`} role={notice.ok ? "status" : "alert"} data-testid="estimate-notice">
              {notice.text}
            </p>
          )}
          {deliveryError && <p className="notice notice-error">The last email didn&apos;t send: {deliveryError}</p>}

          {!id && canEdit && (
            <button type="button" className="btn btn-primary" disabled={pending || Boolean(locked)} onClick={() => (locked ? setNotice({ ok: false, text: locked }) : createDraft())} data-testid="estimate-create">
              {pending ? "Saving" : "Save the draft"}
            </button>
          )}
          {id && EDITABLE.has(status) && canSend && (
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => sendRef.current?.showModal()} data-testid="estimate-send">
              {status === "draft" ? say("Send to the client", "Send the quote") : "Send it again"}
            </button>
          )}
          {estimate?.invoiceUrl && status === "invoiced" && (
            <a className="btn" href={estimate.invoiceUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" />
              The invoice in Stripe
            </a>
          )}
          {id && status === "approved" && !estimate?.invoiceUrl && canEdit && extras.payable && (
            <button type="button" className="btn" disabled={pending} onClick={() => run(() => estimateAction(id, "invoice"))} data-testid="estimate-invoice">
              Send the invoice
            </button>
          )}
          {id && (status === "approved" || status === "invoiced") && canEdit && (
            <button type="button" className="btn" disabled={pending} onClick={() => paidRef.current?.showModal()} data-testid="estimate-mark-paid">
              Mark as paid
            </button>
          )}
          {estimate?.orderId && (
            <Link className="btn" href={`/sales/orders?id=${estimate.orderId}`}>
              {say("Open the order", "Open the purchase")}
            </Link>
          )}

          {extras.clientUrl && (
            <div className={m.field}>
              <span className={m.fieldLabel}>{say("The client's page", "Their page")}</span>
              <div className={s.copyRow}>
                <input className="input mono" readOnly value={extras.clientUrl} aria-label={say("The client's page", "Their page")} data-testid="estimate-link" />
                <button type="button" className={m.iconButton} aria-label="Copy the link" onClick={() => void navigator.clipboard?.writeText(extras.clientUrl!).then(() => setCopied(true))}>
                  <Copy aria-hidden="true" />
                </button>
              </div>
              <span className={m.hint}>{copied ? "Copied." : say("Anyone with this link can see the estimate and answer it. Voiding it turns the link off.", "Anyone with this link can see the quote and answer it. Voiding it turns the link off.")}</span>
            </div>
          )}

          {id && canEdit && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" className={m.linkButton} disabled={pending} onClick={() => run(() => estimateAction(id, "duplicate"), (r) => r.ok && r.id && router.push(`/sales/estimates/${r.id}`))} data-testid="estimate-duplicate">
                Duplicate
              </button>
              {status !== "draft" && status !== "void" && status !== "paid" && (
                <button
                  type="button"
                  className={`${m.linkButton} ${m.danger}`}
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(say("Void this estimate? The client's link stops working.", "Void this quote? Their link stops working."))) run(() => estimateAction(id, "void"));
                  }}
                  data-testid="estimate-void"
                >
                  Void
                </button>
              )}
              {status === "draft" && (
                <button
                  type="button"
                  className={`${m.linkButton} ${m.danger}`}
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm("Delete this draft?")) run(() => estimateAction(id, "delete"), (r) => r.ok && router.push("/sales/estimates?status=draft"));
                  }}
                  data-testid="estimate-delete"
                >
                  Delete the draft
                </button>
              )}
            </div>
          )}
        </section>

        {events.length > 0 && (
          <section className="card" style={{ padding: 18 }} aria-labelledby="est-history">
            <h2 id="est-history" className={m.fieldLabel} style={{ marginBottom: 10 }}>
              History
            </h2>
            <ol className={s.timeline} data-testid="estimate-history">
              {[...events].reverse().map((ev, i) => (
                <li key={`${ev.kind}-${i}`} data-kind={ev.kind}>
                  <span>
                    {EVENT[ev.kind] ?? ev.kind}
                    {ev.detail && <small>{ev.detail}</small>}
                    <small>
                      {fmt.format(new Date(ev.at))}
                      {ev.actor && ev.actor !== "client" && ev.actor !== "shop" ? ` · ${ev.actor}` : ""}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </aside>

      <dialog ref={pickRef} className={m.dialog} aria-labelledby="pick-title">
        <div className={m.dialogBody}>
          <div className={m.dialogHead}>
            <h2 id="pick-title">{say("Add from your catalog", "Add from your memberships")}</h2>
          </div>
          <input className="input" autoFocus placeholder="Search by name or SKU" aria-label={say("Search the catalog", "Search your memberships")} value={pickerQ} onChange={(e) => setPickerQ(e.target.value)} data-testid="est-pick-search" />
          <div className={s.picker}>
            {picks.map((p) => (
              <button key={p.variantId ?? `${p.name}-${p.sku}`} type="button" className={s.pick} onClick={() => addPick(p)} data-testid="est-pick">
                <span style={{ color: "inherit", fontSize: "inherit" }}>
                  <strong>{p.name}</strong>
                  {p.variant && <span> · {p.variant}</span>}
                </span>
                <span>{money(trade ? tradePrice(p.priceCents, trade.percentOff) : p.priceCents)}</span>
              </button>
            ))}
            {!picks.length && <p className="muted">Nothing matches that.</p>}
          </div>
          <div className={m.dialogActions}>
            <button type="button" className="btn" onClick={() => pickRef.current?.close()}>
              Done
            </button>
          </div>
        </div>
      </dialog>

      <dialog ref={sendRef} className={m.dialog} aria-labelledby="send-title">
        <form
          className={m.dialogBody}
          onSubmit={(e) => {
            e.preventDefault();
            if (!id) return;
            run(
              async () => {
                if (dirty.current) {
                  const saved = await saveEstimateAction(id, input);
                  if (!saved.ok) return saved;
                  dirty.current = false;
                }
                return sendEstimateAction(id, sendMsg);
              },
              (r) => r.ok && sendRef.current?.close(),
            );
          }}
        >
          <div className={m.dialogHead}>
            <h2 id="send-title">{status === "draft" ? say("Send the estimate", "Send the quote") : "Send it again"}</h2>
          </div>
          {problems.length > 0 ? (
            <ul className="notice notice-warn" style={{ margin: 0, paddingLeft: 28 }}>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0 }}>
              To <strong>{input.client.email}</strong>, with a link to approve it or ask for changes. Replies come to you.
            </p>
          )}
          <div className={m.field}>
            <label htmlFor="send-msg" className={m.fieldLabel}>
              A note <span className={m.hint}>Optional. Goes at the top of the email.</span>
            </label>
            <textarea id="send-msg" className={`input ${m.textarea}`} rows={4} maxLength={2000} value={sendMsg} onChange={(e) => setSendMsg(e.target.value)} />
          </div>
          {notice && !notice.ok && (
            <p className="notice notice-error" role="alert">
              {notice.text}
            </p>
          )}
          <div className={m.dialogActions}>
            <button type="button" className="btn" onClick={() => sendRef.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending || problems.length > 0} data-testid="estimate-send-confirm">
              {pending ? "Sending" : "Send"}
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={paidRef} className={m.dialog} aria-labelledby="paid-title">
        <form
          className={m.dialogBody}
          onSubmit={(e) => {
            e.preventDefault();
            if (!id) return;
            run(
              () => estimateAction(id, "paid", paidNote),
              (r) => r.ok && paidRef.current?.close(),
            );
          }}
        >
          <div className={m.dialogHead}>
            <h2 id="paid-title">Mark as paid</h2>
          </div>
          <p style={{ margin: 0 }}>{say("For a check, bank transfer or cash. It becomes an order, and the Stripe invoice is voided if there is one.", "For a check, bank transfer or cash. It becomes a purchase, and the Stripe invoice is voided if there is one.")}</p>
          <div className={m.field}>
            <label htmlFor="paid-note" className={m.fieldLabel}>
              How it was paid <span className={m.hint}>Optional</span>
            </label>
            <input id="paid-note" className="input" maxLength={300} placeholder="Check #1042" value={paidNote} onChange={(e) => setPaidNote(e.target.value)} />
          </div>
          <div className={m.dialogActions}>
            <button type="button" className="btn" onClick={() => paidRef.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending} data-testid="estimate-paid-confirm">
              Mark as paid
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
