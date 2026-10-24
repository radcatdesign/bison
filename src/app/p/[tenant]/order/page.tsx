import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";
import { ClearCart } from "@/components/shop/clear-cart";
import { ShopFrame } from "@/components/shop/frame";
import s from "@/components/shop/shop.module.css";
import { sayFor } from "@/config/editions";
import { demoMode } from "@/lib/env";
import { orderForSession, recordCheckout } from "@/lib/sales/checkout";
import { formatMoney } from "@/lib/sales/money";
import { afterOrderPaid } from "@/lib/sales/orders";
import { addressLines } from "@/lib/sales/settings";
import { currentBuyer } from "@/lib/sales/shop";
import { getShop } from "@/lib/sales/shop-load";
import type { OrderItem } from "@/lib/sales/types";

// Where Stripe sends the shopper after paying. Public, and only reachable with
// the checkout's own id. If Stripe's message about the payment hasn't arrived
// yet, this page asks Stripe itself, so the order shows right away either way.

export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export const metadata: Metadata = { title: { absolute: "Thank you" }, robots: { index: false, follow: false } };

type Params = Promise<{ tenant: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

async function Order({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenant } = await params;
  const sp = await searchParams;
  const sessionId = typeof sp.session_id === "string" && /^[A-Za-z0-9_]{5,200}$/.test(sp.session_id) ? sp.session_id : null;
  const shop = demoMode() ? null : await getShop(tenant);
  if (!shop || !sessionId) notFound();
  let order = await orderForSession(shop.tenantId, sessionId);
  if (!order) {
    const made = await recordCheckout(shop.tenantId, sessionId, undefined, undefined, "skip").catch(() => null);
    if (made?.created) after(() => afterOrderPaid(shop.tenantId, made.orderId));
    order = await orderForSession(shop.tenantId, sessionId);
  }
  const buyer = await currentBuyer(shop);
  if (!order) {
    return (
      <ShopFrame shop={shop} buyer={buyer}>
        <meta httpEquiv="refresh" content="4" />
        <h1 className={s.title}>Confirming your payment</h1>
        <p className={s.lead}>This usually takes a few seconds. The page will update on its own.</p>
      </ShopFrame>
    );
  }
  const money = (n: number) => formatMoney(n, order.currency);
  const items = (Array.isArray(order.items) ? order.items : []) as OrderItem[];
  const say = sayFor(shop.edition);
  return (
    <ShopFrame shop={shop} buyer={buyer}>
      <ClearCart slug={shop.slug} />
      <h1 className={s.title} data-testid="order-thanks">
        Thank you{order.name ? `, ${order.name.split(" ")[0]}` : ""}
      </h1>
      <p className={s.lead}>{say(`Order #${order.number} is paid. A receipt is on its way to ${order.email}, and we'll email you when it ships.`, `Purchase #${order.number} is paid. A receipt is on its way to ${order.email}. If you bought gear, we'll email you when it ships.`)}</p>
      <div className={s.checkout}>
        <section className={s.step} aria-label={say("Shipping to", "Your address")}>
          <h2>{say("Shipping to", "Your address")}</h2>
          <p>
            {addressLines(order.ship_to as Record<string, string>).map((l) => (
              <span key={l}>
                {l}
                <br />
              </span>
            ))}
          </p>
          {order.shipping_service && <p className={s.note}>{order.shipping_service}</p>}
        </section>
        <aside className={s.summary} aria-label={say("Order summary", "Summary")}>
          <strong>
            {say("Order", "Purchase")} #{order.number}
          </strong>
          {items.map((l, i) => (
            <div key={`${l.sku}-${i}`} className={s.sumLine}>
              <div>
                <span>
                  {l.qty} × {l.name}
                </span>
                <span>{money(l.lineCents)}</span>
              </div>
              {l.variant && <small>{l.variant}</small>}
            </div>
          ))}
          <dl className={s.sums}>
            <dt>Subtotal</dt>
            <dd>{money(order.subtotal_cents)}</dd>
            {order.discount_cents > 0 && (
              <>
                <dt>Discount</dt>
                <dd>−{money(order.discount_cents)}</dd>
              </>
            )}
            <dt>Shipping</dt>
            <dd>{order.shipping_cents ? money(order.shipping_cents) : "Free"}</dd>
            {order.tax_cents > 0 && (
              <>
                <dt>Tax</dt>
                <dd>{money(order.tax_cents)}</dd>
              </>
            )}
            <dt className={s.total}>Paid</dt>
            <dd className={s.total}>{money(order.total_cents)}</dd>
          </dl>
        </aside>
      </div>
    </ShopFrame>
  );
}

export default function OrderPage(props: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={null}>
      <Order {...props} />
    </Suspense>
  );
}
