import "server-only";
// Shared by the kiosk's routes: the tablet's cookie, and reading a small JSON body.
import { cookies } from "next/headers";
import { secureCookies } from "@/lib/env";
import { isDeviceToken, KIOSK_COOKIE, KIOSK_COOKIE_DAYS } from "./secrets";
import { deviceFor, type KioskScope } from "./store";

/** The paired tablet this request comes from, checked against the database every time. */
export async function currentTablet(): Promise<{ token: string; scope: KioskScope } | null> {
  const token = (await cookies()).get(KIOSK_COOKIE)?.value;
  if (!isDeviceToken(token)) return null;
  const scope = await deviceFor(token);
  return scope ? { token, scope } : null;
}

/** Only the kiosk's own pages send it: httpOnly, same-site strict, for /kiosk only. */
export function tabletCookie(token: string | null): string {
  const parts = [`${KIOSK_COOKIE}=${token ?? ""}`, "Path=/kiosk", `Max-Age=${token ? KIOSK_COOKIE_DAYS * 86_400 : 0}`, "HttpOnly", "SameSite=Strict"];
  if (secureCookies()) parts.push("Secure");
  return parts.join("; ");
}

/** Reads the body but stops at `max` bytes, whatever Content-Length says. */
export async function readJson(req: Request, max: number): Promise<Record<string, unknown> | "too-big" | null> {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return "too-big";
    }
    chunks.push(value);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
