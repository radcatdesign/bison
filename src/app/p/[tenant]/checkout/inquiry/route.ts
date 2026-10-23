import { z } from "zod";
import { demoMode } from "@/lib/env";
import { sendInquiry } from "@/lib/sales/checkout";
import { currentBuyer, loadShop } from "@/lib/sales/shop";
import { failure, json, limited, readBody } from "@/lib/sales/shop-http";

// A cart over the order limit asks for a quote instead. Public. It lands as a
// draft estimate and an email to the team.
const body = z.object({ cartId: z.string().max(4000), email: z.string().max(254), name: z.string().max(120).default(""), phone: z.string().max(40).default(""), message: z.string().max(2000).default("") });

export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const slow = limited(req, tenant, "inquiry", 5, 300);
  if (slow) return slow;
  const parsed = body.safeParse(await readBody(req));
  if (!parsed.success) return json({ ok: false, message: "Couldn't read that. Reload the page and try again." }, 400);
  if (demoMode()) return json({ ok: false, message: "This is a demo, so requests don't send." }, 404);
  try {
    const shop = await loadShop(tenant);
    if (!shop) return json({ ok: false, message: "This shop isn't open." }, 404);
    const buyer = await currentBuyer(shop);
    await sendInquiry(shop.tenantId, parsed.data.cartId, parsed.data, { tradeAccountId: buyer?.tradeAccountId ?? null });
    return json({ ok: true, message: "Thanks. We have your request and will send a quote soon." });
  } catch (err) {
    return failure(err, "quote request");
  }
}
