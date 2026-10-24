/* eslint-disable @next/next/no-img-element -- product photos can live on any https host (imports keep their addresses). */
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { type CSSProperties, Suspense } from "react";
import { ShopFrame } from "@/components/shop/frame";
import s from "@/components/shop/shop.module.css";
import { sayFor } from "@/config/editions";
import { formatMoney } from "@/lib/sales/money";
import { currentBuyer } from "@/lib/sales/shop";
import { getShop, getShopItems } from "@/lib/sales/shop-load";
import { type ShopItem, tradePrice } from "@/lib/sales/shop-view";

// The company's shop: every active product, by category. Public. For a club,
// this is where people join online: memberships, packs, training and gear.

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

type Params = Promise<{ tenant: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenant } = await params;
  const shop = await getShop(tenant);
  if (!shop || !shop.shopOn) return { title: { absolute: "Shop not found" }, robots: { index: false } };
  const say = sayFor(shop.edition);
  const title = `${say("Shop", "Join online")} | ${shop.name}`;
  const description = say(`Products from ${shop.name}.`, `Memberships, class packs and training from ${shop.name}.`);
  const url = `${shop.base}/p/${shop.slug}/shop`;
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url, siteName: shop.name, type: "website" }, robots: { index: true, follow: true } };
}

function Card({ slug, item, currency, percentOff }: { slug: string; item: ShopItem; currency: string; percentOff: number }) {
  const min = tradePrice(item.minCents, percentOff);
  const max = tradePrice(item.maxCents, percentOff);
  const one = item.variants.length === 1 ? item.variants[0] : null;
  const was = one?.compareAtCents && one.compareAtCents > one.priceCents ? one.compareAtCents : null;
  return (
    <li>
      <a className={s.card} href={`/p/${slug}/shop/${item.slug}`} data-testid="shop-card">
        <div className={s.cardImage}>
          {item.photos[0] ? (
            <img src={item.photos[0].src} alt={item.photos[0].alt || item.name} loading="lazy" />
          ) : (
            <div className={s.cardBlank} style={item.color ? ({ "--tile": item.color } as CSSProperties) : undefined} aria-hidden="true">
              {item.name.slice(0, 1)}
            </div>
          )}
        </div>
        <span className={s.cardName}>{item.name}</span>
        <span className={s.price}>
          <span>{min === max ? formatMoney(min, currency) : `From ${formatMoney(min, currency)}`}</span>
          {percentOff > 0 ? <span className={s.was}>{formatMoney(item.minCents, currency)}</span> : was ? <span className={s.was}>{formatMoney(was, currency)}</span> : null}
        </span>
      </a>
    </li>
  );
}

async function ShopList({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tenant } = await params;
  const shop = await getShop(tenant);
  if (!shop || !shop.shopOn) notFound();
  const [items, buyer, sp] = await Promise.all([getShopItems(tenant), currentBuyer(shop), searchParams]);
  const say = sayFor(shop.edition);
  const groups = new Map<string, ShopItem[]>();
  for (const it of items) {
    const k = it.category || say("Products", "Memberships");
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const pct = buyer?.percentOff ?? 0;
  return (
    <ShopFrame shop={shop} buyer={buyer}>
      <h1 className={s.title}>{say("Shop", "Join online")}</h1>
      <p className={s.lead}>{buyer ? `Signed in as ${buyer.company}. Your ${buyer.tierName} prices show below and in your cart.` : say(`Everything ${shop.name} sells online.`, `Memberships, class packs, training and gear from ${shop.name}.`)}</p>
      {sp.trade === "1" && buyer && (
        <p className={`${s.message} ${s.banner}`} data-tone="ok" role="status">
          {say("You're signed in. Trade prices show across the shop on this browser for 30 days.", "You're signed in. Corporate prices show across the store on this browser for 30 days.")}
        </p>
      )}
      {!items.length && <p className={s.empty}>{say("No products yet. Check back soon.", "Nothing to join online yet. Check back soon, or contact the club.")}</p>}
      {[...groups.entries()].map(([name, list]) => (
        <section key={name} className={s.section} aria-label={groups.size > 1 ? name : undefined}>
          {groups.size > 1 && <h2 className={s.sectionTitle}>{name}</h2>}
          <ul className={s.grid}>
            {list.map((it) => (
              <Card key={it.slug} slug={shop.slug} item={it} currency={shop.currency} percentOff={pct} />
            ))}
          </ul>
        </section>
      ))}
    </ShopFrame>
  );
}

export default function ShopPage(props: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={null}>
      <ShopList {...props} />
    </Suspense>
  );
}
