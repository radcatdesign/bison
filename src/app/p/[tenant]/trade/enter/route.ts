import { connection } from "next/server";
import { demoMode, secureCookies } from "@/lib/env";
import { loadShop } from "@/lib/sales/shop";
import { TRADE_SESSION_DAYS, tradeCookieName } from "@/lib/sales/trade";
import { enterTrade } from "@/lib/sales/trade-public";

// Where a trade sign-in link lands. A good link sets a cookie for this shop
// only, then shows the shop at trade prices. Public.
export async function GET(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  const { tenant } = await params;
  const url = new URL(req.url);
  const shop = demoMode() ? null : await loadShop(tenant);
  if (!shop) return new Response("Not found.", { status: 404 });
  const session = await enterTrade(shop.tenantId, url.searchParams.get("t"));
  const to = new URL(session ? `/p/${shop.slug}/shop?trade=1` : `/p/${shop.slug}/trade?link=old`, url);
  const res = new Response(null, { status: 303, headers: { location: to.pathname + to.search, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  if (session) {
    const cookie = [`${tradeCookieName(shop.slug)}=${session}`, `Path=/p/${shop.slug}`, `Max-Age=${TRADE_SESSION_DAYS * 86_400}`, "HttpOnly", "SameSite=Lax", ...(secureCookies() ? ["Secure"] : [])];
    res.headers.append("set-cookie", cookie.join("; "));
  }
  return res;
}
