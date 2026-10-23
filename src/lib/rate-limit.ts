// A small in-memory limiter. Each server instance counts on its own, so it's a
// speed bump for the public demo, not a billing control.
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 10_000;

/** Drops finished windows first, then the oldest tenth, so a flood of new keys can't wipe everyone's counts. */
function prune(now: number) {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  if (buckets.size < MAX_BUCKETS) return;
  let drop = Math.ceil(MAX_BUCKETS / 10);
  for (const k of buckets.keys()) {
    if (drop-- <= 0) break;
    buckets.delete(k);
  }
}

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) prune(now);
    buckets.delete(key);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

/** The visitor's address. Vercel sets x-real-ip itself; x-forwarded-for is the fallback elsewhere. */
export function clientIp(req: Request): string {
  return req.headers.get("x-real-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
