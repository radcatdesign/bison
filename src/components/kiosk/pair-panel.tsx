"use client";

// Settings, Kiosk: make a code to pair a tablet, and show it big enough to read
// across the desk, with how long it has left. The code is only shown here, once.
import { useActionState, useEffect, useState } from "react";
import type { PairState } from "@/app/(portal)/settings/kiosk/actions";
import s from "./kiosk-settings.module.css";

function useCountdown(until: number | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, Math.round((until - now) / 1000));
  if (!left) return "";
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

export function PairPanel({ action, kioskUrl, disabled, disabledNote }: { action: (prev: PairState, form: FormData) => Promise<PairState>; kioskUrl: string; disabled: boolean; disabledNote: string | null }) {
  const [state, run, pending] = useActionState(action, null);
  const left = useCountdown(state?.ok ? state.expiresAt : undefined);
  const showing = state?.ok && state.code && left !== "";

  return (
    <div className={s.pair}>
      <form action={run} className={s.pairForm}>
        <label className={s.field}>
          <span className="label">Name this tablet</span>
          <input className="input" name="name" defaultValue="Front desk" maxLength={60} disabled={disabled} data-testid="pair-name" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={disabled || pending} data-testid="pair-make">
          {pending ? "Making a code" : showing ? "Make a new code" : "Pair a tablet"}
        </button>
      </form>
      {disabledNote && <p className="muted">{disabledNote}</p>}
      <div aria-live="polite">
        {state && !state.ok && (
          <p className="notice notice-error" data-testid="pair-message">
            {state.message}
          </p>
        )}
        {showing && (
          <div className={s.codeBox} data-testid="pair-code-box">
            <span className={`num ${s.code}`} data-testid="pair-code-value">
              {state.code!.slice(0, 3)} {state.code!.slice(3)}
            </span>
            <p>
              On the tablet, open <strong className="mono">{kioskUrl}</strong> and type this code. It works once, for the next <span className="num">{left}</span>.
            </p>
            <p className="muted">Then add it to the tablet&apos;s home screen so it opens full screen, and turn on the tablet&apos;s guided access or kiosk mode so people can&apos;t leave the app.</p>
          </div>
        )}
        {state?.ok && left === "" && <p className="notice">That code ran out. Make a new one when the tablet is in front of you.</p>}
      </div>
    </div>
  );
}
