import { after } from "next/server";
import { demoMode } from "@/lib/env";
import { runEmailWork } from "@/lib/marketing/worker";
import { submitPageForm } from "@/lib/pages/submit";
import { recordGoal, visitorFrom } from "@/lib/pages/tests";
import { allow, clientIp } from "@/lib/rate-limit";

// Form sends from a published landing page. Public: no session, and the page
// itself decides which fields are accepted.
const MAX_BYTES = 20_000;

/** Reads the body but stops at MAX_BYTES, whatever Content-Length says. */
async function readLimited(req: Request): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
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
  if (demoMode()) return Response.json({ message: "This is a demo, so forms don't send." }, { status: 404 });
  const { tenant, slug } = await params;
  // Per server instance: a burst limit for one visitor on one page, and a ceiling for the page.
  if (!allow(`form:${clientIp(req)}:${tenant}/${slug}`, 8, 10 * 60 * 1000) || !allow(`form:${tenant}/${slug}`, 300, 60 * 60 * 1000)) {
    return Response.json({ message: "Too many sends in a short time. Try again in a few minutes." }, { status: 429 });
  }
  const text = await readLimited(req);
  if (text === null) return Response.json({ message: "That's too much text for one form." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ message: "Couldn't read the form. Reload the page and try again." }, { status: 400 });
  }
  try {
    const result = await submitPageForm(tenant, slug, (body ?? {}) as Record<string, unknown>);
    // Day 0 of a series goes right away, not whenever the job next runs.
    if (result.ok && result.queued && result.tenantId) after(() => runEmailWork({ tenantId: result.tenantId, budgetMs: 30_000 }).then(() => undefined));
    // A form send counts toward the page's A/B test, for the version they saw. Spam and the team's own sends don't.
    const who = visitorFrom(req.headers);
    const { tenantId, pageId } = result.ok ? result : { tenantId: undefined, pageId: undefined };
    if (result.ok && !result.spam && tenantId && pageId && !who.team) {
      const version = (body as { version?: unknown } | null)?.version;
      after(() => recordGoal(tenantId, pageId, "form", version, who).then(() => undefined, (err) => console.error("counting a page test goal failed", err)));
    }
    return Response.json({ message: result.message }, { status: result.ok ? 200 : result.status });
  } catch (err) {
    console.error("page form failed", err);
    return Response.json({ message: "Something went wrong on our side, so this wasn't sent. Try again in a minute." }, { status: 500 });
  }
}
