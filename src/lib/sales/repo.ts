import "server-only";
// What Sales screens read, from the database or from sample data. Screens
// never know which. Products, codes and settings are always the company's own;
// orders, estimates, carts and trade accounts are sample while sample data is on.
import { sql } from "kysely";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import type { PortalContext } from "@/lib/portal";
import { scopeOf } from "@/lib/portal";
import { estimateRows, orderRows, sampleCarts, sampleEstimates, sampleOrders, sampleSalesSummary, sampleTrade } from "@/lib/sample/sales";
import { getEstimate, listEstimates } from "./estimates";
import { getOrder, listOrders, type OrderFilter } from "./orders";
import type { PricedCart } from "./pricing";
import { getSalesSettings } from "./store";
import { listTrade } from "./trade";
import type { CartRow, EstimateDetail, EstimateRow, OrderDetail, OrderRow, SalesSummary, TradeRow } from "./types";

export type SalesRepo = {
  sample: boolean;
  summary(): Promise<SalesSummary>;
  orders(f?: OrderFilter): Promise<OrderRow[]>;
  order(id: string): Promise<OrderDetail | null>;
  estimates(status?: string): Promise<EstimateRow[]>;
  estimate(id: string): Promise<EstimateDetail | null>;
  carts(): Promise<CartRow[]>;
  trade(): Promise<TradeRow[]>;
};

const DAY = 86_400_000;

function filterOrders(list: OrderDetail[], f: OrderFilter = {}): OrderRow[] {
  const term = f.search?.trim().toLowerCase();
  return orderRows(
    list.filter((o) => {
      if (f.status === "to_fulfill" && !["pending", "failed"].includes(o.fulfillment)) return false;
      if (f.status === "refunded" && !["refunded", "partially_refunded"].includes(o.status)) return false;
      if (term && !`${o.email} ${o.name} #${o.number}`.toLowerCase().includes(term.replace(/^#/, "#"))) return false;
      return true;
    }),
  );
}

export function salesRepo(ctx: PortalContext): SalesRepo {
  const sample = demoMode() || ctx.settings.sampleData;
  const t = ctx.tenant;
  if (sample) {
    return {
      sample,
      summary: async () => sampleSalesSummary(t),
      orders: async (f) => filterOrders(sampleOrders(t), f),
      order: async (id) => sampleOrders(t).find((o) => o.id === id) ?? null,
      estimates: async (status) => estimateRows(sampleEstimates(t).filter((e) => !status || status === "all" || (status === "open" ? ["sent", "viewed", "changes_requested", "approved", "invoiced"].includes(e.status) : e.status === status))),
      estimate: async (id) => sampleEstimates(t).find((e) => e.id === id) ?? null,
      carts: async () => sampleCarts(t),
      trade: async () => sampleTrade(t),
    };
  }
  const scope = scopeOf(ctx);
  return {
    sample,
    async summary() {
      return withTenant(scope, async (tx) => {
        const now = Date.now();
        const settings = await getSalesSettings(tx);
        const { rows } = await sql<{ rev: string; prev: string; n: string; open_n: string; open_v: string; fulfill: string; ab_n: string; ab_v: string; trade: string }>`select
          coalesce(sum(total_cents - refunded_cents) filter (where paid_at >= ${new Date(now - 30 * DAY)}), 0) as rev,
          coalesce(sum(total_cents - refunded_cents) filter (where paid_at >= ${new Date(now - 60 * DAY)} and paid_at < ${new Date(now - 30 * DAY)}), 0) as prev,
          count(*) filter (where paid_at >= ${new Date(now - 30 * DAY)}) as n,
          (select count(*) from estimates where status in ('sent', 'viewed', 'changes_requested', 'approved', 'invoiced')) as open_n,
          (select coalesce(sum(total_cents), 0) from estimates where status in ('sent', 'viewed', 'changes_requested', 'approved', 'invoiced')) as open_v,
          count(*) filter (where fulfillment in ('pending', 'failed')) as fulfill,
          (select count(*) from carts where status = 'abandoned' and abandoned_at >= ${new Date(now - 30 * DAY)}) as ab_n,
          (select coalesce(sum((priced ->> 'subtotalCents')::int), 0) from carts where status = 'abandoned' and abandoned_at >= ${new Date(now - 30 * DAY)}) as ab_v,
          (select count(*) from trade_accounts where status = 'applied') as trade
          from orders where status <> 'canceled'`.execute(tx);
        const r = rows[0];
        const n = Number(r?.n ?? 0);
        const rev = Number(r?.rev ?? 0);
        return { revenueCents: rev, revenuePrevCents: Number(r?.prev ?? 0), orders: n, averageOrderCents: n ? Math.round(rev / n) : null, openEstimates: Number(r?.open_n ?? 0), openEstimatesCents: Number(r?.open_v ?? 0), toFulfill: Number(r?.fulfill ?? 0), abandoned: Number(r?.ab_n ?? 0), abandonedCents: Number(r?.ab_v ?? 0), tradeWaiting: Number(r?.trade ?? 0), currency: settings.store.currency };
      });
    },
    orders: (f) => withTenant(scope, (tx) => listOrders(tx, f)),
    order: (id) => withTenant(scope, (tx) => getOrder(tx, id)),
    estimates: (status) => withTenant(scope, (tx) => listEstimates(tx, (status ?? "all") as never)),
    estimate: (id) => withTenant(scope, (tx) => getEstimate(tx, id)),
    async carts() {
      return withTenant(scope, async (tx) => {
        const rows = await tx.selectFrom("carts").select(["id", "status", "email", "name", "priced", "last_active_at", "abandoned_at", "order_id", "contact_id"]).where("email", "is not", null).where("status", "in", ["abandoned", "ordered", "open", "checkout", "inquiry"]).orderBy("last_active_at", "desc").limit(300).execute();
        return rows
          .map((r) => {
            const p = (r.priced ?? {}) as Partial<PricedCart>;
            return { id: r.id, status: r.status, email: r.email, name: r.name, itemCount: p.itemCount ?? 0, subtotalCents: p.subtotalCents ?? 0, currency: p.currency ?? "usd", lastActiveAt: r.last_active_at, abandonedAt: r.abandoned_at, items: (p.lines ?? []).map((l) => ({ name: l.name, variant: l.variant, qty: l.qty, lineCents: l.lineCents })), orderId: r.order_id, contactId: r.contact_id };
          })
          .filter((c) => c.itemCount > 0);
      });
    },
    trade: () => withTenant(scope, (tx) => listTrade(tx)),
  };
}
