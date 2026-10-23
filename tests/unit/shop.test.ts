// The public shop's pure pieces: what a shopper sees of a product, trade
// prices, share links, structured data, the merchant feed, imports, and the
// demo's cart that lives in its own id.
import { describe, expect, it } from "vitest";
import { importCsv, importShopifyJson } from "@/lib/sales/imports";
import { merchantFeed, productStructuredData } from "@/lib/sales/seo";
import { demoCart, demoItems, demoShop } from "@/lib/sales/shop-demo";
import { feedProduct, shareLinks, toShopItem, tradePrice } from "@/lib/sales/shop-view";

const product = {
  slug: "house-blend",
  name: "House blend",
  description: "Chocolate and cherry.\n\n- Medium roast\n- Roasted to order",
  category: "Coffee",
  photos: [{ src: "/f/11111111-1111-4111-8111-111111111111", alt: "A bag" }],
  options: [
    { name: "Size", values: ["12 oz", "2 lb", "5 lb"] },
    { name: "Grind", values: ["Whole bean", "Drip"] },
  ],
  variants: [
    { id: "a", options: { Size: "12 oz", Grind: "Whole bean" }, label: "12 oz / Whole bean", sku: "HB-12-W", priceCents: 1600, compareAtCents: 1800, active: true },
    { id: "b", options: { Size: "2 lb", Grind: "Drip" }, label: "2 lb / Drip", sku: "HB-2-D", priceCents: 3800, compareAtCents: null, active: true },
    { id: "c", options: { Size: "5 lb", Grind: "Drip" }, label: "5 lb / Drip", sku: "HB-5-D", priceCents: 8500, compareAtCents: null, active: false },
  ],
  seo: { title: "", description: "" },
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};
const shop = { name: "Ridgeline Roasters", slug: "ridgeline-roasters", base: "https://bison.example", currency: "usd" };

describe("what a shopper sees", () => {
  it("drops versions that aren't for sale, and the choices only they had", () => {
    const item = toShopItem(product)!;
    expect(item.variants.map((v) => v.id)).toEqual(["a", "b"]);
    expect(item.options.find((o) => o.name === "Size")!.values).toEqual(["12 oz", "2 lb"]);
    expect(item.minCents).toBe(1600);
    expect(item.maxCents).toBe(3800);
    expect(JSON.stringify(item)).not.toContain("weight");
  });

  it("has nothing to show when no version is for sale", () => {
    expect(toShopItem({ ...product, variants: product.variants.map((v) => ({ ...v, active: false })) })).toBeNull();
  });

  it("takes the trade tier off, never below zero", () => {
    expect(tradePrice(2000, 10)).toBe(1800);
    expect(tradePrice(2000, 0)).toBe(2000);
    expect(tradePrice(99, 100)).toBe(0);
  });

  it("builds share links with the product address", () => {
    const l = shareLinks("https://bison.example/p/x/shop/house-blend", "House blend", "https://bison.example/f/1");
    expect(l.email).toContain(encodeURIComponent("https://bison.example/p/x/shop/house-blend"));
    expect(l.pinterest).toContain("media=");
    expect(l.facebook).toContain("sharer.php?u=");
  });
});

describe("search data", () => {
  it("is a ProductGroup with an offer per version, with absolute image addresses", () => {
    const ld = productStructuredData(shop, feedProduct(toShopItem(product)!)) as { "@type": string; hasVariant: { offers: { price: string } }[]; image: string[] };
    expect(ld["@type"]).toBe("ProductGroup");
    expect(ld.hasVariant).toHaveLength(2);
    expect(ld.hasVariant[0].offers.price).toBe("16.00");
    expect(ld.image[0]).toBe("https://bison.example/f/11111111-1111-4111-8111-111111111111");
  });

  it("feeds one item per version, with the sale price when there's a was price", () => {
    const xml = merchantFeed(shop, [feedProduct(toShopItem(product)!)]);
    expect(xml.match(/<item>/g)).toHaveLength(2);
    expect(xml).toContain("<g:price>18.00 USD</g:price>");
    expect(xml).toContain("<g:sale_price>16.00 USD</g:sale_price>");
    expect(xml).toContain("<g:item_group_id>house-blend</g:item_group_id>");
  });
});

describe("imports", () => {
  it("groups CSV rows with the same name into one product with options", () => {
    const r = importCsv("Name,Price,Option name,Option value,SKU,Weight (oz)\nMug,22,Color,Blue,M-B,18\nMug,22,Color,Red,M-R,18\nFilter,5,,,F-1,2\n");
    expect(r.products).toHaveLength(2);
    const mug = r.products.find((p) => p.name === "Mug")!;
    expect(mug.options[0]).toMatchObject({ name: "Color", values: ["Blue", "Red"] });
    expect(mug.variants.map((v) => v.priceCents)).toEqual([2200, 2200]);
  });

  it("reads a Shopify store's public product list", () => {
    const r = importShopifyJson([{ products: [{ id: 1, title: "Kettle", handle: "kettle", body_html: "<p>Pours <b>well</b>.</p>", product_type: "Gear", options: [{ name: "Title", values: ["Default Title"] }], images: [{ src: "https://cdn.shopify.example/k.jpg" }], variants: [{ option1: "Default Title", sku: "K-1", price: "45.00", grams: 900, available: true }] }] }]);
    expect(r.products[0]).toMatchObject({ name: "Kettle", options: [] });
    expect(r.products[0].description).toContain("Pours well.");
    expect(r.products[0].variants[0].priceCents).toBe(4500);
  });
});

describe("the demo shop", () => {
  const s = demoShop("ridgelineroasters")!;

  it("is only there for the made-up companies", () => {
    expect(s.name).toBe("Ridgeline Roasters");
    expect(demoShop("someone-else")).toBeNull();
    expect(demoItems(s).length).toBeGreaterThan(3);
  });

  it("keeps the cart in its own id, priced on the server", () => {
    const item = demoItems(s)[0];
    let cart = demoCart(s, null, { op: "add", variantId: item.variants[0].id, qty: 2 });
    expect(cart.itemCount).toBe(2);
    expect(cart.subtotalCents).toBe(item.variants[0].priceCents * 2);
    cart = demoCart(s, cart.cartId, { op: "code", code: "welcome10" });
    expect(cart.discount?.label).toBe("10% off");
    cart = demoCart(s, cart.cartId, { op: "remove", variantId: item.variants[0].id });
    expect(cart.lines).toHaveLength(0);
  });

  it("ignores a forged id", () => {
    expect(demoCart(s, "demo.not-base64!!", { op: "view" }).lines).toHaveLength(0);
  });
});

describe("the payments stand-in", () => {
  it("fails closed: never on Vercel, and in production builds only when allowed", async () => {
    const { standInsAllowed } = await import("@/lib/sales/payments");
    const keep = { VERCEL: process.env.VERCEL, NODE_ENV: process.env.NODE_ENV, ALLOW_FAKE_BILLING: process.env.ALLOW_FAKE_BILLING };
    const set = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else (process.env as Record<string, string>)[k] = v;
    };
    try {
      set("VERCEL", undefined);
      set("NODE_ENV", "test");
      expect(standInsAllowed()).toBe(true);
      set("NODE_ENV", "production");
      set("ALLOW_FAKE_BILLING", undefined);
      expect(standInsAllowed()).toBe(false);
      set("ALLOW_FAKE_BILLING", "1");
      expect(standInsAllowed()).toBe(true);
      set("VERCEL", "1");
      expect(standInsAllowed()).toBe(false);
    } finally {
      for (const [k, v] of Object.entries(keep)) set(k, v);
    }
  });
});
