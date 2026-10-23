import { z } from "zod";
import { demoMode } from "@/lib/env";
import { quoteCheckout } from "@/lib/sales/checkout";
import { loadShop } from "@/lib/sales/shop";
import { failure, json, limited, readBody } from "@/lib/sales/shop-http";

// Rates the shipping address on a checkout and puts the options on it. Public:
// the checkout id is only known to the browser that started it.
const body = z.object({ sessionId: z.string().min(5).max(200), address: z.unknown() });

export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const slow = limited(req, "rates", 60);
  if (slow) return slow;
  const parsed = body.safeParse(await readBody(req));
  if (!parsed.success) return json({ ok: false, message: "Couldn't read that address. Try again." }, 400);
  if (demoMode()) return json({ ok: false, message: "This is a demo." }, 404);
  try {
    const shop = await loadShop(tenant);
    if (!shop) return json({ ok: false, message: "This shop isn't open." }, 404);
    const q = await quoteCheckout(shop.tenantId, parsed.data.sessionId, parsed.data.address);
    return json(q, q.ok ? 200 : 422);
  } catch (err) {
    return failure(err, "shipping quote");
  }
}
