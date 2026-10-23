import "server-only";
// Per-request memos for the shop pages, so metadata and the page share one read.
import { cache } from "react";
import { loadShop, shopItem, shopItems } from "./shop";

export const getShop = cache((slug: string) => loadShop(slug));
export const getShopItems = cache(async (slug: string) => {
  const shop = await getShop(slug);
  return shop ? shopItems(shop) : [];
});
export const getShopItem = cache(async (slug: string, productSlug: string) => {
  const shop = await getShop(slug);
  return shop ? shopItem(shop, productSlug) : null;
});
