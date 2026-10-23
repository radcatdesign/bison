import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { accentInk } from "@/lib/color";
import { demoMode } from "@/lib/env";
import { viewUnsubscribe } from "@/lib/marketing/unsubscribe";
import { confirmUnsubscribe, undoUnsubscribe } from "./actions";
import s from "./unsubscribe.module.css";

// Where the Unsubscribe link in every email goes. Public. Opening it never
// unsubscribes by itself (link checkers open links); the button does.

export const metadata: Metadata = { title: { absolute: "Email preferences" }, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ back?: string }> };

async function Body({ params, searchParams }: Props) {
  const { token } = await params;
  const { back } = await searchParams;
  await connection();
  const view = demoMode() ? null : await viewUnsubscribe(token);

  if (!view) {
    return (
      <div className={s.card} data-testid="unsubscribe-invalid">
        <h1>This link isn&apos;t working</h1>
        <p>It may have been copied only in part. Use the Unsubscribe link at the bottom of any email from the company, or reply to it and ask them to take you off their list.</p>
      </div>
    );
  }

  if (view.unsubscribed) {
    return (
      <div className={s.card} data-testid="unsubscribed">
        <h1>You&apos;re unsubscribed</h1>
        <p>
          {view.maskedEmail} won&apos;t get any more marketing email from {view.business}. Anything already scheduled for you has been canceled.
        </p>
        {view.canResubscribe && (
          <form action={undoUnsubscribe}>
            <input type="hidden" name="token" value={token} />
            <p className={s.note}>Did that by mistake?</p>
            <button type="submit" className={s.secondary} data-testid="resubscribe">
              Subscribe again
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className={s.card} data-testid="unsubscribe-confirm">
      {back && <p className={s.ok}>You&apos;re subscribed again. Welcome back.</p>}
      <h1>Unsubscribe from {view.business}?</h1>
      <p>
        {view.maskedEmail} will stop getting their newsletters and email series. Emails about an order or a quote you asked for may still arrive.
      </p>
      <form action={confirmUnsubscribe}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={s.primary} style={{ background: view.accent, color: accentInk(view.accent) }} data-testid="confirm-unsubscribe">
          Unsubscribe
        </button>
      </form>
    </div>
  );
}

export default function UnsubscribePage(props: Props) {
  return (
    <main className={s.page}>
      <Suspense fallback={<div className={s.card} aria-busy="true" />}>
        <Body {...props} />
      </Suspense>
    </main>
  );
}
