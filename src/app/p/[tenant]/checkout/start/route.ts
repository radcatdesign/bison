import { z } from "zod";
import { demoMode } from "@/lib/env";
import { startCheckout } from "@/lib/sales/checkout";
import { currentBuyer, loadShop } from "@/lib/sales/shop";
import { DEMO_CHECKOUT } from "@/lib/sales/shop-demo";
import { failure, json, limited, readBody } from "@/lib/sales/shop-http";

// Starts paying for a cart. Public. Answers with what the checkout page shows
// next: Stripe's payment form on the company's own account, the stand-in in
// local work, or the free-order and quote-request forms.
const body = z.object({ cartId: z.string().max(4000), email: z.string().max(254), name: z.string().max(120).default("") });

export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const slow = limited(req, tenant, "checkout", 30, 2000);
  if (slow) return slow;
  const parsed = body.safeParse(await readBody(req));
  if (!parsed.success) return json({ ok: false, message: "Couldn't read that. Reload the page and try again." }, 400);
  if (demoMode()) return json({ ok: false, message: DEMO_CHECKOUT }, 409);
  try {
    const shop = await loadShop(tenant);
    if (!shop) return json({ ok: false, message: "This shop isn't open." }, 404);
    const buyer = await currentBuyer(shop);
    const start = await startCheckout(shop.tenantId, shop.slug, parsed.data.cartId, parsed.data, { tradeAccountId: buyer?.tradeAccountId ?? null });
    return json({ ok: true, start });
  } catch (err) {
    return failure(err, "checkout start");
  }
}
