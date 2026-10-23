import { z } from "zod";
import { demoMode } from "@/lib/env";
import { placeFreeOrder } from "@/lib/sales/checkout";
import { currentBuyer, loadShop } from "@/lib/sales/shop";
import { failure, json, limited, readBody } from "@/lib/sales/shop-http";

// Places an order a code paid for in full: no payment, just where to send it. Public.
const body = z.object({ cartId: z.string().max(4000), email: z.string().max(254), name: z.string().max(120).default(""), phone: z.string().max(40).default(""), address: z.unknown() });

export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const slow = limited(req, "free", 10);
  if (slow) return slow;
  const parsed = body.safeParse(await readBody(req));
  if (!parsed.success) return json({ ok: false, message: "Couldn't read that. Reload the page and try again." }, 400);
  if (demoMode()) return json({ ok: false, message: "This is a demo." }, 404);
  try {
    const shop = await loadShop(tenant);
    if (!shop) return json({ ok: false, message: "This shop isn't open." }, 404);
    const buyer = await currentBuyer(shop);
    const r = await placeFreeOrder(shop.tenantId, parsed.data.cartId, parsed.data, { tradeAccountId: buyer?.tradeAccountId ?? null });
    return json({ ok: true, number: r.number });
  } catch (err) {
    return failure(err, "free order");
  }
}
