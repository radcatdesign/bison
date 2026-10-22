// Signed cookie for the dev sign-in. HMAC-SHA256 over a small JSON payload.
// Only used for the made-up people: locally, in tests, and in the public demo.
import { createHmac, timingSafeEqual } from "node:crypto";
import { demoMode } from "@/lib/env";

export const DEV_SESSION_COOKIE = "bo_dev_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type DevSession = { u: string; t: string; exp: number };

// The demo has no database and only made-up people, so a forged demo cookie
// reaches nothing. It works without DEV_AUTH_SECRET so DEMO_MODE=1 is the only setting needed.
const DEMO_FALLBACK_SECRET = "bison-ops-public-demo-only";

function secret(): string {
  const s = process.env.DEV_AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (!s && demoMode()) return DEMO_FALLBACK_SECRET;
  throw new Error("DEV_AUTH_SECRET must be at least 16 characters.");
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createDevSession(userId: string, tenantId: string, now = Date.now()): { value: string; maxAge: number } {
  const body = Buffer.from(JSON.stringify({ u: userId, t: tenantId, exp: Math.floor(now / 1000) + MAX_AGE_SECONDS })).toString("base64url");
  return { value: `${body}.${sign(body)}`, maxAge: MAX_AGE_SECONDS };
}

export function readDevSession(value: string | undefined, now = Date.now()): DevSession | null {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DevSession;
    if (typeof parsed.u !== "string" || typeof parsed.t !== "string" || typeof parsed.exp !== "number") return null;
    // Dev sessions can only ever be made-up people, never a real Clerk user id.
    if (!parsed.u.startsWith("dev_")) return null;
    if (parsed.exp * 1000 < now) return null;
    return parsed;
  } catch {
    return null;
  }
}
