import { connection } from "next/server";
import { demoMode } from "@/lib/env";
import { buildLlmsTxt } from "@/lib/marketing/search";
import { searchContextBySlug } from "@/lib/marketing/search-load";

// A short, plain summary of one company for AI assistants (llmstxt.org). Public.
export async function GET(_req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  const { tenant } = await params;
  const c = demoMode() ? null : await searchContextBySlug(tenant);
  if (!c) return new Response("Not found.", { status: 404 });
  return new Response(buildLlmsTxt(c), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=900" } });
}
