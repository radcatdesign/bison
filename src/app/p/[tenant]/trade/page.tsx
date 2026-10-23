import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShopFrame } from "@/components/shop/frame";
import s from "@/components/shop/shop.module.css";
import { TradeApply, TradeSignIn } from "@/components/shop/trade";
import { sayFor } from "@/config/editions";
import { demoMode } from "@/lib/env";
import { formToken } from "@/lib/pages/form-token";
import { currentBuyer } from "@/lib/sales/shop";
import { getShop } from "@/lib/sales/shop-load";
import { tradeFormKey } from "@/lib/sales/trade-public";

// Trade accounts on the shop: sign in with an emailed link, or apply. Public.
// For a club these are corporate accounts: companies buying for their staff.

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

type Params = Promise<{ tenant: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenant } = await params;
  const shop = await getShop(tenant);
  const name = shop ? sayFor(shop.edition)("Trade accounts", "Corporate accounts") : "Trade accounts";
  return { title: { absolute: shop ? `${name} | ${shop.name}` : name }, robots: { index: Boolean(shop?.tradeOpen), follow: true } };
}

async function Trade({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenant } = await params;
  const shop = await getShop(tenant);
  if (!shop || !shop.tradeOn) notFound();
  const [buyer, sp] = await Promise.all([currentBuyer(shop), searchParams]);
  const say = sayFor(shop.edition);
  return (
    <ShopFrame shop={shop} buyer={buyer}>
      <h1 className={s.title}>{say("Trade accounts", "Corporate accounts")}</h1>
      <p className={s.lead}>{say("Trade buyers see their own prices across the shop and at checkout.", "Companies with a corporate account see their own prices on memberships and packs, and at checkout.")}</p>
      {sp.link === "old" && (
        <p className={`${s.message} ${s.banner}`} data-tone="error" role="alert">
          That sign-in link has expired or was already replaced. Ask for a new one below.
        </p>
      )}
      {buyer ? (
        <div className={s.step}>
          <h2>You&apos;re signed in</h2>
          <p>
            {buyer.company} buys at {buyer.tierName} prices, {buyer.percentOff}% off.
          </p>
          <a className={s.button} href={`/p/${shop.slug}/shop`}>
            {say("Go to the shop", "Go to the store")}
          </a>
        </div>
      ) : (
        <div className={s.trade}>
          {shop.tradeOpen ? <TradeApply slug={shop.slug} token={demoMode() ? "" : formToken(tradeFormKey(shop.tenantId))} intro={shop.tradeIntro} /> : <p className={s.note}>{say("We aren't taking new trade applications right now.", "We aren't taking new corporate account applications right now.")}</p>}
          <TradeSignIn slug={shop.slug} />
        </div>
      )}
    </ShopFrame>
  );
}

export default function TradePage(props: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={null}>
      <Trade {...props} />
    </Suspense>
  );
}
