import { demoMode } from "@/lib/env";
import { loadShop } from "@/lib/sales/shop";
import { failure, json, limited, obj, readBody, shopCeiling } from "@/lib/sales/shop-http";
import { requestTradeLink } from "@/lib/sales/trade-public";

// Emails a trade buyer a sign-in link. Public, and it answers the same whether
// or not the email has an account.
export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const slow = limited(req, "trade-link", 5, 60 * 60 * 1000);
  if (slow) return slow;
  const body = obj(await readBody(req, 2_000));
  if (demoMode()) return json({ ok: false, message: "This is a demo, so sign-in links don't send." }, 404);
  try {
    const shop = await loadShop(tenant);
    if (!shop) return json({ ok: false, message: "This shop isn't open." }, 404);
    const ceiling = shopCeiling(shop.tenantId, "trade-link", 100);
    if (ceiling) return ceiling;
    const r = await requestTradeLink(shop.tenantId, shop.slug, body.email, undefined, shop.edition);
    return json(r, r.ok ? 200 : 400);
  } catch (err) {
    return failure(err, "trade link");
  }
}
