import { demoMode } from "@/lib/env";
import { submitPageForm } from "@/lib/pages/submit";

// Form sends from a published landing page. Public: no session, and the page
// itself decides which fields are accepted.
export async function POST(req: Request, { params }: { params: Promise<{ tenant: string; slug: string }> }) {
  if (demoMode()) return Response.json({ message: "This is a demo, so forms don't send." }, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > 20_000) return Response.json({ message: "That's too much text for one form." }, { status: 413 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ message: "Couldn't read the form. Reload the page and try again." }, { status: 400 });
  }
  const { tenant, slug } = await params;
  try {
    const result = await submitPageForm(tenant, slug, (body ?? {}) as Record<string, unknown>);
    return Response.json({ message: result.message }, { status: result.ok ? 200 : result.status });
  } catch (err) {
    console.error("page form failed", err);
    return Response.json({ message: "Something went wrong on our side, so this wasn't sent. Try again in a minute." }, { status: 500 });
  }
}
