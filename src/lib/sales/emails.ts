import "server-only";
// Sales email: estimates to clients, trade sign-in links, and alerts to the
// team (paid orders, estimate replies, quote requests, trade applications).
// These are one-to-one messages about something the person did, not marketing,
// so they skip the subscriber list. Every send records who it went to, when and
// the provider's id, or the exact error, so a missing alert is obvious.
import type { Tx } from "@/lib/db";
import { emailProvider, type OutgoingEmail } from "@/lib/email/provider";
import { esc } from "@/lib/email/render";
import type { BrandKit } from "@/lib/email/schema";
import { headerName, isVerified, readSending } from "@/lib/marketing/sending";
import { getMarketingSettings, tenantInfo } from "@/lib/marketing/store";
import { formatMoney } from "./money";
import { addressLines, type Address } from "./settings";
import type { Delivery } from "./types";

export type Sender = { from: string; brand: BrandKit; tenantName: string; tenantId: string };

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i;

/**
 * Who Sales email comes from: the company's own verified domain (set up once in
 * Settings, Email sending), or Bison Ops' own address with the company's name
 * while that isn't done. Null when neither exists.
 */
export async function salesSender(tx: Tx): Promise<Sender | null> {
  const info = await tenantInfo(tx);
  const settings = await getMarketingSettings(tx, info);
  const sending = await readSending(tx);
  const brand = settings.brand;
  if (isVerified(sending)) return { from: `"${headerName(brand.fromName || brand.businessName || info.name)}" <${sending.fromLocal}@${sending.domain}>`, brand, tenantName: info.name, tenantId: info.id };
  const fallback = process.env.EMAIL_FALLBACK_FROM?.trim().replace(/^.*<([^>]+)>.*$/, "$1");
  if (fallback && EMAIL.test(fallback)) return { from: `"${headerName(brand.fromName || info.name)}" <${fallback}>`, brand, tenantName: info.name, tenantId: info.id };
  return null;
}

export const NO_SENDER = "Email isn't set up yet. Add your domain in Settings, Email sending, and this will send.";

/** Sends one email and says what happened. Never throws. */
export async function sendOne(sender: Sender | null, email: Omit<OutgoingEmail, "from" | "headers" | "tags"> & { kind: string; ref: string }, key: string): Promise<Delivery> {
  const at = new Date().toISOString();
  const to = email.to.split(",").map((x) => x.trim()).filter(Boolean);
  if (!sender) return { to, at, error: NO_SENDER };
  const provider = emailProvider();
  if (!provider) return { to, at, error: "Email sending isn't switched on for this Bison Ops server (no RESEND_API_KEY)." };
  try {
    const out: OutgoingEmail = {
      from: sender.from,
      to: email.to,
      replyTo: email.replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: { "X-Entity-Ref-ID": email.ref },
      tags: [
        { name: "tenant", value: sender.tenantId },
        { name: "kind", value: email.kind },
      ],
    };
    const [r] = await provider.sendBatch([out], key);
    return r.ok ? { to, at, providerId: r.providerId } : { to, at, error: r.error };
  } catch (err) {
    return { to, at, error: err instanceof Error ? err.message.slice(0, 300) : "The email provider failed." };
  }
}

// ---- Layout -------------------------------------------------------------------------

type Block = { kind: "p"; text: string } | { kind: "button"; label: string; href: string } | { kind: "table"; rows: [string, string][]; total?: [string, string] } | { kind: "note"; text: string } | { kind: "small"; text: string };

