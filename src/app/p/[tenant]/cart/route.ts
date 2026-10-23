import { z } from "zod";
import { demoMode } from "@/lib/env";
import { type CartOp, updateCart } from "@/lib/sales/checkout";
import { currentBuyer, loadShop } from "@/lib/sales/shop";
import { demoCart } from "@/lib/sales/shop-demo";
import { failure, json, limited, readBody } from "@/lib/sales/shop-http";

// The shopper's cart. Public: the browser keeps only the cart's id, and every
// price comes back from the server. The email only comes in at checkout.
const op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), variantId: z.string().max(40), qty: z.number().int().min(1).max(999) }),
  z.object({ op: z.literal("set"), variantId: z.string().max(40), qty: z.number().int().min(0).max(999) }),
  z.object({ op: z.literal("remove"), variantId: z.string().max(40) }),
  z.object({ op: z.literal("code"), code: z.string().max(60) }),
  z.object({ op: z.literal("view") }),
]);
const body = z.object({ cartId: z.string().max(4000).nullable().default(null), change: op });

export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const slow = limited(req, "cart", 240);
  if (slow) return slow;
  const parsed = body.safeParse(await readBody(req));
  if (!parsed.success) return json({ ok: false, message: "Couldn't read that. Reload the page and try again." }, 400);
  try {
    const shop = await loadShop(tenant);
    if (!shop) return json({ ok: false, message: "This shop isn't open." }, 404);
    const change = parsed.data.change as CartOp;
    if (demoMode()) return json({ ok: true, cart: demoCart(shop, parsed.data.cartId, change) });
    const buyer = await currentBuyer(shop);
    const cart = await updateCart(shop.tenantId, parsed.data.cartId, change, { tradeAccountId: buyer?.tradeAccountId ?? null });
    return json({ ok: true, cart });
  } catch (err) {
    return failure(err, "cart");
  }
}
