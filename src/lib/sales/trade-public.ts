import "server-only";
// The shop's trade pages: applying for an account, asking for a sign-in link,
// and turning a link into a session on this browser. Public requests, so each
// one works inside the shop's company and answers without saying whether an
// email has an account.
import { type Database, db, withTenant } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { checkFormToken } from "@/lib/pages/form-token";
import { salesSender, sendOne, tradeApplicationEmail, tradeLinkEmail } from "./emails";
import { getSalesSettings } from "./store";
import { applyForTrade, checkTradeToken, TradeError, tradeLinkUrl, tradeSessionToken } from "./trade";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const tradeFormKey = (tenantId: string) => `trade:${tenantId}`;

export const LINK_SENT = "If that email has an approved trade account, a sign-in link is on its way. It works for 24 hours.";

export type ApplyInput = { token: unknown; company: unknown; name: unknown; email: unknown; phone: unknown; website: unknown; type: unknown; resale: unknown; volume: unknown; message: unknown; trap?: unknown };

export const APPLIED = "Thanks. We'll review your application and email you.";

export async function submitTradeApplication(tenantId: string, slug: string, input: ApplyInput, database: Database = db()): Promise<{ ok: boolean; message: string; status?: number }> {
  // A hidden field people never see. Anything in it is a bot; answer as if it worked.
  if (clean(input.trap, 200)) return { ok: true, message: APPLIED };
  const t = checkFormToken(input.token, tradeFormKey(tenantId));
  if (t === "too-fast") return { ok: false, message: "That was quick. Wait a second and send it again.", status: 400 };
  if (t !== "ok") return { ok: false, message: "This form timed out. Reload the page and send it again.", status: 400 };
  const a = {
    company: clean(input.company, 160),
    name: clean(input.name, 120),
    email: clean(input.email, 254).toLowerCase(),
    phone: clean(input.phone, 40),
    website: clean(input.website, 200),
    details: { type: clean(input.type, 120), resale: clean(input.resale, 60), volume: clean(input.volume, 120), message: clean(input.message, 2000) },
  };
  if (!a.company) return { ok: false, message: "Enter your company's name.", status: 400 };
  if (!a.name) return { ok: false, message: "Enter your name.", status: 400 };
  if (!EMAIL.test(a.email)) return { ok: false, message: "Enter a full email address.", status: 400 };
  const r = await withTenant(
    { tenantId, userId: "public:trade" },
    async (tx) => {
      const settings = await getSalesSettings(tx);
      if (!settings.trade.open) throw new TradeError("We aren't taking trade applications right now.");
      const saved = await applyForTrade(tx, a);
      return { saved, to: settings.store.alertEmails, sender: await salesSender(tx) };
    },
    database,
  );
  // The answer is the same whatever the email's account looks like, so the form can't be used to find out.
  // Someone approved already gets a sign-in link in their own inbox instead.
  if (r.saved.status === "approved") {
    await requestTradeLink(tenantId, slug, a.email, database);
    return { ok: true, message: APPLIED };
  }
  if (r.to.length && r.saved.status === "applied") {
    const mail = r.sender ? tradeApplicationEmail(r.sender, { ...a, url: `${appUrl()}/sales/trade?id=${r.saved.id}` }) : { subject: "", html: "", text: "" };
    await sendOne(r.sender, { to: r.to.join(","), replyTo: a.email, ...mail, kind: "trade-application", ref: r.saved.id }, `bison/trade-apply/${r.saved.id}/${Date.now()}`);
  }
  return { ok: true, message: APPLIED };
}

/** Emails a sign-in link when the address belongs to an approved account. Says the same thing either way. */
export async function requestTradeLink(tenantId: string, slug: string, emailInput: unknown, database: Database = db()): Promise<{ ok: boolean; message: string }> {
  const email = clean(emailInput, 254).toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, message: "Enter the email on your trade account." };
  const r = await withTenant(
    { tenantId, userId: "public:trade" },
    async (tx) => ({
      a: await tx.selectFrom("trade_accounts").select(["id", "company", "contact_name", "status", "session_version"]).where("email", "=", email).executeTakeFirst(),
      sender: await salesSender(tx),
    }),
    database,
  );
  if (r.a?.status === "approved") {
    const mail = r.sender ? tradeLinkEmail(r.sender, { company: r.a.company, name: r.a.contact_name, url: tradeLinkUrl(slug, r.a.id, r.a.session_version), approved: false }) : { subject: "", html: "", text: "" };
    // One link a minute per account, whatever is clicked.
    await sendOne(r.sender, { to: email, ...mail, kind: "trade-link", ref: r.a.id }, `bison/trade-link/${r.a.id}/${Math.floor(Date.now() / 60_000)}`);
  }
  return { ok: true, message: LINK_SENT };
}

/** The company a sign-in link is for, to show before signing in. Null when the link is old or the account isn't approved. */
export async function tradeLinkCompany(tenantId: string, token: unknown, database: Database = db()): Promise<string | null> {
  return withTenant(
    { tenantId, userId: "public:trade" },
    async (tx) => {
      const ok = await checkTradeToken(tx, "link", token);
      if (!ok) return null;
      return (await tx.selectFrom("trade_accounts").select("company").where("id", "=", ok.id).executeTakeFirst())?.company ?? null;
    },
    database,
  );
}

/** A sign-in link's session token for the cookie, or null when the link is old or the account isn't approved. */
export async function enterTrade(tenantId: string, token: unknown, database: Database = db()): Promise<string | null> {
  const ok = await withTenant({ tenantId, userId: "public:trade" }, (tx) => checkTradeToken(tx, "link", token), database);
  return ok ? tradeSessionToken(ok.id, ok.version) : null;
}
