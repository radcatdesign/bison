import { demoMode, secureCookies } from "@/lib/env";
import { loadShop } from "@/lib/sales/shop";
import { sameOrigin } from "@/lib/sales/shop-http";
import { TRADE_SESSION_DAYS, tradeCookieName } from "@/lib/sales/trade";
import { enterTrade } from "@/lib/sales/trade-public";

// Signs a trade buyer in on this browser, from the button on the sign-in link's
// page. A same-site form post, so another site can't sign someone in or out.
// The cookie is for this shop's pages only.
export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!sameOrigin(req)) return new Response("Not allowed.", { status: 403 });
  const shop = demoMode() ? null : await loadShop(tenant);
  if (!shop) return new Response("Not found.", { status: 404 });
  const form = await req.formData().catch(() => null);
  const t = form?.get("t");
  const session = await enterTrade(shop.tenantId, typeof t === "string" ? t.slice(0, 300) : null);
  const res = new Response(null, { status: 303, headers: { location: session ? `/p/${shop.slug}/shop?trade=1` : `/p/${shop.slug}/trade?link=old`, "cache-control": "no-store" } });
  if (session) res.headers.append("set-cookie", [`${tradeCookieName(shop.slug)}=${session}`, `Path=/p/${shop.slug}`, `Max-Age=${TRADE_SESSION_DAYS * 86_400}`, "HttpOnly", "SameSite=Lax", ...(secureCookies() ? ["Secure"] : [])].join("; "));
  return res;
}
