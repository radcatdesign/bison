"use client";

// The first thing an unpaired tablet shows: where to get a code, and a box to type it.
import { useState } from "react";
import { Funnel } from "@/components/mark";
import s from "./kiosk.module.css";

export function PairTablet() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/kiosk/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const data = (await r.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (r.ok && data?.ok) return window.location.reload();
      setError(data?.message ?? "That didn't work. Try again.");
    } catch {
      setError("The tablet lost its connection. Check the Wi-Fi, then try again.");
    }
    setBusy(false);
  }

  return (
    <div className={s.kiosk} data-accent="" data-edition="fit" data-testid="kiosk-pair">
      <span />
      <header className={s.top}>
        <span />
        <span className={s.brand}>
          <Funnel width={28} />
          <span>Fit Funnels</span>
        </span>
        <span />
      </header>
      <main className={s.stage}>
        <form className={s.pair} onSubmit={submit}>
          <h1 className={s.title}>Set up this tablet as your front desk kiosk</h1>
          <ol className={s.steps}>
            <li>
              <b>1</b>
              <span>On a computer or phone, sign in to Fit Funnels and open Settings, then Kiosk.</span>
            </li>
            <li>
              <b>2</b>
              <span>Choose Pair a tablet. You&apos;ll get a 6-digit code that works for 10 minutes.</span>
            </li>
            <li>
              <b>3</b>
              <span>Type the code here.</span>
            </li>
          </ol>
          <label className={s.field}>
            <span className={s.fieldLabel}>Code</span>
            <input
              className={`${s.input} ${s.codeInput}`}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              data-testid="pair-code"
              required
            />
          </label>
          <div aria-live="assertive">
            {error && (
              <p className={s.error} data-testid="pair-error">
                {error}
              </p>
            )}
          </div>
          <button type="submit" className={s.primary} disabled={busy || code.length !== 6} data-testid="pair-submit">
            {busy ? "Pairing" : "Pair this tablet"}
          </button>
        </form>
      </main>
      <span />
    </div>
  );
}
