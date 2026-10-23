"use client";

import { type FormEvent, useState } from "react";
import type { SectionOf } from "@/lib/pages/schema";
import { FormFields, formClasses, type SignupChoices } from "./landing-page";

/** The working form on a published landing page. Sends to Contacts. */
/** `token` is signed by the server when the page renders; it tells the server how long the form was open. */
/** `version` is the A/B test version this visitor sees, when the page is in a test. */
export function PageForm({ section, endpoint, token, signup, version }: { section: SectionOf<"form">; endpoint: string; token: string; signup?: SignupChoices | null; version?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fields = Object.fromEntries(section.fields.map((f) => [f, String(data.get(f) ?? "")]));
    setState("sending");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ formId: section.id, fields, trap: String(data.get("website") ?? ""), token, ...(version ? { version } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setMessage(body.message ?? (res.ok ? section.success : "This wasn't sent. Try again in a minute."));
      setState(res.ok ? "done" : "error");
    } catch {
      setMessage("This wasn't sent. Check your connection and try again.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className={formClasses.done} role="status" data-testid="page-form-done">
        {message}
      </p>
    );
  }

  return (
    <form className={formClasses.form} onSubmit={onSubmit} data-testid="page-form">
      <FormFields section={section} disabled={state === "sending"} signup={signup} />
      <label className={formClasses.trap} aria-hidden="true">
        Leave this empty
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      {state === "error" && (
        <p className={formClasses.error} role="alert">
          {message}
        </p>
      )}
      <button type="submit" className={formClasses.submit} disabled={state === "sending"}>
        {state === "sending" ? "Sending" : section.submit}
      </button>
    </form>
  );
}
