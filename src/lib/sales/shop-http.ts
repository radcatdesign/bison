import "server-only";
// Shared pieces for the shop's public endpoints: a size-capped JSON body,
// per-visitor rate limits, and errors said the same way everywhere.
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

/** A burst limit for one visitor and a ceiling for the shop, per server instance. */
export function limited(req: Request, slug: string, what: string, perVisitor: number, perShop: number, windowMs = 10 * 60 * 1000): Response | null {
  if (!allow(`shop:${what}:${clientIp(req)}:${slug}`, perVisitor, windowMs) || !allow(`shop:${what}:${slug}`, perShop, windowMs)) {
    return json({ ok: false, message: "That's a lot of requests in a short time. Wait a few minutes and try again." }, 429);
  }
  return null;
}

/** Turns an error into what the shopper should read. Anything unexpected is logged, not shown. */
export function failure(err: unknown, label: string): Response {
  if (err instanceof CheckoutError) return json({ ok: false, message: err.message }, err.status);
  if (err instanceof TradeError) return json({ ok: false, message: err.message }, 400);
  console.error(`shop ${label} failed`, err);
  return json({ ok: false, message: "Something went wrong on our side. Try again in a minute." }, 500);
}

export const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
export const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
