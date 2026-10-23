import { secureCookies } from "@/lib/env";
import { tradeCookieName } from "@/lib/sales/trade";

// Signs a trade buyer out on this browser. A form post from the shop, so a
// link elsewhere can't do it.
export async function POST(_req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const slug = tenant.replace(/[^a-z0-9-]/g, "");
  const res = new Response(null, { status: 303, headers: { location: `/p/${slug}/shop`, "cache-control": "no-store" } });
  res.headers.append("set-cookie", [`${tradeCookieName(slug)}=`, `Path=/p/${slug}`, "Max-Age=0", "HttpOnly", "SameSite=Lax", ...(secureCookies() ? ["Secure"] : [])].join("; "));
  return res;
}
