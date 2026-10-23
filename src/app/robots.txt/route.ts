import { connection } from "next/server";
import { demoMode } from "@/lib/env";
import { AI_BOTS } from "@/lib/marketing/search";
import { aiBlockedSlugs } from "@/lib/marketing/search-load";

// The dashboard's robots.txt. Only published landing pages (/p/) are for
// search engines. Companies that turned off AI crawlers are listed for each
// AI crawler by name, since those crawlers read only their own group.
export async function GET() {
  await connection();
  const lines = ["User-agent: *", "Allow: /p/", "Disallow: /", ""];
  const blocked = demoMode() ? [] : await aiBlockedSlugs().catch(() => []);
  if (blocked.length) {
    for (const bot of AI_BOTS) {
      lines.push(`User-agent: ${bot}`, "Allow: /p/", "Disallow: /", ...blocked.map((slug) => `Disallow: /p/${slug}/`), "");
    }
  }
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
