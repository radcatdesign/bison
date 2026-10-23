"use client";

// What the team can do on an order: send the alert again, send it to
// ShipStation again, mark it shipped, and refund some or all of it.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { orderAction, refundAction } from "@/app/(portal)/sales/actions";
import m from "@/components/marketing/marketing.module.css";
import { formatMoney, moneyInput, parseMoney } from "@/lib/sales/money";
import s from "./sales.module.css";

type Props = { id: string; currency: string; refundableCents: number; canEdit: boolean; canRefund: boolean; paidByStripe: boolean; fulfillment: string; hasFulfillment: boolean; locked: string | null };

export function OrderActions({ id, currency, refundableCents, canEdit, canRefund, paidByStripe, fulfillment, hasFulfillment, locked }: Props) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [tracking, setTracking] = useState("");
  const [refund, setRefund] = useState(moneyInput(refundableCents, currency));

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    if (locked) return setNotice({ ok: false, text: locked });
    setNotice(null);
    start(async () => {
      const r = await fn();
      setNotice({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className={s.stack} style={{ gap: 14 }}>
      {notice && (
        <p className={`notice ${notice.ok ? "notice-ok" : "notice-error"}`} role={notice.ok ? "status" : "alert"} data-testid="order-notice">
          {notice.text}
        </p>
      )}
      {canEdit && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="btn" disabled={pending} onClick={() => run(() => orderAction(id, "alert"))} data-testid="order-alert-again">
            Email the team again
          </button>
          {hasFulfillment && fulfillment !== "shipped" && (
            <button type="button" className="btn" disabled={pending} onClick={() => run(() => orderAction(id, "fulfill"))} data-testid="order-fulfill">
              {fulfillment === "sent" ? "Send to ShipStation again" : "Send to ShipStation"}
            </button>
          )}
        </div>
      )}
      {canEdit && fulfillment !== "shipped" && (
        <form
          className={s.copyRow}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => orderAction(id, "shipped", tracking));
          }}
        >
          <input className="input" placeholder="Tracking number, optional" aria-label="Tracking number" maxLength={120} value={tracking} onChange={(e) => setTracking(e.target.value)} />
          <button type="submit" className="btn" disabled={pending} data-testid="order-shipped">
            Mark shipped
          </button>
        </form>
      )}
      {canRefund && paidByStripe && refundableCents > 0 && (
        <form
          className={m.field}
          onSubmit={(e) => {
            e.preventDefault();
            const cents = parseMoney(refund, currency);
            if (cents === null || cents <= 0) return setNotice({ ok: false, text: "Enter how much to refund." });
            if (!window.confirm(`Refund ${formatMoney(cents, currency)} to their card? This can't be undone.`)) return;
            run(() => refundAction(id, cents));
          }}
        >
          <label className={m.fieldLabel} htmlFor="refund-amount">
            Refund <span className={m.hint}>Up to {formatMoney(refundableCents, currency)}</span>
          </label>
          <div className={s.copyRow}>
            <input id="refund-amount" className="input num" inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value)} data-testid="refund-amount" />
            <button type="submit" className={`btn ${m.danger}`} disabled={pending} data-testid="refund-submit">
              Refund
            </button>
          </div>
        </form>
      )}
      {canRefund && !paidByStripe && <p className={m.hint}>This order wasn&apos;t paid through Stripe, so refund it where it was paid.</p>}
    </div>
  );
}
