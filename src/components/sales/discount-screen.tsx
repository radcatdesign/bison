"use client";

// Sales, Discount codes: the list, and the form that makes or changes a code.
// The sentence under the form says exactly what the code will do before it's
// saved, the same sentence the list shows.
import { Plus, Shuffle } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { deleteDiscountAction, saveDiscountAction } from "@/app/(portal)/sales/actions";
import m from "@/components/marketing/marketing.module.css";
import { Card, Help } from "@/components/ui";
import { type DiscountRule, type DiscountUsage, discountSentence, normalizeCode } from "@/lib/sales/discounts";
import { moneyInput, parseMoney } from "@/lib/sales/money";
import { pillClass, type Tone } from "./labels";
import x from "./screens.module.css";
import s from "./sales.module.css";
import { DEMO_MESSAGE } from "@/config/demo-text";

/** Same words as the server's demo answer. lib/demo is server-only, so it can't be imported here. */

export type DiscountItem = DiscountRule & { id: string; note: string; uses: number; held: number; state: { label: string; tone: Tone } };

type Props = { rows: DiscountItem[]; currency: string; timeZone: string; canEdit: boolean; demo: boolean; tradeAccounts: { id: string; company: string }[] };

type Form = {
  code: string;
  kind: "percent" | "amount";
  value: string;
  usage: DiscountUsage;
  tradeAccountId: string;
  maxUses: string;
  minOrder: string;
  startsOn: string;
  endsOn: string;
  note: string;
  active: boolean;
};

const BLANK: Form = { code: "", kind: "percent", value: "", usage: "unlimited", tradeAccountId: "", maxUses: "", minOrder: "", startsOn: "", endsOn: "", note: "", active: true };

const USAGE: [DiscountUsage, string, string][] = [
  ["unlimited", "Anyone, any number of times", "Good for a sale or a code you share widely."],
  ["per_account", "Once per customer", "Each email address or trade account can use it one time."],
  ["single_use", "One time only", "The first order that uses it is the only one."],
];

// ---- Dates in the company's time zone ----------------------------------------------------------

function offsetAt(ms: number, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(ms)).map((p) => [p.type, Number(p.value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(ms / 1000) * 1000;
}

/** The moment a day starts (or ends) in the company's time zone. */
function dayEdge(isoDay: string, timeZone: string, end: boolean): Date | null {
  const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!m2) return null;
  const wall = end ? Date.UTC(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]), 23, 59, 59) : Date.UTC(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]), 0, 0, 0);
  let t = wall - offsetAt(wall, timeZone);
  t = wall - offsetAt(t, timeZone);
  return new Date(t);
}

const dayOf = (d: Date | null, timeZone: string) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d) : "");

function formOf(r: DiscountItem, currency: string, timeZone: string): Form {
  return {
    code: r.code,
    kind: r.percentOff !== null ? "percent" : "amount",
    value: r.percentOff !== null ? String(r.percentOff) : moneyInput(r.amountOffCents, currency),
    usage: r.usage,
    tradeAccountId: r.tradeAccountId ?? "",
    maxUses: r.maxUses && r.usage !== "single_use" ? String(r.maxUses) : "",
    minOrder: moneyInput(r.minOrderCents, currency),
    startsOn: dayOf(r.startsAt, timeZone),
    endsOn: dayOf(r.expiresAt, timeZone),
    note: r.note,
    active: r.active,
  };
}

/** What the server gets: percent as a number, amounts in cents, days as moments in the company's time zone. */
function inputOf(f: Form, currency: string, timeZone: string) {
  const value = f.kind === "percent" ? Number(f.value.replace(/[%\s]/g, "")) : parseMoney(f.value, currency);
  const maxUses = f.usage === "single_use" || !f.maxUses.trim() ? null : Math.floor(Number(f.maxUses));
  return {
    code: normalizeCode(f.code),
    kind: f.kind,
    value: Number.isFinite(value) && value !== null ? value : 0,
    usage: f.usage,
    tradeAccountId: f.tradeAccountId || null,
    maxUses: maxUses !== null && Number.isFinite(maxUses) && maxUses > 0 ? maxUses : null,
    minOrderCents: f.minOrder.trim() ? parseMoney(f.minOrder, currency) || null : null,
    startsAt: f.startsOn ? dayEdge(f.startsOn, timeZone, false)?.toISOString() ?? null : null,
    expiresAt: f.endsOn ? dayEdge(f.endsOn, timeZone, true)?.toISOString() ?? null : null,
    note: f.note,
    active: f.active,
  };
}

