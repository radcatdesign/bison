import "server-only";
// What the public shop pages read: the company, its brand, its active
// products, and the trade buyer signed in on this browser, if any. Public
// requests carry no session; the company comes from the address. In the demo
// there's no database, so the made-up catalog stands in.
import { cookies } from "next/headers";
import type { EditionKey } from "@/config/editions";
import { type Database, db, withTenant } from "@/lib/db";
import { appUrl, demoMode } from "@/lib/env";
import { getMarketingSettings, tenantInfo } from "@/lib/marketing/store";
import { shopTenant } from "./checkout";
import { getProduct, publicProducts } from "./products";
import { demoItems, demoShop } from "./shop-demo";
import type { FeedProduct } from "./seo";
import { feedProduct, type ShopItem, toShopItem } from "./shop-view";
import { getSalesSettings, readEdition, readPayments } from "./store";
import { checkTradeToken, tradeBuyer, tradeCookieName } from "./trade";

export type Shop = {
  tenantId: string;
  slug: string;
  /** The company's edition, for the shop's words: a club's store reads in club words. */
  edition: EditionKey;
  name: string;
  accent: string;
  logo: string | null;
  currency: string;
  shopOn: boolean;
  /** Takes new trade applications. */
  tradeOpen: boolean;
  /** Shows the trade sign-in: applications are open, or someone already has an account. */
  tradeOn: boolean;
  tradeIntro: string;
  /** Stripe is connected and live, so checkout can take payment. */
  payable: boolean;
  checkoutNote: string;
  countries: string[];
  collectPhone: boolean;
  inquiryMessage: string;
  site: string | null;
  base: string;
};

export type Buyer = { tradeAccountId: string; company: string; tierName: string; percentOff: number } | null;

export async function loadShop(slug: string, database?: Database): Promise<Shop | null> {
  if (demoMode()) return demoShop(slug);
  const conn = database ?? db();
  const tenantId = await shopTenant(slug, conn);
  if (!tenantId) return null;
  return withTenant(
    { tenantId, userId: "public:shop" },
    async (tx) => {
      const info = await tenantInfo(tx);
      const brand = (await getMarketingSettings(tx, info)).brand;
      const settings = await getSalesSettings(tx);
      const pay = await readPayments(tx);
      const approved = settings.trade.open ? null : await tx.selectFrom("trade_accounts").select("id").where("status", "=", "approved").limit(1).executeTakeFirst();
      return {
        tenantId,
        slug: info.slug,
        edition: await readEdition(tx),
        name: brand.businessName || info.name,
        accent: brand.colors.accent || info.accent,
        logo: brand.logo?.src ?? null,
        currency: settings.store.currency,
        shopOn: settings.store.shopOn,
        tradeOpen: settings.trade.open,
        tradeOn: settings.trade.open || Boolean(approved),
        tradeIntro: settings.trade.intro,
        payable: pay.chargesEnabled,
        checkoutNote: settings.store.checkout.note,
        countries: settings.store.checkout.countries,
        collectPhone: settings.store.checkout.collectPhone,
        inquiryMessage: settings.store.inquiry.message,
        site: info.domain ?? null,
        base: appUrl(),
      };
    },
    conn,
  );
}

/** The trade buyer signed in on this browser for this shop, checked against the database every time. */
export async function currentBuyer(shop: Pick<Shop, "tenantId" | "slug">, database?: Database): Promise<Buyer> {
  if (demoMode()) return null;
  const token = (await cookies()).get(tradeCookieName(shop.slug))?.value;
  if (!token) return null;
  return withTenant(
    { tenantId: shop.tenantId, userId: "public:shop" },
    async (tx) => {
      const ok = await checkTradeToken(tx, "session", token);
      if (!ok) return null;
      const settings = await getSalesSettings(tx);
      const b = await tradeBuyer(tx, ok.id, settings.trade.tiers);
      return b ? { tradeAccountId: b.id, company: b.company, tierName: b.tier.name, percentOff: b.tier.percentOff } : null;
    },
    database ?? db(),
  );
}

export async function shopItems(shop: Pick<Shop, "tenantId">, database?: Database): Promise<ShopItem[]> {
  if (demoMode()) return demoItems(shop);
  const list = await withTenant({ tenantId: shop.tenantId, userId: "public:shop" }, (tx) => publicProducts(tx), database ?? db());
  return list.map((p) => toShopItem(p)).filter((x): x is ShopItem => x !== null);
}

/** Products for the merchant feed, with weights and every active version. */
export async function feedProducts(shop: Pick<Shop, "tenantId">, database?: Database): Promise<FeedProduct[]> {
  if (demoMode()) return demoItems(shop).map(feedProduct);
  return withTenant({ tenantId: shop.tenantId, userId: "public:shop" }, (tx) => publicProducts(tx), database ?? db());
}

export async function shopItem(shop: Pick<Shop, "tenantId">, productSlug: string, database?: Database): Promise<ShopItem | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(productSlug)) return null;
  if (demoMode()) return demoItems(shop).find((p) => p.slug === productSlug) ?? null;
  const p = await withTenant({ tenantId: shop.tenantId, userId: "public:shop" }, (tx) => getProduct(tx, productSlug), database ?? db());
  return p && p.status === "active" ? toShopItem(p) : null;
}

export const productUrl = (shop: Pick<Shop, "base" | "slug">, productSlug: string) => `${shop.base}/p/${shop.slug}/shop/${productSlug}`;
export const absoluteImage = (shop: Pick<Shop, "base">, src: string) => (src.startsWith("/") ? `${shop.base}${src}` : src);
