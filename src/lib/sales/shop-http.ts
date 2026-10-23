import "server-only";
// Shared pieces for the shop's public endpoints: a size-capped JSON body,
// per-visitor rate limits, and errors said the same way everywhere.
import { appUrl } from "@/lib/env";
import { allow, clientIp } from "@/lib/rate-limit";
import { CheckoutError } from "./checkout";
import { TradeError } from "./trade";

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** The body as JSON, or null when it's missing, too big or not JSON. */
export async function readBody(req: Request, maxBytes = 16_000): Promise<unknown> {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

const SLOW = (status = 429) => json({ ok: false, message: "That's a lot of requests in a short time. Wait a few minutes and try again." }, status);

/** A burst limit for one visitor, per server instance. Keyed on the visitor only, so made-up shop addresses don't make new counters. */
export function limited(req: Request, what: string, perVisitor: number, windowMs = 10 * 60 * 1000): Response | null {
  return allow(`shop:${what}:${clientIp(req)}`, perVisitor, windowMs) ? null : SLOW();
}

/** A ceiling for one real shop, for requests that email the team. Checked after the shop is found. */
export function shopCeiling(tenantId: string, what: string, perShop: number, windowMs = 60 * 60 * 1000): Response | null {
  return allow(`shop:${what}:t:${tenantId}`, perShop, windowMs) ? null : SLOW();
}

/** Turns an error into what the shopper should read. Anything unexpected is logged, not shown. */
export function failure(err: unknown, label: string): Response {
  if (err instanceof CheckoutError) return json({ ok: false, message: err.message }, err.status);
  if (err instanceof TradeError) return json({ ok: false, message: err.message }, 400);
  console.error(`shop ${label} failed`, err);
  return json({ ok: false, message: "Something went wrong on our side. Try again in a minute." }, 500);
}

/** A form post from this site, not from another one (CSRF). */
export function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(appUrl()).origin;
}

export const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
export const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
