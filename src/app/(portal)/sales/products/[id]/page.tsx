import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { salesGate } from "@/components/sales/gate";
import { type EditorProduct, ProductEditor } from "@/components/sales/product-editor";
import { Said } from "@/components/sales/said";
import { PageHeader } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { sayOf } from "@/lib/edition";
import { appUrl, demoMode } from "@/lib/env";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { sampleCatalog } from "@/lib/sample/sales";
import { DEFAULT_BOXES } from "@/lib/sales/settings";
import { getProduct } from "@/lib/sales/products";
import { getSalesSettings } from "@/lib/sales/store";

export async function generateMetadata(): Promise<Metadata> {
  return { title: sayOf(await getPortalContext())("Product", "Membership") };
}

const BLANK: EditorProduct = { id: null, slug: "", name: "", description: "", status: "draft", category: "", taxCode: "", options: [], photos: [], seo: { title: "", description: "" }, variants: [{ options: {}, sku: "", priceCents: 0, compareAtCents: null, weightOz: 0, box: "", unitsPerBox: 1, shipsAlone: false, flatShipCents: null, active: true }] };

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPortalContext();
  const blocked = salesGate(ctx, "sales.products");
  if (blocked) return blocked;
  const { id } = await params;
  const demo = demoMode();
  let product: EditorProduct;
  let boxes = DEFAULT_BOXES;
  let currency = "usd";
  if (demo) {
    const sp = sampleCatalog(ctx.tenant).find((p) => p.slug === id);
    if (!sp && id !== "new") notFound();
    product = sp ? { ...BLANK, slug: sp.slug, name: sp.name, description: sp.description, status: "active", category: sp.category, options: sp.options, variants: sp.variants.map((v) => ({ ...v, active: true })) } : BLANK;
  } else {
    const loaded = await withTenant(scopeOf(ctx), async (tx) => ({ p: id === "new" ? null : await getProduct(tx, id), settings: await getSalesSettings(tx) }));
    if (id !== "new" && !loaded.p) notFound();
    boxes = loaded.settings.shipping.boxes;
    currency = loaded.settings.store.currency;
    const p = loaded.p;
    product = p ? { id: p.id, slug: p.slug, name: p.name, description: p.description, status: p.status, category: p.category, taxCode: p.taxCode, options: p.options, photos: p.photos, seo: p.seo, variants: p.variants.map((v) => ({ id: v.id, options: v.options, sku: v.sku, priceCents: v.priceCents, compareAtCents: v.compareAtCents, weightOz: v.weightOz, box: v.box, unitsPerBox: v.unitsPerBox, shipsAlone: v.shipsAlone, flatShipCents: v.flatShipCents, active: v.active })) } : BLANK;
  }
  return (
    <>
      <PageHeader title={product.name || sayOf(ctx)("New product", "New membership or pack")} />
      <ProductEditor product={product} boxes={boxes} shopBase={`${appUrl()}/p/${ctx.tenant.slug}/shop`} canEdit={may(ctx.member.role, "sales.edit")} demo={demo} currency={currency} />
    </>
  );
}

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <Link href="/sales/products" className="link" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: "var(--bo-text-sm)" }}>
        <ArrowLeft aria-hidden="true" style={{ width: 15, height: 15 }} />
        <Said b="Products" f="Memberships" />
      </Link>
      <Suspense fallback={null}>
        <Body params={params} />
      </Suspense>
    </>
  );
}
