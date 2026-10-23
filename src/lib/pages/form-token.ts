import "server-only";
// A signed note of when a page's form was shown, so the server (not the
// browser) decides whether a send came too fast to be a person.
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseKeyring } from "@/lib/crypto/secrets";

const TOO_FAST_MS = 1500;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function sign(key: Buffer, pageId: string, issuedAt: number): string {
  return createHmac("sha256", key).update(`page-form:${pageId}:${issuedAt}`).digest("base64url");
}

export function formToken(pageId: string, issuedAt = Date.now()): string {
  const ring = parseKeyring();
  return `v${ring.active}.${issuedAt}.${sign(ring.keys.get(ring.active)!, pageId, issuedAt)}`;
}

export type TokenCheck = "ok" | "missing" | "too-fast" | "expired";

export function checkFormToken(token: unknown, pageId: string, now = Date.now()): TokenCheck {
  if (typeof token !== "string") return "missing";
  const m = /^v(\d+)\.(\d{10,16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return "missing";
  const key = parseKeyring().keys.get(Number(m[1]));
  if (!key) return "missing";
  const issuedAt = Number(m[2]);
  const expected = Buffer.from(sign(key, pageId, issuedAt));
  const given = Buffer.from(m[3]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "missing";
  if (now - issuedAt < TOO_FAST_MS) return "too-fast";
  if (now - issuedAt > MAX_AGE_MS) return "expired";
  return "ok";
}
