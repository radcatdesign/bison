"use client";
/* eslint-disable @next/next/no-img-element -- product photos can live on any https host (imports keep their addresses), so plain img tags. */

// The interactive parts of a product page: the photos, choosing a version and
// how many, adding to the cart, and sharing.
import { Check, Link2, Mail, Minus, Plus, Share2 } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { useSay } from "@/components/edition";
import { formatMoney } from "@/lib/sales/money";
import { type ShopItem, type ShopVariant, shareLinks, tradePrice } from "@/lib/sales/shop-view";
import { useIsClient } from "@/lib/use-is-client";
import { changeCart } from "./cart-store";
import s from "./shop.module.css";

export function Gallery({ item }: { item: Pick<ShopItem, "name" | "photos" | "color"> }) {
  const [at, setAt] = useState(0);
  const photo = item.photos[Math.min(at, item.photos.length - 1)];
  return (
    <div className={s.gallery}>
      <div className={s.mainImage}>
        {photo ? (
          <img src={photo.src} alt={photo.alt || item.name} />
        ) : (
          <div className={s.cardBlank} style={item.color ? ({ "--tile": item.color } as CSSProperties) : undefined} aria-hidden="true">
            {item.name.slice(0, 1)}
          </div>
        )}
      </div>
      {item.photos.length > 1 && (
        <div className={s.thumbs}>
          {item.photos.map((p, i) => (
            <button key={p.src} type="button" aria-pressed={i === at} aria-label={`Photo ${i + 1} of ${item.photos.length}`} onClick={() => setAt(i)}>
              <img src={p.src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const matches = (v: ShopVariant, picked: Record<string, string>) => Object.entries(picked).every(([k, val]) => v.options[k] === val);

type BuyProps = {
  slug: string;
  item: Pick<ShopItem, "name" | "options" | "variants">;
  currency: string;
  trade: { tierName: string; percentOff: number } | null;
};

export function ProductBuy({ slug, item, currency, trade }: BuyProps) {
  const [picked, setPicked] = useState<Record<string, string>>(() => ({ ...(item.variants[0]?.options ?? {}) }));
  const [qty, setQty] = useState(1);
  const [state, setState] = useState<{ busy: boolean; message: string | null; tone: "ok" | "error" }>({ busy: false, message: null, tone: "ok" });
  const variant = item.variants.find((v) => matches(v, picked)) ?? null;
  const money = (n: number) => formatMoney(n, currency);

  function choose(name: string, value: string) {
    const next = { ...picked, [name]: value };
    // Keep the other choices when that version exists; otherwise jump to the first one that has this choice.
    if (item.variants.some((v) => matches(v, next))) setPicked(next);
    else setPicked({ ...(item.variants.find((v) => v.options[name] === value)?.options ?? next) });
    setState((x) => ({ ...x, message: null }));
  }

  async function add() {
    if (!variant) return;
    setState({ busy: true, message: null, tone: "ok" });
    const r = await changeCart(slug, { op: "add", variantId: variant.id, qty }, { open: true });
    setState(r.ok ? { busy: false, message: null, tone: "ok" } : { busy: false, message: r.message ?? "Couldn't add that. Try again.", tone: "error" });
  }

  const unit = variant?.priceCents ?? 0;
  const yours = trade ? tradePrice(unit, trade.percentOff) : unit;
  const was = variant?.compareAtCents && variant.compareAtCents > unit ? variant.compareAtCents : null;

  return (
    <div className={s.buy} data-testid="product-buy">
      <div className={s.price} aria-live="polite">
        {variant ? (
          <>
            <span className={s.bigPrice} data-testid="product-price">
              {money(yours)}
            </span>
            {(trade && yours < unit) || was ? <span className={s.was}>{money(trade && yours < unit ? unit : was!)}</span> : null}
            {trade && yours < unit && <span className={s.tradePrice}>Your {trade.tierName} price</span>}
          </>
        ) : (
          <span className={s.note}>That combination isn&apos;t available. Pick another.</span>
        )}
      </div>

      {item.options.map((o) => (
        <fieldset key={o.name} className={s.optionGroup}>
          <legend>
            {o.name}: <span className={s.optionPicked}>{picked[o.name] ?? "Choose one"}</span>
          </legend>
          <div className={s.optionChoices}>
            {o.values.map((val) => {
              const possible = item.variants.some((v) => v.options[o.name] === val && matches(v, Object.fromEntries(Object.entries(picked).filter(([k]) => k !== o.name))));
              return (
                <button key={val} type="button" aria-pressed={picked[o.name] === val} data-off={possible ? undefined : ""} onClick={() => choose(o.name, val)}>
                  {val}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className={s.buyRow}>
        <div className={s.qty}>
          <button type="button" aria-label="One fewer" onClick={() => setQty((q) => Math.max(1, q - 1))}>
            <Minus aria-hidden="true" />
          </button>
          <input
            aria-label="Quantity"
            inputMode="numeric"
            value={qty}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/\D/g, ""));
              setQty(Number.isFinite(n) ? Math.max(1, Math.min(999, n)) : 1);
            }}
            data-testid="product-qty"
          />
          <button type="button" aria-label="One more" onClick={() => setQty((q) => Math.min(999, q + 1))}>
            <Plus aria-hidden="true" />
          </button>
        </div>
        <button type="button" className={s.button} disabled={!variant || state.busy} onClick={() => void add()} data-testid="add-to-cart">
          {state.busy ? "Adding" : "Add to cart"}
        </button>
      </div>
      {state.message && (
        <p className={s.message} data-tone={state.tone} role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}

export function ShareButtons({ url, title, image }: { url: string; title: string; image: string | null }) {
  const say = useSay();
  const client = useIsClient();
  const [copied, setCopied] = useState(false);
  const links = shareLinks(url, title, image);
  const canShare = client && typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <div className={s.share} aria-label={say("Share this product", "Share this")} role="group">
      <button
        type="button"
        className={s.ghost}
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
        {copied ? "Copied" : "Copy link"}
      </button>
      {canShare && (
        <button type="button" className={s.ghost} onClick={() => void navigator.share({ title, url }).catch(() => undefined)}>
          <Share2 aria-hidden="true" />
          Share
        </button>
      )}
      <a className={s.ghost} href={links.email}>
        <Mail aria-hidden="true" />
        Email
      </a>
      <a className={s.ghost} href={links.pinterest} target="_blank" rel="noopener noreferrer">
        Pinterest
      </a>
      <a className={s.ghost} href={links.facebook} target="_blank" rel="noopener noreferrer">
        Facebook
      </a>
    </div>
  );
}
