"use client";

import { useActionState } from "react";
import { createTenantAction } from "./actions";

export function OnboardingForm({ edition, industries }: { edition: "bison" | "fit"; industries: { value: string; label: string }[] }) {
  const [state, run, pending] = useActionState(createTenantAction, null);
  const fit = edition === "fit";
  return (
    <form action={run} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="edition" value={edition} />
      <label style={{ display: "grid", gap: 6 }}>
        <span className="label">{fit ? "Club name" : "Company name"}</span>
        <input name="name" className="input" required maxLength={120} autoComplete="organization" />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="label">Website</span>
        <input name="domain" className="input" required placeholder={fit ? "yourclub.com" : "yourcompany.com"} inputMode="url" autoComplete="url" />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="label">{fit ? "Kind of club" : "What you do"}</span>
        <select name="industry" className="select" defaultValue={industries[0]?.value}>
          {industries.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Setting up" : "Create account"}
      </button>
      {state && !state.ok && (
        <p className="notice notice-error" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
