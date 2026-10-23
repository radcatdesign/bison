"use client";
/* eslint-disable @next/next/no-img-element -- product photos can live on any https host (imports keep their addresses), so plain img tags. */

// The cart button in the shop's top bar and the drawer it opens: lines with
// quantities, a code box, totals, and the way to checkout.
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/sales/money";
import { changeCart, openCart, useCart } from "./cart-store";
import s from "./shop.module.css";

export function CartButton({ slug }: { slug: string }) {
  const { cart } = useCart(slug);
  const count = cart?.itemCount ?? 0;
  return (
    <button type="button" className={s.ghost} onClick={() => openCart(slug)} aria-label={count ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart"} data-testid="cart-button">
      <ShoppingBag aria-hidden="true" />
      <span>Cart</span>
      {count > 0 && <span className={s.count}>{count}</span>}
    </button>
  );
}

export function CartDrawer({ slug, checkoutOff }: { slug: string; checkoutOff: string | null }) {
  const { cart, open, busy, error } = useCart(slug);
  const ref = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const lines = cart?.lines ?? [];
  const money = (n: number) => formatMoney(n, cart?.currency ?? "usd");

  return (
    <dialog ref={ref} className={s.drawer} aria-labelledby="cart-title" onClose={() => openCart(slug, false)} data-testid="cart-drawer">
      <div className={s.drawerHead}>
        <span id="cart-title">Your cart</span>
        <button type="button" className={s.icon} onClick={() => openCart(slug, false)} aria-label="Close the cart">
          <X aria-hidden="true" />
        </button>
      </div>
      <div className={s.drawerBody} aria-busy={busy}>
        {cart?.notices.map((n) => (
          <p key={n} className={s.message}>
            {n}
          </p>
        ))}
        {error && (
          <p className={s.message} data-tone="error" role="alert">
            {error}
          </p>
        )}
        {!lines.length && <p className={s.note}>Nothing here yet.</p>}
        {lines.map((l) => (
          <div key={l.variantId} className={s.line} data-testid="cart-line">
            <div className={s.lineImage}>{l.photo ? <img src={l.photo} alt="" /> : null}</div>
            <div className={s.lineText}>
              <a href={`/p/${slug}/shop/${l.slug}`}>{l.name}</a>
              {l.variant && <span>{l.variant}</span>}
              <span>
                {money(l.unitCents)} each{l.unitCents < l.listUnitCents ? `, was ${money(l.listUnitCents)}` : ""}
              </span>
              <div className={`${s.qty} ${s.lineQty}`}>
                <button type="button" aria-label={`One fewer ${l.name}`} disabled={busy} onClick={() => void changeCart(slug, l.qty <= 1 ? { op: "remove", variantId: l.variantId } : { op: "set", variantId: l.variantId, qty: l.qty - 1 })}>
                  <Minus aria-hidden="true" />
                </button>
                <input aria-label={`How many ${l.name}`} inputMode="numeric" value={l.qty} readOnly />
                <button type="button" aria-label={`One more ${l.name}`} disabled={busy} onClick={() => void changeCart(slug, { op: "set", variantId: l.variantId, qty: l.qty + 1 })}>
                  <Plus aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className={s.lineEnd}>
              <strong>{money(l.lineCents)}</strong>
              <button type="button" className={s.icon} aria-label={`Remove ${l.name}`} disabled={busy} onClick={() => void changeCart(slug, { op: "remove", variantId: l.variantId })}>
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {lines.length > 0 && cart && (
        <div className={s.drawerFoot}>
          {cart.discount ? (
            <p className={s.message} data-tone="ok">
              {cart.discount.code}: {cart.discount.label}.{" "}
              <button type="button" className={s.linkButton} onClick={() => void changeCart(slug, { op: "code", code: "" })}>
                Remove
              </button>
            </p>
          ) : (
            <form
              className={s.codeRow}
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) void changeCart(slug, { op: "code", code }).then(() => setCode(""));
              }}
            >
              <input className={s.input} aria-label="Discount code" placeholder="Discount code" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" data-testid="cart-code" />
              <button type="submit" className={s.ghost} disabled={busy}>
                Apply
              </button>
            </form>
          )}
          {cart.discountError && (
            <p className={s.message} data-tone="error" role="alert">
              {cart.discountError}{" "}
              <button type="button" className={s.linkButton} onClick={() => void changeCart(slug, { op: "code", code: "" })}>
                Remove the code
              </button>
            </p>
          )}
          <dl className={s.sums}>
            {cart.trade && (
              <>
                <dt>Trade pricing</dt>
                <dd>
                  {cart.trade.name}, {cart.trade.percentOff}% off
                </dd>
              </>
            )}
            <dt>Subtotal</dt>
            <dd>{money(cart.subtotalCents)}</dd>
            {cart.discount && (
              <>
                <dt>Discount</dt>
                <dd>−{money(cart.discount.amountCents)}</dd>
              </>
            )}
            <dt>Shipping</dt>
            <dd>{cart.freeShipping ? "Free" : "At checkout"}</dd>
            <dt className={s.total}>Total</dt>
            <dd className={s.total} data-testid="cart-total">
              {money(cart.merchandiseCents)}
            </dd>
          </dl>
          {checkoutOff ? (
            <p className={s.message}>{checkoutOff}</p>
          ) : (
            <a className={s.button} href={`/p/${slug}/checkout`} data-testid="cart-checkout">
              {cart.inquiry ? "Ask for a quote" : "Check out"}
            </a>
          )}
          {cart.inquiry && <p className={s.note}>Orders this size get a quote from the team instead of paying online.</p>}
        </div>
      )}
    </dialog>
  );
}