function render(brand: BrandKit, title: string, blocks: Block[]): { html: string; text: string } {
  const c = brand.colors;
  const radius = brand.buttonShape === "pill" ? "999px" : brand.buttonShape === "square" ? "0" : "8px";
  const font = "Helvetica, Arial, sans-serif";
  const body = blocks
    .map((b) => {
      if (b.kind === "p") return `<p style="margin:0 0 16px;font:16px/1.55 ${font};color:${c.text}">${esc(b.text).replace(/\n/g, "<br>")}</p>`;
      if (b.kind === "small") return `<p style="margin:0 0 12px;font:13px/1.5 ${font};color:${c.smallPrint}">${esc(b.text).replace(/\n/g, "<br>")}</p>`;
      if (b.kind === "note") return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px"><tr><td style="background:${c.highlight};border-radius:8px;padding:14px 16px;font:15px/1.5 ${font};color:${c.text}">${esc(b.text).replace(/\n/g, "<br>")}</td></tr></table>`;
      if (b.kind === "button") return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 22px"><tr><td style="background:${c.accent};border-radius:${radius}"><a href="${esc(b.href)}" style="display:inline-block;padding:13px 22px;font:bold 15px ${font};color:${c.buttonText};text-decoration:none">${esc(b.label)}</a></td></tr></table>`;
      const rows = b.rows.map(([l, r]) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${c.lines};font:15px/1.4 ${font};color:${c.text}">${esc(l)}</td><td align="right" style="padding:8px 0 8px 12px;border-bottom:1px solid ${c.lines};font:15px/1.4 ${font};color:${c.text};white-space:nowrap">${esc(r)}</td></tr>`).join("");
      const total = b.total ? `<tr><td style="padding:10px 0;font:bold 16px ${font};color:${c.headings}">${esc(b.total[0])}</td><td align="right" style="padding:10px 0 10px 12px;font:bold 16px ${font};color:${c.headings};white-space:nowrap">${esc(b.total[1])}</td></tr>` : "";
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px">${rows}${total}</table>`;
    })
    .join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${c.background}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${c.background}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:${c.body};border-radius:12px">
<tr><td style="padding:22px 28px 6px;font:bold 15px ${font};color:${c.headerText}">${esc(brand.businessName)}</td></tr>
<tr><td style="padding:12px 28px 14px"><h1 style="margin:0 0 18px;font:bold 22px/1.3 ${font};color:${c.headings}">${esc(title)}</h1>
${body}
</td></tr></table>
${brand.address ? `<p style="margin:16px 0 0;font:12px/1.5 ${font};color:${c.smallPrint}">${esc(brand.businessName)}, ${esc(brand.address)}</p>` : ""}
</td></tr></table></body></html>`;
  const text = [
    brand.businessName,
    "",
    title,
    "",
    ...blocks.flatMap((b) => {
      if (b.kind === "p" || b.kind === "note" || b.kind === "small") return [b.text, ""];
      if (b.kind === "button") return [`${b.label}: ${b.href}`, ""];
      return [...b.rows.map(([l, r]) => `${l}  ${r}`), ...(b.total ? [`${b.total[0]}  ${b.total[1]}`] : []), ""];
    }),
  ].join("\n");
  return { html, text };
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "";

// ---- To clients ---------------------------------------------------------------------

export function estimateEmail(s: Sender, e: { number: number; title: string; clientName: string; totalCents: number; currency: string; validUntil: string | null; url: string; message: string; resend: boolean }) {
  const greeting = firstName(e.clientName) ? `Hi ${firstName(e.clientName)},` : "Hi,";
  const valid = e.validUntil ? new Date(`${e.validUntil}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
  const title = `${e.resend ? "Your updated estimate" : "Your estimate"} from ${s.brand.businessName}`;
  const { html, text } = render(s.brand, title, [
    { kind: "p", text: greeting },
    { kind: "p", text: e.message.trim() || `Here's estimate #${e.number}${e.title ? ` for ${e.title}` : ""}. You can approve it or ask for changes on its page.` },
    { kind: "table", rows: [], total: ["Total", formatMoney(e.totalCents, e.currency)] },
    { kind: "button", label: "View the estimate", href: e.url },
    ...(valid ? [{ kind: "small" as const, text: `It's good until ${valid}.` }] : []),
    { kind: "small", text: s.brand.signOff || `Thanks,\n${s.brand.businessName}` },
  ]);
  return { subject: `${title}${e.title ? `: ${e.title}` : ""}`.slice(0, 150), html, text };
}

export function tradeLinkEmail(s: Sender, t: { company: string; name: string; url: string; approved: boolean }) {
  const title = t.approved ? `Your trade account with ${s.brand.businessName} is approved` : `Sign in to your ${s.brand.businessName} trade account`;
  const { html, text } = render(s.brand, title, [
    { kind: "p", text: firstName(t.name) ? `Hi ${firstName(t.name)},` : "Hi," },
    { kind: "p", text: t.approved ? `${t.company} can now buy at trade prices. Use the button to sign in; you'll see your prices across the shop.` : "Use the button to sign in. You'll see your trade prices across the shop." },
    { kind: "button", label: "Sign in to see trade prices", href: t.url },
    { kind: "small", text: "The link works for 24 hours and signs you in on this device for 30 days. If you didn't ask for it, you can ignore this email." },
  ]);
  return { subject: title, html, text };
}

// ---- To the team ----------------------------------------------------------------------

export function orderAlertEmail(s: Sender, o: { number: number; name: string; email: string; phone: string; items: { name: string; variant: string; qty: number; lineCents: number }[]; subtotalCents: number; discountCents: number; discountCode: string; shippingCents: number; shippingService: string; taxCents: number; totalCents: number; currency: string; shipTo: Partial<Address>; orderUrl: string; paymentUrl: string | null; trade: string | null }) {
  const money = (n: number) => formatMoney(n, o.currency);
  const title = `New order #${o.number}, ${money(o.totalCents)}`;
  const rows: [string, string][] = o.items.map((i) => [`${i.qty} × ${i.name}${i.variant ? ` (${i.variant})` : ""}`, money(i.lineCents)]);
  rows.push(["Subtotal", money(o.subtotalCents)]);
  if (o.discountCents) rows.push([o.discountCode ? `Discount (${o.discountCode})` : "Discount", `−${money(o.discountCents)}`]);
  rows.push([o.shippingService ? `Shipping, ${o.shippingService}` : "Shipping", o.shippingCents ? money(o.shippingCents) : "Free"]);
  if (o.taxCents) rows.push(["Tax", money(o.taxCents)]);
  const { html, text } = render(s.brand, title, [
    { kind: "p", text: `${o.name || o.email} just paid${o.trade ? `, on the ${o.trade} trade account` : ""}.` },
    { kind: "table", rows, total: ["Total", money(o.totalCents)] },
    { kind: "note", text: `Ship to:\n${addressLines(o.shipTo).join("\n") || "No address given"}\n\n${o.email}${o.phone ? `\n${o.phone}` : ""}` },
    { kind: "button", label: "Open the order", href: o.orderUrl },
    ...(o.paymentUrl ? [{ kind: "small" as const, text: `The payment in Stripe: ${o.paymentUrl}` }] : []),
  ]);
  return { subject: title, html, text };
}

export function estimateReplyEmail(s: Sender, e: { number: number; clientName: string; kind: "approved" | "changes_requested" | "declined"; detail: string; totalCents: number; currency: string; url: string; invoiced: boolean }) {
  const who = e.clientName || "Your client";
  const title = e.kind === "approved" ? `Estimate #${e.number} approved` : e.kind === "declined" ? `Estimate #${e.number} declined` : `Changes requested on estimate #${e.number}`;
  const line = e.kind === "approved" ? `${who} approved it, signing as ${e.detail}.${e.invoiced ? " The invoice went out with a Pay link." : " Connect Stripe in Settings, Payments to send invoices automatically."}` : e.kind === "declined" ? `${who} declined it.` : `${who} asked for changes:`;
  const { html, text } = render(s.brand, title, [
    { kind: "p", text: line },
    ...(e.kind !== "approved" && e.detail ? [{ kind: "note" as const, text: e.detail }] : []),
    { kind: "table", rows: [], total: ["Total", formatMoney(e.totalCents, e.currency)] },
    { kind: "button", label: "Open the estimate", href: e.url },
  ]);
  return { subject: title, html, text };
}

export function estimatePaidEmail(s: Sender, e: { number: number; clientName: string; totalCents: number; currency: string; url: string; orderNumber: number | null }) {
  const title = `Estimate #${e.number} paid, ${formatMoney(e.totalCents, e.currency)}`;
  const { html, text } = render(s.brand, title, [{ kind: "p", text: `${e.clientName || "Your client"} paid the invoice.${e.orderNumber ? ` It's order #${e.orderNumber} now.` : ""}` }, { kind: "button", label: "Open the estimate", href: e.url }]);
  return { subject: title, html, text };
}

export function inquiryAlertEmail(s: Sender, q: { name: string; email: string; phone: string; message: string; items: { name: string; variant: string; qty: number; lineCents: number }[]; subtotalCents: number; currency: string; url: string }) {
  const title = `Quote request from ${q.name || q.email}, ${formatMoney(q.subtotalCents, q.currency)}`;
  const { html, text } = render(s.brand, title, [
    { kind: "p", text: "Their cart was over your order limit, so it came to you as a quote request. It's saved as a draft estimate." },
    { kind: "table", rows: q.items.map((i) => [`${i.qty} × ${i.name}${i.variant ? ` (${i.variant})` : ""}`, formatMoney(i.lineCents, q.currency)]), total: ["Cart total", formatMoney(q.subtotalCents, q.currency)] },
    ...(q.message ? [{ kind: "note" as const, text: q.message }] : []),
    { kind: "small", text: `${q.email}${q.phone ? `\n${q.phone}` : ""}` },
    { kind: "button", label: "Open the draft estimate", href: q.url },
  ]);
  return { subject: title, html, text };
}

export function tradeApplicationEmail(s: Sender, t: { company: string; name: string; email: string; phone: string; details: Record<string, string>; url: string }) {
  const title = `Trade application from ${t.company}`;
  const rows: [string, string][] = [
    ["Contact", t.name || t.email],
    ["Email", t.email],
    ...(t.phone ? ([["Phone", t.phone]] as [string, string][]) : []),
    ...Object.entries(t.details)
      .filter(([, v]) => v)
      .map(([k, v]) => [k === "type" ? "Business type" : k === "resale" ? "Resale number" : k === "volume" ? "Expected volume" : k === "message" ? "Message" : k, v] as [string, string]),
  ];
  const { html, text } = render(s.brand, title, [{ kind: "p", text: "Someone applied for a trade account. Approve them and they'll get trade prices." }, { kind: "table", rows }, { kind: "button", label: "Review the application", href: t.url }]);
  return { subject: title, html, text };
}
