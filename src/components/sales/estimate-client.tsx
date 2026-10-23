"use client";

// The client's answers on their estimate page: approve by typing their name,
// ask for changes, or decline.
import { useRouter } from "next/navigation";
import { useState } from "react";
import s from "@/components/shop/shop.module.css";

type Kind = "approve" | "changes" | "decline";

export function EstimateAnswer({ token, seen, total, business }: { token: string; seen: string; total: string; business: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("approve");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ ok: boolean; message: string; invoiceUrl?: string | null } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setReply(null);
    try {
      const res = await fetch(`/e/${token}/reply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(kind === "approve" ? { kind, name, seen } : { kind, message, seen }) });
      const data = (await res.json().catch(() => null)) as { ok: boolean; message: string; invoiceUrl?: string | null; changed?: boolean } | null;
      setReply(data ?? { ok: false, message: "That didn't go through. Try again." });
      // A newer version arrived while they had it open: show it. After an answer, the reply stays on screen.
      if (data?.changed) router.refresh();
    } catch {
      setReply({ ok: false, message: "Couldn't reach the server. Check your connection and try again." });
    }
    setBusy(false);
  }

  if (reply?.ok) {
    return (
      <div className={s.step} data-testid="estimate-answered">
        <p className={s.message} data-tone="ok" role="status">
          {reply.message}
        </p>
        {reply.invoiceUrl && (
          <a className={s.button} href={reply.invoiceUrl} data-testid="estimate-pay">
            Pay the invoice
          </a>
        )}
      </div>
    );
  }

  return (
    <form className={s.step} onSubmit={(e) => void send(e)} aria-labelledby="answer-title">
      <h2 id="answer-title">Your answer</h2>
      <div className={s.optionChoices} role="radiogroup" aria-label="Your answer">
        {(
          [
            ["approve", "Approve"],
            ["changes", "Ask for changes"],
            ["decline", "Decline"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} data-testid={`estimate-choose-${k}`}>
            {label}
          </button>
        ))}
      </div>
      {kind === "approve" ? (
        <>
          <label className={s.field}>
            Type your full name to approve <span>This counts as your signature, for {total} with {business}.</span>
            <input className={s.input} autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} data-testid="estimate-sign-name" />
          </label>
        </>
      ) : (
        <label className={s.field}>
          {kind === "changes" ? "What would you like changed?" : "Anything you'd like them to know?"}
          {kind === "decline" && <span>Optional</span>}
          <textarea className={s.input} required={kind === "changes"} minLength={kind === "changes" ? 3 : 0} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} data-testid="estimate-message" />
        </label>
      )}
      {reply && !reply.ok && (
        <p className={s.message} data-tone="error" role="alert" data-testid="estimate-answer-error">
          {reply.message}
        </p>
      )}
      <button type="submit" className={s.button} disabled={busy} data-testid="estimate-answer-send">
        {busy ? "Sending" : kind === "approve" ? "Approve the estimate" : kind === "changes" ? "Send my changes" : "Decline the estimate"}
      </button>
    </form>
  );
}
