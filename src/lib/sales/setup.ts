import "server-only";
// Fills the Sales setup facts from the database, in one transaction.
import { sql } from "kysely";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { isVerified, readSending } from "@/lib/marketing/sending";
import type { PortalContext } from "@/lib/portal";
import { scopeOf } from "@/lib/portal";
import { sampleCatalog } from "@/lib/sample/sales";
import { paymentsProviderName } from "./payments";
import { productCount } from "./products";
import { addressComplete } from "./settings";
import { buildSalesSetup, type SalesFacts, type SalesTool } from "./setup-steps";
import { getSalesSettings, readCarrier, readPayments } from "./store";

const saved = (v: unknown) => Boolean(v && typeof v === "object" && Object.keys(v).length > 0);

export async function loadSalesFacts(ctx: PortalContext): Promise<SalesFacts> {
  return withTenant(scopeOf(ctx), async (tx) => {
    const settings = await getSalesSettings(tx);
    const row = await tx.selectFrom("sales_settings").select(["store", "shipping", "trade"]).executeTakeFirst();
    const conn = await readPayments(tx);
    const counts = await productCount(tx);
    const shipStation = await readCarrier(tx, "shipstation");
    const upsConn = await readCarrier(tx, "ups");
    const { rows } = await sql<{ photos: number; orders: number; sent: number; codes: number; applications: number; approved: number }>`select
        (select count(*)::int from products where status = 'active' and jsonb_array_length(photos) = 0) as photos,
        (select count(*)::int from orders) as orders,
        (select count(*)::int from estimates where sent_at is not null) as sent,
        (select count(*)::int from discounts) as codes,
        (select count(*)::int from trade_accounts) as applications,
        (select count(*)::int from trade_accounts where status = 'approved') as approved`.execute(tx);
    const r = rows[0];
    const storeSaved = (row?.store ?? {}) as Record<string, unknown>;
    return {
      canManageSettings: may(ctx.member.role, "settings.manage"),
      payments: { serverReady: paymentsProviderName() !== "none", account: Boolean(conn.accountId), live: conn.chargesEnabled, taxActive: conn.tax === "active", taxOn: settings.store.checkout.tax },
      email: { verified: isVerified(await readSending(tx)) },
      products: { total: counts.total, active: counts.active, missingWeight: counts.missingWeight, withoutPhotos: r.photos },
      shipping: { fromSet: addressComplete(settings.shipping.from), saved: saved(row?.shipping), source: settings.shipping.source, carrierConnected: shipStation.connected || upsConn.connected, fulfillmentOn: settings.shipping.fulfillment === "shipstation", shipStationConnected: shipStation.connected },
      checkout: { alertsSaved: Array.isArray(storeSaved.alertEmails) && storeSaved.alertEmails.length > 0, orders: r.orders },
      estimates: { termsSet: Boolean(settings.store.estimates.terms.trim()), sent: r.sent },
      discounts: { count: r.codes },
      trade: { saved: saved(row?.trade), applications: r.applications, approved: r.approved },
    };
  });
}

/** The demo has nothing connected; its catalog is the sample one. */
export function demoSalesFacts(ctx: PortalContext): SalesFacts {
  const products = sampleCatalog(ctx.tenant).length;
  return {
    canManageSettings: true,
    payments: { serverReady: true, account: false, live: false, taxActive: false, taxOn: false },
    email: { verified: false },
    products: { total: products, active: products, missingWeight: 0, withoutPhotos: products },
    shipping: { fromSet: false, saved: false, source: "flat", carrierConnected: false, fulfillmentOn: false, shipStationConnected: false },
    checkout: { alertsSaved: false, orders: 0 },
    estimates: { termsSet: false, sent: 0 },
    discounts: { count: 0 },
    trade: { saved: false, applications: 0, approved: 0 },
  };
}

export async function loadSalesSetup(ctx: PortalContext, demo: boolean): Promise<SalesTool[]> {
  return buildSalesSetup(demo ? demoSalesFacts(ctx) : await loadSalesFacts(ctx), ctx.tenant.edition);
}
