import { connection } from "next/server";
import { merchantFeed } from "@/lib/sales/seo";
import { feedProducts, loadShop } from "@/lib/sales/shop";

// The product feed for Google Merchant Center and other shopping sites: every
// active product, one item per version. Public.
export async function GET(_req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  await connection();
  const { tenant } = await params;
  const shop = await loadShop(tenant);
  if (!shop) return new Response("Not found.", { status: 404 });
  return new Response(merchantFeed(shop, await feedProducts(shop)), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900" } });
}
