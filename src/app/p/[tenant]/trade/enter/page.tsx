import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShopFrame } from "@/components/shop/frame";
import s from "@/components/shop/shop.module.css";
import { currentBuyer } from "@/lib/sales/shop";
import { getShop } from "@/lib/sales/shop-load";
import { tradeLinkCompany } from "@/lib/sales/trade-public";

// Where a trade sign-in link lands. Opening it changes nothing (email apps
// open links to check them); the button signs this browser in. Public.

export const metadata: Metadata = { title: { absolute: "Trade sign-in" }, robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function Enter({ params, searchParams }: Props) {
  const { tenant } = await params;
  const shop = await getShop(tenant);
  if (!shop) notFound();
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t.slice(0, 300) : "";
  const [company, buyer] = await Promise.all([token ? tradeLinkCompany(shop.tenantId, token) : null, currentBuyer(shop)]);
  return (
    <ShopFrame shop={shop} buyer={buyer} cart={false}>
      {company ? (
        <form className={s.step} method="post" action={`/p/${shop.slug}/trade/session`} data-testid="trade-enter">
          <h1 className={s.title}>Sign in as {company}</h1>
          <p className={s.lead}>You&apos;ll see your trade prices across the shop on this browser for 30 days.</p>
          <input type="hidden" name="t" value={token} />
          <button type="submit" className={`${s.button} ${s.payButton}`} data-testid="trade-enter-confirm">
            Sign in
          </button>
        </form>
      ) : (
        <div className={s.step} data-testid="trade-enter-old">
          <h1 className={s.title}>This link isn&apos;t working</h1>
          <p className={s.lead}>It may have expired, been replaced, or the account was paused.</p>
          <a className={`${s.button} ${s.payButton}`} href={`/p/${shop.slug}/trade`}>
            Get a new link
          </a>
        </div>
      )}
    </ShopFrame>
  );
}

export default function TradeEnterPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <Enter {...props} />
    </Suspense>
  );
}
