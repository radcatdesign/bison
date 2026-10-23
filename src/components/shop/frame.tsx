/* eslint-disable @next/next/no-img-element -- the company's logo can live on any https host. */
// The frame around every shop page: the company's name or logo, the trade
// sign-in, the cart, and the cart drawer.
import type { CSSProperties, ReactNode } from "react";
import type { Buyer, Shop } from "@/lib/sales/shop";
import { CartButton, CartDrawer } from "./cart";
import s from "./shop.module.css";

const HEX = /^#[0-9a-f]{6}$/i;

export function ShopFrame({ shop, buyer, children, cart = true }: { shop: Shop; buyer: Buyer; children: ReactNode; cart?: boolean }) {
  const style = { "--shop-accent": HEX.test(shop.accent) ? shop.accent : "#3b5bff" } as CSSProperties;
  return (
    <div className={s.shell} style={style}>
      <header className={s.bar}>
        <a className={s.brand} href={`/p/${shop.slug}/shop`}>
          {shop.logo ? <img src={shop.logo} alt={shop.name} /> : shop.name}
        </a>
        <div className={s.barSide}>
          {buyer ? (
            <form action={`/p/${shop.slug}/trade/leave`} method="post" className={s.barSide}>
              <span className={s.tradeNote} data-testid="trade-signed-in">
                <span className={s.tradeCompany}>{buyer.company}, </span>
                {buyer.tierName} prices
              </span>
              <button type="submit" className={s.ghost}>
                Sign out
              </button>
            </form>
          ) : (
            shop.tradeOn && (
              <a className={s.ghost} href={`/p/${shop.slug}/trade`}>
                Trade buyers
              </a>
            )
          )}
          {cart && <CartButton slug={shop.slug} />}
        </div>
      </header>
      <main className={s.main}>{children}</main>
      <footer className={s.foot}>
        {shop.name}
        {shop.site ? (
          <>
            {" · "}
            <a href={`https://${shop.site}`}>{shop.site}</a>
          </>
        ) : null}
      </footer>
      {cart && <CartDrawer slug={shop.slug} checkoutOff={null} />}
    </div>
  );
}