function ruleOf(f: Form, currency: string, timeZone: string, trade: { id: string; company: string }[]): DiscountRule {
  const i = inputOf(f, currency, timeZone);
  return {
    code: i.code || "YOURCODE",
    percentOff: i.kind === "percent" ? i.value : null,
    amountOffCents: i.kind === "amount" ? i.value : null,
    usage: i.usage,
    tradeAccountId: i.tradeAccountId,
    tradeAccountName: trade.find((t) => t.id === i.tradeAccountId)?.company ?? null,
    maxUses: i.usage === "single_use" ? 1 : i.maxUses,
    minOrderCents: i.minOrderCents,
    startsAt: i.startsAt ? new Date(i.startsAt) : null,
    expiresAt: i.expiresAt ? new Date(i.expiresAt) : null,
    active: i.active,
  };
}

function randomCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => letters[b % letters.length]).join("");
}

export function DiscountScreen({ rows, currency, timeZone, canEdit, demo, tradeAccounts }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<DiscountItem | null>(null);
  const [f, setF] = useState<Form>(BLANK);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [listNotice, setListNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const open = (r: DiscountItem | null) => {
    setEditing(r);
    setF(r ? formOf(r, currency, timeZone) : BLANK);
    setNotice(null);
    setConfirming(false);
    ref.current?.showModal();
  };

  const save = () =>
    start(async () => {
      if (demo) return setNotice({ ok: false, text: DEMO_MESSAGE });
      if (f.kind === "amount" && f.value.trim() && parseMoney(f.value, currency) === null) return setNotice({ ok: false, text: "Enter the amount off as an amount, like 25 or 25.50." });
      if (f.minOrder.trim() && parseMoney(f.minOrder, currency) === null) return setNotice({ ok: false, text: "Enter the minimum order as an amount, like 50, or leave it empty." });
      const r = await saveDiscountAction(editing?.id ?? null, inputOf(f, currency, timeZone));
      if (!r.ok) return setNotice({ ok: false, text: r.message });
      setListNotice(r.message);
      ref.current?.close();
    });

  const remove = () =>
    start(async () => {
      if (!editing) return;
      if (demo) return setNotice({ ok: false, text: DEMO_MESSAGE });
      const r = await deleteDiscountAction(editing.id);
      if (!r.ok) return setNotice({ ok: false, text: r.message });
      setListNotice(`${editing.code} is deleted. Orders that used it keep their discount.`);
      ref.current?.close();
    });

  // An existing code can point at an account that's paused now; keep it in the list so the form shows it.
  const accounts = editing?.tradeAccountId && !tradeAccounts.some((t) => t.id === editing.tradeAccountId) ? [...tradeAccounts, { id: editing.tradeAccountId, company: editing.tradeAccountName || "A trade account" }] : tradeAccounts;
  const sentence = discountSentence(ruleOf(f, currency, timeZone, accounts), currency, timeZone);
  const usesLabel = (r: DiscountItem) => `${r.uses.toLocaleString("en-US")}${r.usage === "single_use" ? " of 1" : r.maxUses ? ` of ${r.maxUses.toLocaleString("en-US")}` : ""}`;

  return (
    <>
      {listNotice && (
        <p className={`notice notice-ok ${x.gapBelow}`} role="status" data-testid="discount-list-notice">
          {listNotice}
        </p>
      )}
      <Card
        title="Codes"
        flush
        testId="discount-list"
        aside={
          canEdit ? (
            <button type="button" className="btn btn-primary" onClick={() => open(null)} data-testid="new-discount">
              <Plus aria-hidden="true" />
              New code
            </button>
          ) : null
        }
      >
        {rows.length === 0 ? (
          <div className={m.empty}>
            <strong>No codes yet.</strong>
            <span>Make one for a sale, a newsletter or a single customer. It works at checkout and on nothing else.</span>
          </div>
        ) : (
          <div className={x.scrollX}>
            <table className={m.table}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th className={m.hideSm}>
                    <span className={x.thHelp}>
                      Uses
                      <Help title="Uses">
                        <p>Paid orders that used the code, out of its limit when it has one. A checkout that&apos;s open with the code holds one use until it&apos;s paid or runs out of time, so two people can&apos;t spend a one-time code at once. Those show as &quot;at checkout&quot;.</p>
                      </Help>
                    </span>
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-testid="discount-row" data-code={r.code}>
                    <td>
                      <button type="button" className={x.rowButton} onClick={() => open(r)} aria-label={`Open ${r.code}`}>
                        <span className={x.codeCell}>
                          <strong>{r.code}</strong>
                          <span>{discountSentence(r, currency, timeZone)}</span>
                          {r.note && <span>Team note: {r.note}</span>}
                        </span>
                      </button>
                    </td>
                    <td className={`${m.hideSm} ${s.money}`}>
                      {usesLabel(r)}
                      {r.held > 0 && <span className="muted"> · {r.held} at checkout</span>}
                    </td>
                    <td>
                      <span className={pillClass(r.state.tone)}>{r.state.label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={m.pager}>
          <span>
            <span className="num">{rows.length.toLocaleString("en-US")}</span> {rows.length === 1 ? "code" : "codes"}
          </span>
        </div>
      </Card>

      <dialog ref={ref} className={`${m.dialog} ${x.wideDialog}`} aria-labelledby="discount-title" data-testid="discount-dialog">
        <form
          className={`${m.dialogBody} ${x.dialogScroll}`}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className={m.dialogHead}>
            <h2 id="discount-title">{editing ? `Edit ${editing.code}` : "New discount code"}</h2>
          </div>
          <fieldset disabled={!canEdit || pending} className={x.plainFieldset}>
            <div className={m.field}>
              <label htmlFor="dc-code" className={m.fieldLabel}>
                Code
              </label>
              <div className={x.codeRow}>
                <input id="dc-code" className="input mono" maxLength={40} value={f.code} placeholder="SPRING20" autoCapitalize="characters" spellCheck={false} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s+/g, ""))} data-testid="discount-code" />
                <button type="button" className="btn" onClick={() => set("code", randomCode())}>
                  <Shuffle aria-hidden="true" />
                  Make one up
                </button>
              </div>
              <span className={m.hint}>Letters, numbers and dashes. Shoppers type it in the cart, and capitals don&apos;t matter.</span>
            </div>

            <div className={m.field}>
              <span className={m.fieldLabel}>Takes off</span>
              <div className={x.valueRow}>
                <div className={m.choices} role="radiogroup" aria-label="Takes off">
                  {(
                    [
                      ["percent", "A percent"],
                      ["amount", "An amount"],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} type="button" role="radio" aria-checked={f.kind === k} className={m.choice} onClick={() => set("kind", k)} data-testid={`discount-kind-${k}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <input className="input num" inputMode="decimal" aria-label={f.kind === "percent" ? "Percent off" : "Amount off"} value={f.value} placeholder={f.kind === "percent" ? "10" : "25.00"} onChange={(e) => set("value", e.target.value)} data-testid="discount-value" />
              </div>
              <span className={m.hint}>{f.kind === "percent" ? "Percent off the products, before shipping and tax. 100 makes the order free, shipping included." : "Off the products, before shipping and tax. It never takes off more than the order."}</span>
            </div>

            <div className={m.field}>
              <span className={m.fieldLabel}>Who can use it</span>
              <div className={x.tightCol} role="radiogroup" aria-label="Who can use it">
                {USAGE.map(([k, label, hint]) => (
                  <label key={k} className={m.checkRow}>
                    <input type="radio" name="dc-usage" checked={f.usage === k} onChange={() => set("usage", k)} data-testid={`discount-usage-${k}`} />
                    <span>
                      {label}
                      <span className={`${m.hint} ${x.block}`}>
                        {hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {accounts.length > 0 && (
              <div className={m.field}>
                <label htmlFor="dc-trade" className={m.fieldLabel}>
                  Only for one trade account <em>Optional</em>
                </label>
                <select id="dc-trade" className="select" value={f.tradeAccountId} onChange={(e) => set("tradeAccountId", e.target.value)} data-testid="discount-trade">
                  <option value="">Anyone</option>
                  {accounts.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.company}
                    </option>
                  ))}
                </select>
                <span className={m.hint}>They have to be signed in to their trade account for it to work.</span>
              </div>
            )}

            <div className={m.twoUp}>
              {f.usage !== "single_use" ? (
                <div className={m.field}>
                  <label htmlFor="dc-max" className={m.fieldLabel}>
                    Stop after this many uses <em>Optional</em>
                  </label>
                  <input id="dc-max" className="input num" inputMode="numeric" value={f.maxUses} placeholder="No limit" onChange={(e) => set("maxUses", e.target.value.replace(/\D/g, ""))} data-testid="discount-max" />
                </div>
              ) : (
                <div />
              )}
              <div className={m.field}>
                <label htmlFor="dc-min" className={m.fieldLabel}>
                  Orders of at least <em>Optional</em>
                </label>
                <input id="dc-min" className="input num" inputMode="decimal" value={f.minOrder} placeholder="Any amount" onChange={(e) => set("minOrder", e.target.value)} data-testid="discount-min" />
              </div>
            </div>

            <div className={m.twoUp}>
              <div className={m.field}>
                <label htmlFor="dc-start" className={m.fieldLabel}>
                  Starts <em>Optional</em>
                </label>
                <input id="dc-start" type="date" className="input" value={f.startsOn} onChange={(e) => set("startsOn", e.target.value)} data-testid="discount-starts" />
              </div>
              <div className={m.field}>
                <label htmlFor="dc-end" className={m.fieldLabel}>
                  Last day <em>Optional</em>
                </label>
                <input id="dc-end" type="date" className="input" value={f.endsOn} onChange={(e) => set("endsOn", e.target.value)} data-testid="discount-ends" />
              </div>
            </div>

            <div className={m.field}>
              <label htmlFor="dc-note" className={m.fieldLabel}>
                Team note <em>Optional</em>
              </label>
              <input id="dc-note" className="input" maxLength={500} value={f.note} placeholder="For the spring newsletter" onChange={(e) => set("note", e.target.value)} data-testid="discount-note" />
              <span className={m.hint}>Only your team sees this.</span>
            </div>

            <label className={m.checkRow}>
              <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} data-testid="discount-active" />
              <span>Turned on</span>
            </label>
          </fieldset>

          <p className={s.sentence} aria-live="polite" data-testid="discount-sentence">
            {sentence}
          </p>
          <p className={m.hint}>Codes are private. They only work when someone types them, and nothing lists them in your shop.</p>

          {notice && (
            <p className={`notice ${notice.ok ? "notice-ok" : "notice-error"}`} role={notice.ok ? "status" : "alert"} data-testid="discount-notice">
              {notice.text}
            </p>
          )}

          {confirming && editing && (
            <div className={x.confirm} role="alert">
              <span>
                Delete {editing.code}? It stops working right away. Orders that used it keep their discount.
              </span>
              <div>
                <button type="button" className={`btn ${x.dangerButton}`} disabled={pending} onClick={remove} data-testid="discount-delete-confirm">
                  Delete it
                </button>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>
                  Keep it
                </button>
              </div>
            </div>
          )}

          <div className={m.dialogActions}>
            {editing && canEdit && !confirming && (
              <button type="button" className={`btn ${m.danger} ${x.pushLeft}`} onClick={() => setConfirming(true)} data-testid="discount-delete">
                Delete
              </button>
            )}
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              {canEdit ? "Cancel" : "Close"}
            </button>
            {canEdit && (
              <button type="submit" className="btn btn-primary" disabled={pending} data-testid="discount-save">
                {pending ? "Saving" : editing ? "Save changes" : "Save code"}
              </button>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}
