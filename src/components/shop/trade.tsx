"use client";

// The trade page's two forms: sign in with an email link, and apply.
import { useState } from "react";
import { useSay } from "@/components/edition";
import type { Say } from "@/config/editions";
import s from "./shop.module.css";

type Reply = { ok: boolean; message: string } | null;

async function send(url: string, body: unknown, say: Say): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
    return { ok: Boolean(data?.ok), message: data?.message ?? "That didn't send. Try again." };
  } catch {
    return { ok: false, message: say("Couldn't reach the shop. Check your connection and try again.", "Couldn't reach the store. Check your connection and try again.") };
  }
}

function Note({ reply, testId }: { reply: Reply; testId: string }) {
  if (!reply) return null;
  return (
    <p className={s.message} data-tone={reply.ok ? "ok" : "error"} role={reply.ok ? "status" : "alert"} data-testid={testId}>
      {reply.message}
    </p>
  );
}

export function TradeSignIn({ slug }: { slug: string }) {
  const say = useSay();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply>(null);
  return (
    <form
      className={s.step}
      aria-labelledby="trade-in"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void send(`/p/${slug}/trade/link`, { email }, say).then((r) => {
          setBusy(false);
          setReply(r);
        });
      }}
    >
      <h2 id="trade-in">Already have an account?</h2>
      <p className={s.note}>We&apos;ll email you a link that signs you in. No password to remember.</p>
      <label className={s.field}>
        Email
        <input className={s.input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="trade-signin-email" />
      </label>
      <Note reply={reply} testId="trade-signin-reply" />
      <button type="submit" className={s.ghost} disabled={busy} data-testid="trade-signin-send">
        {busy ? "Sending" : "Email me a sign-in link"}
      </button>
    </form>
  );
}

export function TradeApply({ slug, token, intro }: { slug: string; token: string; intro: string }) {
  const say = useSay();
  const [form, setForm] = useState({ company: "", name: "", email: "", phone: "", website: "", type: "", resale: "", volume: "", message: "", trap: "" });
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply>(null);
  const f = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value }) });
  if (reply?.ok) {
    return (
      <div className={s.step}>
        <h2>Application sent</h2>
        <Note reply={reply} testId="trade-apply-reply" />
      </div>
    );
  }
  return (
    <form
      className={s.step}
      aria-labelledby="trade-apply"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void send(`/p/${slug}/trade/apply`, { ...form, token }, say).then((r) => {
          setBusy(false);
          setReply(r);
        });
      }}
    >
      <h2 id="trade-apply">{say("Apply for a trade account", "Apply for a corporate account")}</h2>
      <p className={s.note}>{intro || say("Contractors, designers and resellers get trade prices across the shop once approved.", "Local employers buy memberships and class packs for their staff at corporate prices once approved.")}</p>
      <div className={s.row2}>
        <label className={s.field}>
          Company
          <input className={s.input} autoComplete="organization" required maxLength={160} {...f("company")} data-testid="trade-company" />
        </label>
        <label className={s.field}>
          Your name
          <input className={s.input} autoComplete="name" required maxLength={120} {...f("name")} data-testid="trade-name" />
        </label>
      </div>
      <div className={s.row2}>
        <label className={s.field}>
          Email
          <input className={s.input} type="email" autoComplete="email" required maxLength={254} {...f("email")} data-testid="trade-email" />
        </label>
        <label className={s.field}>
          Phone <span>Optional</span>
          <input className={s.input} type="tel" autoComplete="tel" maxLength={40} {...f("phone")} />
        </label>
      </div>
      <div className={s.row2}>
        <label className={s.field}>
          Website <span>Optional</span>
          <input className={s.input} type="url" inputMode="url" maxLength={200} placeholder="https://" {...f("website")} />
        </label>
        <label className={s.field}>
          Type of business <span>Optional</span>
          <input className={s.input} maxLength={120} placeholder={say("Builder, designer, retailer", "Office, school, clinic")} {...f("type")} />
        </label>
      </div>
      <div className={s.row2}>
        <label className={s.field}>
          {say("Resale number", "How many people work there")} <span>Optional</span>
          <input className={s.input} maxLength={60} {...f("resale")} />
        </label>
        <label className={s.field}>
          {say("Expected yearly volume", "What you'd like to buy")} <span>Optional</span>
          <input className={s.input} maxLength={120} placeholder={say("", "Memberships for staff, class packs") || undefined} {...f("volume")} />
        </label>
      </div>
      <label className={s.field}>
        Anything else? <span>Optional</span>
        <textarea className={s.input} maxLength={2000} {...f("message")} />
      </label>
      {/* People never see this field. Bots fill it in. */}
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className={s.trap} {...f("trap")} />
      <Note reply={reply} testId="trade-apply-reply" />
      <button type="submit" className={s.button} disabled={busy} data-testid="trade-apply-send">
        {busy ? "Sending" : "Send the application"}
      </button>
    </form>
  );
}
