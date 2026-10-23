import { demoMode } from "@/lib/env";
import { loadShop } from "@/lib/sales/shop";
import { failure, json, limited, obj, readBody, shopCeiling } from "@/lib/sales/shop-http";
import { submitTradeApplication } from "@/lib/sales/trade-public";

// A trade application from the shop (a corporate account for a club). Public.
export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const slow = limited(req, "trade-apply", 5, 60 * 60 * 1000);
  if (slow) return slow;
  const body = await readBody(req, 12_000);
  if (!body) return json({ ok: false, message: "Couldn't read the form. Reload the page and try again." }, 400);
  if (demoMode()) return json({ ok: false, message: "This is a demo, so applications don't send." }, 404);
  try {
    const shop = await loadShop(tenant);
    if (!shop) return json({ ok: false, message: "This shop isn't open." }, 404);
    const ceiling = shopCeiling(shop.tenantId, "trade-apply", 50);
    if (ceiling) return ceiling;
    const r = await submitTradeApplication(shop.tenantId, shop.slug, obj(body) as Parameters<typeof submitTradeApplication>[2], undefined, shop.edition);
    return json({ ok: r.ok, message: r.message }, r.ok ? 200 : (r.status ?? 400));
  } catch (err) {
    return failure(err, "trade application");
  }
}
