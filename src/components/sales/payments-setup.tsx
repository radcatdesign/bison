"use client";

// Settings, Payments: the company's own Stripe account. Connecting sends an
// owner or admin through Stripe's own onboarding; Bison Ops never sees bank
// details or keys. Status and Stripe Tax are read back from Stripe.
import { Check, ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { checkPaymentsAction, disconnectPaymentsAction } from "@/app/(portal)/sales/actions";
import m from "@/components/marketing/marketing.module.css";

type Props = {
  serverReady: boolean;
  canManage: boolean;
  isOwner: boolean;
  demo: boolean;
  conn: { accountId: string | null; chargesEnabled: boolean; needsAction: boolean; status: string; tax: string; error: string | null };
  dashboardUrl: string | null;
  error: string | null;
};

const ERRORS: Record<string, string> = {
  role: "Only owners and admins can connect Stripe.",
  demo: "This is a demo, so it can't connect a real Stripe account.",
  locked: "Payments are part of Sales. Unlock Sales first.",
  busy: "Stripe is busy right now. Try again in a minute.",
  stripe: "Stripe didn't start the connection. Try again, and if it keeps happening, contact support.",
};

export function PaymentsSetup({ serverReady, canManage, isOwner, demo, conn, dashboardUrl, error }: Props) {
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(error ? { ok: false, text: ERRORS[error] ?? "That didn't work." } : null);
  const [pending, start] = useTransition();
  const step = !conn.accountId ? 1 : !conn.chargesEnabled ? 2 : 3;
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => {
    const r = await fn();
    setNotice({ ok: r.ok, text: r.message });
  });

  return (
    <div className={m.wizard} data-testid="payments-setup">
      {!serverReady && !demo && (
        <p className="notice notice-error" role="alert">
          Payments aren&apos;t switched on for this Bison Ops server yet (no STRIPE_SECRET_KEY). The steps below work once they are.
        </p>
      )}
      {!canManage && <p className="notice">Only owners and admins can connect Stripe. You can see where it stands here.</p>}

      <section className={m.wizardStep} data-state={step === 1 ? "current" : "done"} data-testid="payments-step-connect">
        <span className={m.wizardNum} aria-hidden="true">
          {step > 1 ? <Check /> : 1}
        </span>
        <div className={m.wizardBody}>
          <h2>Connect your Stripe account</h2>
          <p className={m.hint}>Payments go straight to your Stripe account, never through Bison Ops. Stripe asks for your business details and a bank account for payouts; have your tax ID handy. It takes about ten minutes. If you already use Stripe, sign in and Stripe fills in what it can.</p>
          {step === 1 ? (
            canManage && !demo && serverReady ? (
              <a href="/settings/payments/connect" className="btn btn-primary" data-testid="connect-stripe" style={{ justifySelf: "start" }}>
                Connect Stripe
              </a>
            ) : demo ? (
              <button type="button" className="btn btn-primary" style={{ justifySelf: "start" }} onClick={() => setNotice({ ok: false, text: ERRORS.demo })}>
                Connect Stripe
              </button>
            ) : null
          ) : (
            <p className={m.hint}>
              Connected account <span className="mono">{conn.accountId}</span>
            </p>
          )}
        </div>
      </section>

      <section className={m.wizardStep} data-state={step === 2 ? "current" : step > 2 ? "done" : "later"} data-testid="payments-step-verify">
        <span className={m.wizardNum} aria-hidden="true">
          {step > 2 ? <Check /> : 2}
        </span>
        <div className={m.wizardBody}>
          <h2>Finish what Stripe asks for</h2>
          <p className={m.hint}>Stripe checks who you are before money can move. Most companies are done in minutes; sometimes Stripe asks for a document and takes a day or two.</p>
          {step === 2 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {canManage && (
                <a href="/settings/payments/connect" className="btn btn-primary" data-testid="continue-stripe">
                  Continue in Stripe
                </a>
              )}
              <button type="button" className="btn" disabled={pending} onClick={() => run(checkPaymentsAction)} data-testid="check-stripe">
                {pending ? "Checking" : "Check again"}
              </button>
            </div>
          )}
          {step > 2 && <p className={m.hint}>Card payments are on.</p>}
        </div>
      </section>

      <section className={m.wizardStep} data-state={step === 3 ? "current" : "later"} data-testid="payments-step-tax">
        <span className={m.wizardNum} aria-hidden="true">
          {conn.tax === "active" ? <Check /> : 3}
        </span>
        <div className={m.wizardBody}>
          <h2>Sales tax, if you collect it</h2>
          <p className={m.hint}>Stripe Tax works out tax for each address at checkout and on invoices. Turn it on in your Stripe Dashboard under Settings, Tax, and add where you&apos;re registered. Then switch on tax in Sales, Checkout.</p>
          {step === 3 && (
            <p className={m.hint} data-testid="tax-status">
              {conn.tax === "active" ? "Stripe Tax is on in your account." : "Stripe Tax isn't on in your Stripe account yet."}
            </p>
          )}
          {step === 3 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {dashboardUrl && (
                <a href={dashboardUrl} className="btn" target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden="true" />
                  Open your Stripe Dashboard
                </a>
              )}
              <button type="button" className="btn" disabled={pending} onClick={() => run(checkPaymentsAction)}>
                {pending ? "Checking" : "Check again"}
              </button>
            </div>
          )}
        </div>
      </section>

      {conn.error && <p className="notice notice-error">Last check: {conn.error}</p>}
      {notice && (
        <p className={`notice ${notice.ok ? "notice-ok" : "notice-error"}`} role={notice.ok ? "status" : "alert"} data-testid="payments-notice">
          {notice.text}
        </p>
      )}

      {conn.accountId && isOwner && (
        <details className={m.hint}>
          <summary style={{ cursor: "pointer" }}>Disconnect Stripe</summary>
          <p style={{ margin: "8px 0" }}>Checkout and invoices stop until you connect again. Your Stripe account, its payments and payouts stay yours.</p>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Disconnect your Stripe account from Bison Ops?")) run(disconnectPaymentsAction);
            }}
          >
            Disconnect
          </button>
        </details>
      )}
    </div>
  );
}
