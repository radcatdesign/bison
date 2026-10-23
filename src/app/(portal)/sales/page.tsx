import { ArrowRight, Boxes, ClipboardList, Package, ReceiptText, ShoppingCart, Store, Tag, Truck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import h from "@/app/(portal)/marketing/overview.module.css";
import { pillClass, FULFILLMENT, ORDER_STATUS } from "@/components/sales/labels";
import m from "@/components/marketing/marketing.module.css";
import { salesGate } from "@/components/sales/gate";
import s from "@/components/sales/sales.module.css";
import { Card, Metric, MetricStrip, PageHeader } from "@/components/ui";
import { CATALOG } from "@/config/catalog";
import { daysLeft } from "@/lib/access/entitlements";
import { demoMode } from "@/lib/env";
import { formatChange } from "@/lib/format";
import { progressOf } from "@/lib/marketing/setup-steps";
import { getPortalContext } from "@/lib/portal";
import { formatMoney } from "@/lib/sales/money";
import { salesRepo } from "@/lib/sales/repo";
import { loadSalesSetup } from "@/lib/sales/setup";

export const metadata: Metadata = { title: "Sales" };

const TOOLS = [
  { href: "/sales/estimates", name: "Estimates", body: "Quotes clients approve on their own page, then pay by invoice.", icon: ClipboardList },
  { href: "/sales/orders", name: "Orders", body: "Every paid order, with refunds and where it is in fulfillment.", icon: Package },
  { href: "/sales/products", name: "Products", body: "Your catalog, with options, prices, photos and weights.", icon: Boxes },
  { href: "/sales/discounts", name: "Discount codes", body: "Private codes with limits, spelled out before you save.", icon: Tag },
  { href: "/sales/trade", name: "Trade accounts", body: "Wholesale buyers, their tiers and what they've bought.", icon: Users },
  { href: "/sales/carts", name: "Carts", body: "Carts people left behind, and the ones that came back.", icon: ShoppingCart },
  { href: "/sales/checkout", name: "Checkout", body: "Shipping, tax, order limits and who hears about orders.", icon: Truck },
  { href: "/settings/payments", name: "Payments", body: "Your own Stripe account, where every payment goes.", icon: ReceiptText },
];

async function Body() {
  const ctx = await getPortalContext();
  const blocked = salesGate(ctx, "sales.estimates");
  if (blocked) return blocked;
  const demo = demoMode();
  const repo = salesRepo(ctx);
  const [sum, recent, tools, estimates] = await Promise.all([repo.summary(), repo.orders({ limit: 6 }), loadSalesSetup(ctx, demo), repo.estimates("changes_requested")]);
  const state = ctx.tenant.access.states["module:sales"];
  const status = state.via === "trial" && state.trialEndsAt ? `${CATALOG["module:sales"].name} trial: ${daysLeft(state.trialEndsAt)} days left.` : state.pastDue ? "Your last payment didn't go through. Update your card in Settings to keep this on." : null;
  const p = progressOf(tools);
  const money = (n: number) => formatMoney(n, sum.currency);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: ctx.settings.timezone });

  const attention = [
    sum.toFulfill ? { href: "/sales/orders?status=to_fulfill", text: `${sum.toFulfill} ${sum.toFulfill === 1 ? "order hasn't" : "orders haven't"} reached ShipStation yet`, tone: "warn" as const } : null,
    estimates.length ? { href: "/sales/estimates?status=changes_requested", text: `${estimates.length} ${estimates.length === 1 ? "client asked" : "clients asked"} for changes to an estimate`, tone: "warn" as const } : null,
    sum.tradeWaiting ? { href: "/sales/trade", text: `${sum.tradeWaiting} trade ${sum.tradeWaiting === 1 ? "application is" : "applications are"} waiting for you`, tone: "accent" as const } : null,
    sum.abandoned ? { href: "/sales/carts", text: `${sum.abandoned} ${sum.abandoned === 1 ? "cart was" : "carts were"} left behind in 30 days, worth ${money(sum.abandonedCents)}`, tone: "neutral" as const } : null,
  ].filter((x): x is NonNullable<typeof x> => Boolean(x));

  return (
    <div data-testid="module-sales">
      <PageHeader
        title="Sales"
        note="Estimates, orders and your shop, paid into your own Stripe account."
        actions={
          <>
            <Link href={`/p/${ctx.tenant.slug}/shop`} className="btn" target="_blank" rel="noopener">
              <Store aria-hidden="true" />
              Your shop
            </Link>
            <Link href="/sales/estimates/new" className="btn btn-primary" data-testid="overview-new-estimate">
              New estimate
            </Link>
          </>
        }
      />
      {status && (
        <p className="notice" style={{ marginBottom: 20 }}>
          {status}
        </p>
      )}
      {repo.sample && !demo && <p className="notice" style={{ marginBottom: 20 }}>Sample data is on, so these orders, estimates and carts are made up. Turn it off in Settings when you&apos;re ready for your own.</p>}

      {p.next && (
        <Link href="/sales/setup" className={`card ${h.tool}`} style={{ marginBottom: 24 }} data-testid="sales-overview-setup">
          <span className={h.toolText}>
            <strong>
              Setup: {p.done} of {p.total} steps done
            </strong>
            <span>
              Next: {p.next.title.charAt(0).toLowerCase()}
              {p.next.title.slice(1)} ({p.next.tool.name})
            </span>
            <span className={m.bar} aria-hidden="true" style={{ marginTop: 8 }}>
              <span style={{ width: `${p.total ? Math.round((p.done / p.total) * 100) : 0}%` }} />
            </span>
          </span>
          <ArrowRight aria-hidden="true" className={h.arrow} />
        </Link>
      )}

      <MetricStrip>
        <Metric label="Revenue, 30 days" value={money(sum.revenueCents)} change={formatChange(sum.revenueCents, sum.revenuePrevCents, 30)} testId="metric-revenue" help={<p>What paid orders came to in the last 30 days, including shipping and tax, less refunds. Orders from the shop and from paid estimates both count.{repo.sample ? " Sample data is on, so this is made up." : ""}</p>} />
        <Metric label="Orders, 30 days" value={sum.orders.toLocaleString("en-US")} help={<p>Paid orders in the last 30 days, from the shop and from paid estimates.</p>} />
        <Metric label="Average order" value={sum.averageOrderCents === null ? "None yet" : money(sum.averageOrderCents)} help={<p>Revenue in the last 30 days divided by the number of orders.</p>} />
        <Metric label="Open estimates" value={money(sum.openEstimatesCents)} help={<p>The total of {sum.openEstimates} estimates that are sent, viewed, waiting on changes, approved or invoiced but not paid yet.</p>} />
      </MetricStrip>

      <div className={s.grid2} style={{ marginTop: 24 }}>
        <Card title="Needs you" id="attention">
          {attention.length ? (
            <ul className={s.attention} data-testid="sales-attention">
              {attention.map((a) => (
                <li key={a.href}>
                  <Link href={a.href}>
                    <strong>{a.text}</strong>
                    <ArrowRight aria-hidden="true" style={{ width: 16, height: 16, flex: "none" }} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing waiting on you right now.</p>
          )}
        </Card>
        <Card title="Latest orders" id="recent" flush aside={<Link href="/sales/orders" className="link">All orders</Link>}>
          {recent.length ? (
            <table className={m.table}>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/sales/orders?id=${o.id}`} className={m.cellMain} style={{ color: "inherit", textDecoration: "none" }}>
                        <strong>
                          #{o.number} {o.name || o.email}
                        </strong>
                        <span>
                          {fmt.format(o.paidAt)} · {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                        </span>
                      </Link>
                    </td>
                    <td className={m.hideSm}>
                      <span className={pillClass(o.status === "paid" ? FULFILLMENT[o.fulfillment].tone : ORDER_STATUS[o.status].tone)}>{o.status === "paid" ? FULFILLMENT[o.fulfillment].label : ORDER_STATUS[o.status].label}</span>
                    </td>
                    <td className={`${s.money} ${s.right}`}>{formatMoney(o.totalCents, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={m.empty}>
              <strong>No orders yet</strong>
              <span>Share a product link or your shop page. Paid orders show up here.</span>
            </div>
          )}
        </Card>
      </div>

      <h2 className={h.heading} style={{ marginTop: 30 }}>
        Tools
      </h2>
      <ul className={h.tools}>
        {TOOLS.map(({ href, name, body, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className={`card ${h.tool}`} data-testid="sales-tool">
              <span className={h.toolIcon} aria-hidden="true">
                <Icon />
              </span>
              <span className={h.toolText}>
                <strong>{name}</strong>
                <span>{body}</span>
              </span>
              <ArrowRight aria-hidden="true" className={h.arrow} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={<PageHeader title="Sales" />}>
      <Body />
    </Suspense>
  );
}
