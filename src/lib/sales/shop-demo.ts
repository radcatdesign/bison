import "server-only";
// The shop in the public demo, where there's no database: the made-up
// catalog, and a cart that lives entirely in its own id (the items are packed
// into it), so adding, changing and codes all work without saving anything.
// Checkout stops with a plain note.
import { editionFor } from "@/config/editions";
import { DEV_TENANTS } from "@/lib/auth/dev-people";
import { appUrl } from "@/lib/env";
import { sampleCatalog, sampleUuid } from "@/lib/sample/sales";
import { variantLabel } from "./catalog";
import type { CartOp, PublicCart } from "./checkout";
import { cleanItems, type CartItem, MAX_LINE_QTY, priceCart, type VariantForPricing } from "./pricing";
import type { Shop } from "./shop";
import { type ShopItem, toShopItem } from "./shop-view";

export const DEMO_CHECKOUT = "This is a demo, so checkout stops here. In your own shop, this is where Stripe takes the payment.";

const tenantFor = (slug: string) => Object.values(DEV_TENANTS).find((t) => t.domain.split(".")[0] === slug) ?? null;

export function demoShop(slug: string): Shop | null {
  const t = tenantFor(slug);
  if (!t) return null;
  return { tenantId: t.id, slug, edition: t.edition, name: t.name, accent: editionFor(t.edition).defaultAccent, logo: null, currency: "usd", shopOn: true, tradeOpen: true, tradeOn: true, tradeIntro: "", payable: false, checkoutNote: "", countries: ["US"], collectPhone: true, inquiryMessage: "", site: t.domain, base: appUrl() };
}

const productId = (tenantId: string, slug: string) => sampleUuid(`${tenantId}:product:${slug}`);
const variantId = (tenantId: string, sku: string) => sampleUuid(`${tenantId}:variant:${sku}`);

export function demoItems(shop: Pick<Shop, "tenantId">): ShopItem[] {
  const t = Object.values(DEV_TENANTS).find((x) => x.id === shop.tenantId);
  if (!t) return [];
  const updatedAt = new Date("2026-09-01T00:00:00Z");
  return sampleCatalog(t)
    .filter((p) => p.variants.some((v) => v.weightOz > 0 || v.flatShipCents !== null))
    .map((p) =>
      toShopItem(
        {
          slug: p.slug,
          name: p.name,
          description: p.description,
          category: p.category,
          photos: [],
          options: p.options,
          variants: p.variants.map((v) => ({ id: variantId(t.id, v.sku), options: v.options, label: variantLabel(v.options, p.options), sku: v.sku, priceCents: v.priceCents, compareAtCents: v.compareAtCents, active: true })),
          updatedAt,
        },
        p.color,
      ),
    )
    .filter((x): x is ShopItem => x !== null);
}

function demoVariants(tenantId: string): Map<string, VariantForPricing> {
  const t = Object.values(DEV_TENANTS).find((x) => x.id === tenantId);
  const map = new Map<string, VariantForPricing>();
  if (!t) return map;
  for (const p of sampleCatalog(t)) {
    for (const v of p.variants) {
      const id = variantId(t.id, v.sku);
      map.set(id, { variantId: id, productId: productId(t.id, p.slug), productName: p.name, productSlug: p.slug, productStatus: "active", productOptions: p.options, photo: null, taxCode: "", options: v.options, sku: v.sku, priceCents: v.priceCents, compareAtCents: v.compareAtCents, active: true, weightOz: v.weightOz, box: v.box, unitsPerBox: v.unitsPerBox, shipsAlone: v.shipsAlone, flatShipCents: v.flatShipCents });
    }
  }
  return map;
}

type Packed = { items: CartItem[]; code: string };

function unpack(cartId: string | null): Packed {
  if (!cartId?.startsWith("demo.")) return { items: [], code: "" };
  try {
    const raw = JSON.parse(Buffer.from(cartId.slice(5), "base64url").toString("utf8")) as { i?: [string, number][]; c?: string };
    return { items: cleanItems((raw.i ?? []).map(([variantId, qty]) => ({ variantId, qty }))), code: typeof raw.c === "string" ? raw.c.slice(0, 40) : "" };
  } catch {
    return { items: [], code: "" };
  }
}

const pack = (p: Packed) => `demo.${Buffer.from(JSON.stringify({ i: p.items.map((x) => [x.variantId, x.qty]), c: p.code })).toString("base64url")}`;

/** The demo's one made-up code, so the code box can be tried. */
const DEMO_CODE = "WELCOME10";

export function demoCart(shop: Pick<Shop, "tenantId">, cartId: string | null, change: CartOp): PublicCart {
  const state = unpack(cartId);
  let items = state.items;
  let code = state.code;
  if (change.op === "add" || change.op === "set") {
    const qty = Math.max(0, Math.min(MAX_LINE_QTY, Math.floor(change.qty)));
    const found = items.find((i) => i.variantId === change.variantId);
    if (change.op === "add") {
      if (found) found.qty = Math.min(MAX_LINE_QTY, found.qty + qty);
      else items.push({ variantId: change.variantId, qty });
    } else if (found) found.qty = qty;
    items = cleanItems(items);
  } else if (change.op === "remove") items = items.filter((i) => i.variantId !== change.variantId);
  else if (change.op === "code") code = change.code.trim().toUpperCase().replace(/\s+/g, "").slice(0, 40);

  const variants = demoVariants(shop.tenantId);
  const priced = priceCart({
    items,
    variants,
    currency: "usd",
    trade: null,
    inquiry: { on: true, overCents: 2_000_000, overQuantity: null, message: "" },
    discount: code ? (subtotal) => (code === DEMO_CODE ? { ok: true, code, amountCents: Math.round(subtotal / 10), label: "10% off", freeShipping: false } : { ok: false, code, message: "That code isn't valid. In the demo, try WELCOME10." }) : undefined,
  });
  items = items.filter((i) => priced.lines.some((l) => l.variantId === i.variantId));
  return {
    cartId: items.length || code ? pack({ items, code }) : "",
    status: "open",
    email: "",
    code,
    lines: priced.lines.map(({ variantId, name, variant, slug, photo, qty, unitCents, listUnitCents, compareAtCents, lineCents }) => ({ variantId, name, variant, slug, photo, qty, unitCents, listUnitCents, compareAtCents, lineCents })),
    itemCount: priced.itemCount,
    subtotalCents: priced.subtotalCents,
    discount: priced.discount,
    discountError: priced.discountError,
    merchandiseCents: priced.merchandiseCents,
    trade: null,
    inquiry: Boolean(priced.inquiry),
    notices: priced.notices,
    currency: "usd",
    freeShipping: false,
  };
}
