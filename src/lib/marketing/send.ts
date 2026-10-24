import "server-only";
// Turning a queued send into a real email: the right content, the person's name
// and welcome code, their own unsubscribe link (in the footer and in the
// List-Unsubscribe headers mail apps use for one-click unsubscribe), and the
// company's verified From address.
import type { Tx } from "@/lib/db";
import type { EmailSendKind } from "@/lib/db/types";
import { appUrl } from "@/lib/env";
import type { EmailProvider, OutgoingEmail } from "@/lib/email/provider";
import { mergeLine, renderEmail } from "@/lib/email/render";
import { type EmailDoc, emailDocSchema } from "@/lib/email/schema";
import { unsubscribeUrls } from "@/lib/email/tokens";
import { fromAddress, headerName, readSending, type SendingState } from "./sending";
import { type MarketingSettings, offerTerms } from "./settings";
import { getMarketingSettings, type TenantInfo, tenantInfo } from "./store";

export type SendSetup = { info: TenantInfo; settings: MarketingSettings; sending: SendingState; from: string | null };

export async function loadSendSetup(tx: Tx): Promise<SendSetup> {
  const info = await tenantInfo(tx);
  const settings = await getMarketingSettings(tx, info);
  const sending = await readSending(tx);
  return { info, settings, sending, from: fromAddress(sending, settings.brand) };
}

/** Why this company can't send to its list right now, in words for the team. Null when it can. */
export function sendBlocker(setup: SendSetup): string | null {
  if (!setup.from) return "Your sending domain isn't verified yet. Finish it in Settings, Email sending.";
  if (!setup.settings.brand.address.trim()) return "Add your postal address in the brand kit. Every marketing email has to show one.";
  return null;
}

export function readDoc(value: unknown): EmailDoc | null {
  const parsed = emailDocSchema.safeParse(typeof value === "string" ? JSON.parse(value) : value);
  return parsed.success ? parsed.data : null;
}

export type Content = { doc: EmailDoc; subject: string; preheader: string; campaign: string };
export type Recipient = { sendId: string; email: string; name: string; kind: EmailSendKind };
export type OfferCode = { code: string; discount_kind: "percent" | "amount"; discount: string | number; expires_at: Date | null };

export function cleanSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, " ").trim().slice(0, 200);
}

/** One person's email, ready for the provider. */
export function compose(setup: SendSetup, from: string, content: Content, to: Recipient, offer: OfferCode | null, issuedAt = Date.now()): OutgoingEmail {
  const links = unsubscribeUrls(to.sendId, issuedAt);
  const base = appUrl();
  const fine = setup.settings.offer.fine;
  const merge = (line: string) => mergeLine(line, { name: to.name, business: setup.settings.brand.businessName, fallback: content.doc.fallbackName });
  const subject = merge(content.subject);
  const { html, text } = renderEmail({
    doc: content.doc,
    brand: setup.settings.brand,
    subject,
    preheader: merge(content.preheader),
    person: { name: to.name, email: to.email },
    offer: offer ? { code: offer.code, terms: offerTerms({ kind: offer.discount_kind, value: Number(offer.discount), fine }, offer.expires_at, setup.info.timezone, setup.info.edition) } : null,
    unsubscribeUrl: links.page,
    baseUrl: base,
    utm: { source: to.kind === "series" ? "email-series" : "newsletter", campaign: content.campaign, hosts: [...setup.info.domains, new URL(base).hostname] },
  });
  const brand = setup.settings.brand;
  return {
    from,
    to: to.email,
    replyTo: brand.replyTo || undefined,
    subject: cleanSubject(to.kind === "test" ? `[Test] ${subject}` : subject) || headerName(brand.businessName),
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${links.oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      // Keeps mail apps from folding separate sends into one thread.
      "X-Entity-Ref-ID": to.sendId,
    },
    tags: [
      { name: "tenant", value: setup.info.id },
      { name: "send", value: to.sendId },
      { name: "kind", value: to.kind },
    ],
  };
}

export type SendOutcome = { ok: true; providerId: string } | { ok: false; error: string; retry: boolean };

/** Sends a batch through the provider. Never throws. */
export async function deliver(provider: EmailProvider, emails: OutgoingEmail[], key: string): Promise<SendOutcome[]> {
  try {
    return await provider.sendBatch(emails, key);
  } catch (err) {
    return emails.map(() => ({ ok: false, error: err instanceof Error ? err.message.slice(0, 300) : "The email provider failed.", retry: true }));
  }
}
