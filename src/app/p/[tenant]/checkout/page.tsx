import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckoutFlow } from "@/components/shop/checkout";
import { ShopFrame } from "@/components/shop/frame";
import s from "@/components/shop/shop.module.css";
import { paymentsProviderName } from "@/lib/sales/payments";
import { currentBuyer } from "@/lib/sales/shop";
import { getShop } from "@/lib/sales/shop-load";

// The shop's checkout page. Public. The cart comes from this browser; prices,
// shipping and payment are all worked out on the server.

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

type Params = Promise<{ tenant: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenant } = await params;
  const shop = await getShop(tenant);
  return { title: { absolute: shop ? `Checkout | ${shop.name}` : "Checkout" }, robots: { index: false, follow: false } };
}

async function Checkout({ params }: { params: Params }) {
  const { tenant } = await params;
  const shop = await getShop(tenant);
  if (!shop) notFound();
  const buyer = await currentBuyer(shop);
  return (
    <ShopFrame shop={shop} buyer={buyer} cart={false}>
      <h1 className={s.title}>Checkout</h1>
      <p className={s.lead}>
        <a href={`/p/${shop.slug}/shop`}>Back to the shop</a>
      </p>
      <CheckoutFlow slug={shop.slug} accent={shop.accent} countries={shop.countries} collectPhone={shop.collectPhone} note={shop.checkoutNote} inquiryMessage={shop.inquiryMessage} testMode={paymentsProviderName() === "stand-in"} />
    </ShopFrame>
  );
}

export default function CheckoutPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Checkout params={params} />
    </Suspense>
  );
}
