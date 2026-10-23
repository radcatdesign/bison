import { connection } from "next/server";
import { demoMode } from "@/lib/env";
import { buildSitemap } from "@/lib/marketing/search";
import { searchContextBySlug } from "@/lib/marketing/search-load";

// Every published landing page of one company. Public.
export async function GET(_req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  const { tenant } = await params;
  const c = demoMode() ? null : await searchContextBySlug(tenant);
  if (!c) return new Response("Not found.", { status: 404 });
  return new Response(buildSitemap(c), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900" } });
}
