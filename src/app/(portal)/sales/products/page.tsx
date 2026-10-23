import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import m from "@/components/marketing/marketing.module.css";
import { salesGate } from "@/components/sales/gate";
import { ProductImport } from "@/components/sales/product-import";
import s from "@/components/sales/sales.module.css";
import { SalesSetupFor } from "@/components/sales/setup";
import { Card, PageHeader } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { sampleCatalog, sampleUuid } from "@/lib/sample/sales";
import { formatMoney } from "@/lib/sales/money";
import { listProducts, type ProductRow } from "@/lib/sales/products";
import { getSalesSettings } from "@/lib/sales/store";

export const metadata: Metadata = { title: "Products" };

const NOTE = "Everything you sell, with options, prices, photos and what it weighs. Active products show in your shop and each has its own page.";

type Search = { q?: string; status?: string };

const STATUS: Record<string, string> = { active: "Active", draft: "Draft", archived: "Archived" };

async function Body({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await getPortalContext();
  const blocked = salesGate(ctx, "sales.products");
  if (blocked) return blocked;
  const sp = await searchParams;
  const demo = demoMode();
  const status = sp.status === "draft" || sp.status === "archived" || sp.status === "active" ? sp.status : "all";
  const canEdit = may(ctx.member.role, "sales.edit");
  let rows: ProductRow[];
  let currency = "usd";
  if (demo) {
    rows = sampleCatalog(ctx.tenant).map((p) => ({ id: sampleUuid(`${ctx.tenant.id}:product:${p.slug}`), slug: p.slug, name: p.name, status: "active", category: p.category, photo: null, minCents: Math.min(...p.variants.map((v) => v.priceCents)), maxCents: Math.max(...p.variants.map((v) => v.priceCents)), variants: p.variants.length, missingWeight: false, updatedAt: new Date() }));
  } else {
    const loaded = await withTenant(scopeOf(ctx), async (tx) => ({ rows: await listProducts(tx, { status, search: sp.q?.slice(0, 100) }), currency: (await getSalesSettings(tx)).store.currency }));
    rows = loaded.rows;
    currency = loaded.currency;
  }
  if (demo && sp.q) rows = rows.filter((r) => r.name.toLowerCase().includes(sp.q!.toLowerCase()));
  const price = (r: ProductRow) => (r.minCents === null ? "No price" : r.minCents === r.maxCents ? formatMoney(r.minCents, currency) : `From ${formatMoney(r.minCents, currency)}`);

  return (
    <>
      <PageHeader
        title="Products"
        note={NOTE}
        actions={
          <>
            <ProductImport canEdit={canEdit} demo={demo} />
            {canEdit && (
              <Link href="/sales/products/new" className="btn btn-primary" data-testid="new-product">
                <Plus aria-hidden="true" />
                New product
              </Link>
            )}
          </>
        }
      />
      <SalesSetupFor ctx={ctx} tool="products" />
      {demo && <p className="notice" style={{ marginBottom: 18 }}>This demo shows a sample catalog. In your own account you import or add your products here.</p>}
      <Card title="Catalog" flush testId="product-list">
        <form className={m.toolbar} action="/sales/products" style={{ padding: "14px 14px 0" }}>
          <input name="q" className="input" defaultValue={sp.q} placeholder="Search products" aria-label="Search products" />
          <select name="status" className="select" defaultValue={status} aria-label="Status">
            <option value="all">Active and drafts</option>
            <option value="active">Active</option>
            <option value="draft">Drafts</option>
            <option value="archived">Archived</option>
          </select>
          <button type="submit" className="btn">
            Show
          </button>
        </form>
        {rows.length === 0 ? (
          <div className={m.empty}>
            <strong>{sp.q || status !== "all" ? "Nothing matches that." : "No products yet."}</strong>
            <span>{sp.q || status !== "all" ? "Try a different search or filter." : "Import a spreadsheet, a Shopify export or a product feed, or add products one at a time."}</span>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className={m.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th className={m.hideSm}>Versions</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-testid="product-row">
                    <td>
                      <Link href={`/sales/products/${demo ? r.slug : r.id}`} className={s.productCell} style={{ color: "inherit", textDecoration: "none" }}>
                        <span className={s.thumb} aria-hidden="true">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {r.photo && <img src={r.photo} alt="" />}
                        </span>
                        <span className={m.cellMain}>
                          <strong>{r.name}</strong>
                          <span>{[r.category, r.missingWeight ? "No weight" : ""].filter(Boolean).join(" · ")}</span>
                        </span>
                      </Link>
                    </td>
                    <td className={s.money}>{price(r)}</td>
                    <td className={`${m.hideSm} muted`}>{r.variants}</td>
                    <td>
                      <span className={r.status === "active" ? "pill pill-good" : "pill"}>{STATUS[r.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={m.pager}>
          <span>
            <span className="num">{rows.length.toLocaleString("en-US")}</span> {rows.length === 1 ? "product" : "products"}
          </span>
        </div>
      </Card>
    </>
  );
}

export default function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<PageHeader title="Products" note={NOTE} />}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}
