import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShopFrame } from "@/components/shop/frame";
import { Gallery, ProductBuy, ShareButtons } from "@/components/shop/product";
import s from "@/components/shop/shop.module.css";
import { jsonLd } from "@/lib/marketing/search";
import { descriptionBlocks, descriptionSummary } from "@/lib/sales/catalog";
import { productStructuredData } from "@/lib/sales/seo";
import { absoluteImage, currentBuyer, productUrl } from "@/lib/sales/shop";
import { getShop, getShopItem } from "@/lib/sales/shop-load";
import { feedProduct } from "@/lib/sales/shop-view";

// One product's page: photos, versions, price, add to cart, share, and the
// product's structured data for search. Public. Works whether or not the
// shop's list page is on, so a product can be shared on its own.

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

type Params = Promise<{ tenant: string; product: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenant, product } = await params;
  const shop = await getShop(tenant);
  const item = shop ? await getShopItem(tenant, product) : null;
  if (!shop || !item) return { title: { absolute: "Product not found" }, robots: { index: false } };
  const title = item.seo.title || `${item.name} | ${shop.name}`;
  const description = item.seo.description || descriptionSummary(item.description) || undefined;
  const url = productUrl(shop, item.slug);
  const images = item.photos.slice(0, 4).map((p) => ({ url: absoluteImage(shop, p.src), alt: p.alt || item.name }));
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: shop.name, type: "website", ...(images.length ? { images } : {}) },
    twitter: { card: images.length ? "summary_large_image" : "summary", title, description },
    robots: { index: true, follow: true },
  };
}

async function ProductView({ params }: { params: Params }) {
  const { tenant, product } = await params;
  const shop = await getShop(tenant);
  if (!shop) notFound();
  const item = await getShopItem(tenant, product);
  if (!item) notFound();
  const buyer = await currentBuyer(shop);
  const url = productUrl(shop, item.slug);
  const image = item.photos[0] ? absoluteImage(shop, item.photos[0].src) : null;
  return (
    <ShopFrame shop={shop} buyer={buyer}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(productStructuredData(shop, feedProduct(item))) }} />
      {shop.shopOn && (
        <a className={s.crumb} href={`/p/${shop.slug}/shop`}>
          ← All products
        </a>
      )}
      <div className={s.product}>
        <Gallery item={item} />
        <div className={s.buy}>
          <div>
            {item.category && <p className={s.note}>{item.category}</p>}
            <h1 className={s.title}>{item.name}</h1>
          </div>
          <ProductBuy slug={shop.slug} item={item} currency={shop.currency} trade={buyer ? { tierName: buyer.tierName, percentOff: buyer.percentOff } : null} />
          {item.description && (
            <div className={s.description}>
              {descriptionBlocks(item.description).map((b, i) =>
                b.kind === "p" ? (
                  <p key={i}>{b.text}</p>
                ) : (
                  <ul key={i}>
                    {b.items.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ),
              )}
            </div>
          )}
          <ShareButtons url={url} title={item.name} image={image} />
        </div>
      </div>
    </ShopFrame>
  );
}

export default function ProductPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <ProductView params={params} />
    </Suspense>
  );
}
