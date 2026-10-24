import "server-only";
// The kiosk's secrets: the tablet's token, the 6-digit pairing code and the
// staff PIN. None of them is stored as typed: the token as sha256, the code as
// an HMAC with the active SECRETS_KEYS key, the PIN as scrypt.
import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { parseKeyring } from "@/lib/crypto/secrets";
import { PIN_PATTERN } from "./settings";

export const KIOSK_COOKIE = "bo_kiosk";
/** Browsers keep a cookie at most 400 days; the tablet refreshes it as it's used. */
export const KIOSK_COOKIE_DAYS = 400;

export function newDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A cookie value that could be one of ours. Anything else isn't looked up. */
export const isDeviceToken = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);

export function newPairCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Six digits, with spaces or dashes people type dropped. */
export function cleanCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function codeHash(code: string): string {
  const ring = parseKeyring();
  return createHmac("sha256", ring.keys.get(ring.active)!).update(`kiosk-code:${code}`).digest("hex");
}

// ---- The staff PIN ---------------------------------------------------------------

const N = 16384;
const R = 8;
const P = 1;

function derive(pin: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(pin, salt, 32, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPin(pin: string): Promise<string> {
  if (!PIN_PATTERN.test(pin)) throw new Error("A PIN is 4 to 8 digits.");
  const salt = randomBytes(16);
  const key = await derive(pin, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function checkPin(pin: unknown, stored: string | null): Promise<boolean> {
  if (typeof pin !== "string" || !PIN_PATTERN.test(pin) || !stored) return false;
  const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(stored);
  if (!m) return false;
  const [n, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (n > 1 << 17 || r > 16 || p > 4) return false;
  const want = Buffer.from(m[5], "base64url");
  const got = await derive(pin, Buffer.from(m[4], "base64url"), n, r, p);
  return want.length === got.length && timingSafeEqual(want, got);
}
