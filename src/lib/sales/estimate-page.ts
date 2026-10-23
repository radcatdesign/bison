import "server-only";
// What the estimate builder needs besides the estimate: the catalog to pick
// from, approved trade buyers, the store's defaults, and the client's link.
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import type { PortalContext } from "@/lib/portal";
import { scopeOf } from "@/lib/portal";
import { sampleCatalog, sampleUuid } from "@/lib/sample/sales";
import { variantLabel } from "./catalog";
import { estimateUrl } from "./estimates";
import { publicProducts } from "./products";
import { defaultSalesSettings, type SalesSettings, tierFor } from "./settings";
import { getSalesSettings, readPayments } from "./store";
import type { TradeRow } from "./types";

export type CatalogPick = { productId: string | null; variantId: string | null; name: string; variant: string; sku: string; priceCents: number };
export type TradePick = { id: string; company: string; name: string; email: string; phone: string; tierName: string; percentOff: number };
export type BuilderExtras = { catalog: CatalogPick[]; trade: TradePick[]; currency: string; validDays: number; terms: string; payable: boolean; clientUrl: string | null };

export async function builderExtras(ctx: PortalContext, opts: { estimateId: string | null; sample: boolean; trade: TradeRow[] }): Promise<BuilderExtras> {
  const demo = demoMode();
  let settings: SalesSettings = defaultSalesSettings();
  let catalog: CatalogPick[];
  let payable = false;
  let clientUrl: string | null = null;
  if (demo) {
    catalog = sampleCatalog(ctx.tenant).flatMap((p) => p.variants.map((v) => ({ productId: sampleUuid(`${ctx.tenant.id}:product:${p.slug}`), variantId: sampleUuid(`${ctx.tenant.id}:variant:${v.sku}`), name: p.name, variant: variantLabel(v.options, p.options), sku: v.sku, priceCents: v.priceCents })));
  } else {
    const r = await withTenant(scopeOf(ctx), async (tx) => {
      const products = await publicProducts(tx, 400);
      const link = opts.estimateId && !opts.sample ? await tx.selectFrom("estimates").select(["status", "link_version"]).where("id", "=", opts.estimateId).executeTakeFirst() : undefined;
      return { products, settings: await getSalesSettings(tx), pay: await readPayments(tx), link };
    });
    settings = r.settings;
    payable = r.pay.chargesEnabled;
    catalog = r.products.flatMap((p) => p.variants.filter((v) => v.active).map((v) => ({ productId: p.id, variantId: v.id, name: p.name, variant: v.label, sku: v.sku, priceCents: v.priceCents })));
    if (r.link && r.link.status !== "draft" && r.link.status !== "void" && opts.estimateId) clientUrl = estimateUrl(opts.estimateId, r.link.link_version);
  }
  const tiers = settings.trade.tiers;
  const trade = opts.trade
    .filter((t) => t.status === "approved")
    .map((t) => {
      const tier = tierFor(tiers, t.spendCents, t.tierOverride);
      return { id: t.id, company: t.company, name: t.contactName, email: t.email, phone: t.phone, tierName: tier.name, percentOff: tier.percentOff };
    });
  return { catalog, trade, currency: settings.store.currency, validDays: settings.store.estimates.validDays, terms: settings.store.estimates.terms, payable, clientUrl };
}
