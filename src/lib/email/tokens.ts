import "server-only";
// Signed links in emails. An unsubscribe link carries one send's id, the time it
// was made, and an HMAC over both with the active SECRETS_KEYS key. No email
// address is ever in the URL.
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseKeyring } from "@/lib/crypto/secrets";
import { appUrl } from "@/lib/env";

/** Unsubscribing keeps working after this, as the law asks; the page just shows less. */
export const UNSUBSCRIBE_TOKEN_DAYS = 365;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function sign(key: Buffer, purpose: string, id: string, issuedAt: number): string {
  return createHmac("sha256", key).update(`${purpose}:${id}:${issuedAt}`).digest("base64url");
}

function make(purpose: string, id: string, issuedAt: number): string {
  const ring = parseKeyring();
  return `${ring.active}.${id}.${issuedAt.toString(36)}.${sign(ring.keys.get(ring.active)!, purpose, id, issuedAt)}`;
}

function check(purpose: string, token: unknown, maxDays: number, now: number): { id: string; issuedAt: number; expired: boolean } | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const m = /^(\d{1,4})\.([0-9a-f-]{36})\.([0-9a-z]{6,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m || !UUID.test(m[2])) return null;
  const key = parseKeyring().keys.get(Number(m[1]));
  if (!key) return null;
  const issuedAt = parseInt(m[3], 36);
  const expected = Buffer.from(sign(key, purpose, m[2], issuedAt));
  const given = Buffer.from(m[4]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (issuedAt > now + 60_000) return null;
  return { id: m[2], issuedAt, expired: now - issuedAt > maxDays * 86_400_000 };
}

/**
 * A signed link for any public page: estimates, trade sign-in, shared contacts.
 * `purpose` names the page and a version (like "estimate:v2"), so bumping the
 * version on the row retires every link made before it.
 */
export function signLink(purpose: string, id: string, issuedAt = Date.now()): string {
  return make(purpose, id, issuedAt);
}

export function checkLink(purpose: string, token: unknown, maxDays: number, now = Date.now()) {
  return check(purpose, token, maxDays, now);
}

/** The id inside a link, read without checking it, to look up which version to check against. */
export function linkId(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const m = /^\d{1,4}\.([0-9a-f-]{36})\.[0-9a-z]{6,12}\.[A-Za-z0-9_-]{43}$/.exec(token);
  return m && UUID.test(m[1]) ? m[1] : null;
}

export function unsubscribeToken(sendId: string, issuedAt = Date.now()): string {
  return make("unsubscribe", sendId, issuedAt);
}

export function checkUnsubscribeToken(token: unknown, now = Date.now()) {
  return check("unsubscribe", token, UNSUBSCRIBE_TOKEN_DAYS, now);
}

export function unsubscribeUrls(sendId: string, issuedAt = Date.now()): { page: string; oneClick: string } {
  const token = unsubscribeToken(sendId, issuedAt);
  const base = appUrl();
  return { page: `${base}/u/${token}`, oneClick: `${base}/u/${token}/one-click` };
}
