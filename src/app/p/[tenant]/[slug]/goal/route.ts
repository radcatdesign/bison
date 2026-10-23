import { demoMode } from "@/lib/env";
import { getPublishedPage } from "@/lib/pages/repo";
import { fromSameSite, recordGoal, visitorFrom } from "@/lib/pages/tests";
import { addressKey, allow } from "@/lib/rate-limit";

// A button click on a landing page in an A/B test that counts clicks. The page
// sends one beacon per visit, with the version it showed. Public: no session.
// It only marks a visit already counted for that visitor and version, and
// always answers 204, so it tells a caller nothing about the page or the test.
const done = () => new Response(null, { status: 204 });
const MAX_BYTES = 500;

async function readSmall(req: Request): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(req: Request, { params }: { params: Promise<{ tenant: string; slug: string }> }) {
  if (demoMode()) return done();
  const { tenant, slug } = await params;
  const who = visitorFrom(req.headers);
  if (who.team || !fromSameSite(req.headers, new URL(req.url).host)) return done();
  if (!allow(`page-goal:${addressKey(who.ip)}`, 30, 60 * 60 * 1000) || !allow(`page-goal:${tenant}/${slug}`, 5_000, 60 * 60 * 1000)) return done();
  const text = await readSmall(req);
  if (!text) return done();
  let version: unknown = null;
  try {
    version = (JSON.parse(text) as { version?: unknown })?.version;
  } catch {
    return done();
  }
  try {
    const page = await getPublishedPage(tenant, slug);
    if (page) await recordGoal(page.tenantId, page.pageId, "click", version, who);
  } catch (err) {
    console.error("counting a page click failed", err);
  }
  return done();
}
