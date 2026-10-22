"use client";

import { type ReactNode, useActionState } from "react";
import type { ActionState } from "@/app/(portal)/actions";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  primary?: boolean;
  /** Submit as soon as a field changes (toggles, selects). */
  autoSubmit?: boolean;
  testId?: string;
  className?: string;
};

/** A form that runs a server action and says plainly what happened. */
export function ActionForm({ action, children, submitLabel, pendingLabel = "Saving", primary, autoSubmit, testId, className }: Props) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form
      action={run}
      className={className}
      data-testid={testId}
      onChange={autoSubmit ? (e) => e.currentTarget.requestSubmit() : undefined}
      style={{ display: "grid" }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        {children}
        {submitLabel && (
          <button type="submit" className={primary ? "btn btn-primary" : "btn"} disabled={pending}>
            {pending ? pendingLabel : submitLabel}
          </button>
        )}
      </div>
      <div aria-live="polite">
        {state && (
          <p className={`notice ${state.ok ? "notice-ok" : "notice-error"}`} style={{ marginTop: 12 }} data-testid="action-message">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
