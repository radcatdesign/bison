import { ExternalLink, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import m from "@/components/marketing/marketing.module.css";
import { salesGate } from "@/components/sales/gate";
import { pillClass, salesLabels } from "@/components/sales/labels";
import { OrderActions } from "@/components/sales/order-actions";
import { SaidHeader } from "@/components/sales/said";
import s from "@/components/sales/sales.module.css";
import { Card, Help, PageHeader, SampleBanner, Segmented } from "@/components/ui";
import { may } from "@/config/roles";
import { DEMO_MESSAGE } from "@/lib/demo";
import { sayOf } from "@/lib/edition";
import { demoMode } from "@/lib/env";
import { getPortalContext, type PortalContext } from "@/lib/portal";
import { SampleModeError } from "@/lib/repo/types";
import { formatMoney } from "@/lib/sales/money";
import { paymentsProvider } from "@/lib/sales/payments";
import { salesRepo } from "@/lib/sales/repo";
import { addressLines } from "@/lib/sales/settings";

export async function generateMetadata(): Promise<Metadata> {
  return { title: sayOf(await getPortalContext())("Orders", "Purchases") };
}

const NOTE: [string, string] = ["Every paid order, from the shop and from paid estimates. Money goes to your own Stripe account.", "Every paid membership, pack and training package, online and from paid quotes. Money goes to your own Stripe account."];

type Search = { status?: string; q?: string; id?: string };

const FILTERS = [
  ["all", "All"],
  ["to_fulfill", "Not in ShipStation yet"],
  ["refunded", "Refunded"],
] as const;

async function Panel({ ctx, id, back }: { ctx: PortalContext; id: string; back: string }) {
  const repo = salesRepo(ctx);
  const say = sayOf(ctx);
  const { ORDER_STATUS, SOURCE, FULFILLMENT: FULFILLED } = salesLabels(ctx.tenant.edition);
  const o = await repo.order(id);
  if (!o) {
    return (
      <aside className={m.panel} aria-label={say("Order", "Purchase")}>
        <div className={m.panelBody}>
          <p>{say("That order isn't here.", "That purchase isn't here.")}</p>
          <Link href={back} className="btn" scroll={false}>
            Close
          </Link>
        </div>
      </aside>
    );
  }
  const money = (n: number) => formatMoney(n, o.currency);
  const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: ctx.settings.timezone });
  const pay = paymentsProvider();
  const stripeUrl = !repo.sample && pay && o.stripe.accountId && o.stripe.paymentIntentId ? pay.paymentUrl(o.stripe.accountId, o.stripe.paymentIntentId) : null;
  const locked = demoMode() ? DEMO_MESSAGE : repo.sample ? new SampleModeError().message : null;
  const status = o.status === "paid" ? FULFILLED[o.fulfillment] : ORDER_STATUS[o.status];
  const label = say("Order", "Purchase");
  return (
    <aside className={m.panel} aria-label={`${label} #${o.number}`} data-testid="order-panel">
      <div className={m.panelHead}>
        <div>
          <strong>
            {label} #{o.number}
          </strong>
          <span>
            {o.name || o.email} · {when.format(o.paidAt)}
          </span>
        </div>
        <Link href={back} className={m.iconButton} aria-label="Close" scroll={false}>
          <X aria-hidden="true" />
        </Link>
      </div>
      <div className={m.panelBody}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span className={pillClass(ORDER_STATUS[o.status].tone)}>{ORDER_STATUS[o.status].label}</span>
          <span className={pillClass(status.tone)} data-testid="order-fulfillment">
            {status.label}
          </span>
          <span className="pill">{SOURCE[o.source] ?? o.source}</span>
          {o.tradeCompany && (
            <span className="pill pill-accent">
              {say("Trade", "Corporate")}: {o.tradeCompany}
            </span>
          )}
        </div>

        <section className={m.panelSection}>
          <h3>Items</h3>
          <ul className={s.lines}>
            {o.items.map((i, n) => (
              <li key={`${i.sku}-${n}`}>
                <div>
                  {i.qty} × {i.name}
                  <br />
                  <span>{[i.variant, i.sku].filter(Boolean).join(" · ")}</span>
                </div>
                <span className={s.money} style={{ color: "inherit", fontSize: "inherit" }}>
                  {money(i.lineCents)}
                </span>
              </li>
            ))}
          </ul>
          <dl className={s.totals}>
            <dt>Subtotal</dt>
            <dd>{money(o.subtotalCents)}</dd>
            {o.discountCents > 0 && (
              <>
                <dt>{o.discountCode ? `${say("Code", "Promo code")} ${o.discountCode}` : "Discount"}</dt>
                <dd>−{money(o.discountCents)}</dd>
              </>
            )}
            <dt>{o.shippingService || "Shipping"}</dt>
            <dd>{o.shippingCents ? money(o.shippingCents) : "Free"}</dd>
            {o.taxCents > 0 && (
              <>
                <dt>Tax</dt>
                <dd>{money(o.taxCents)}</dd>
              </>
            )}
            <dt className={s.grand}>Paid</dt>
            <dd className={s.grand}>{money(o.totalCents)}</dd>
            {o.refundedCents > 0 && (
              <>
                <dt>Refunded</dt>
                <dd>−{money(o.refundedCents)}</dd>
              </>
            )}
          </dl>
        </section>

        <section className={m.panelSection}>
          <h3>Ship to</h3>
          <p style={{ margin: 0, whiteSpace: "pre-line" }}>{addressLines(o.shipTo).join("\n") || say("No address. It doesn't need shipping.", "Nothing to ship. Memberships, packs and training don't ship; only gear does.")}</p>
          <p style={{ margin: 0 }} className="muted">
            <a href={`mailto:${o.email}`}>{o.email}</a>
            {o.phone ? ` · ${o.phone}` : ""}
          </p>
          {o.contactId && (
            <Link href={`/analyze/contacts?c=${o.contactId}`} className="link">
              {say("Their contact page", "Their page in Leads")}
            </Link>
          )}
        </section>

        <section className={m.panelSection}>
          <h3>What happened</h3>
          <dl className={m.facts}>
            <dt>Team email</dt>
            <dd data-testid="order-alert">{o.alert.error ? `Didn't send: ${o.alert.error}` : o.alert.at ? `Sent to ${(o.alert.to ?? []).join(", ")}` : "Not sent yet"}</dd>
            <dt>ShipStation</dt>
            <dd>{o.fulfillmentDetail.error ? `${FULFILLED[o.fulfillment].label}: ${o.fulfillmentDetail.error}` : o.fulfillmentDetail.externalId ? `Order ${o.fulfillmentDetail.externalId}` : FULFILLED[o.fulfillment].label}</dd>
            {o.fulfillmentDetail.tracking && (
              <>
                <dt>Tracking</dt>
                <dd className="mono">{o.fulfillmentDetail.tracking}</dd>
              </>
            )}
            {o.estimate && (
              <>
                <dt>{say("Estimate", "Quote")}</dt>
                <dd>
                  <Link href={`/sales/estimates/${o.estimate.id}`}>#{o.estimate.number}</Link>
                </dd>
              </>
            )}
          </dl>
          {stripeUrl && (
            <a href={stripeUrl} className="btn" target="_blank" rel="noopener noreferrer" data-testid="order-stripe">
              <ExternalLink aria-hidden="true" />
              The payment in Stripe
            </a>
          )}
        </section>

        <section className={m.panelSection}>
          <h3>Actions</h3>
          <OrderActions id={o.id} currency={o.currency} refundableCents={o.totalCents - o.refundedCents} canEdit={may(ctx.member.role, "sales.edit")} canRefund={may(ctx.member.role, "refunds.issue")} paidByStripe={Boolean(o.stripe.paymentIntentId)} fulfillment={o.fulfillment} hasFulfillment={o.fulfillment !== "none"} locked={locked} />
        </section>
      </div>
    </aside>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await getPortalContext();
  const blocked = salesGate(ctx, "sales.orders");
  if (blocked) return blocked;
  const sp = await searchParams;
  const status = sp.status === "to_fulfill" || sp.status === "refunded" ? sp.status : "all";
  const repo = salesRepo(ctx);
  const say = sayOf(ctx);
  const { ORDER_STATUS, SOURCE, FULFILLMENT: FULFILLED } = salesLabels(ctx.tenant.edition);
  const rows = await repo.orders({ status, search: sp.q?.slice(0, 100) });
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status: status === "all" ? undefined : status, q: sp.q, ...extra })) if (v) p.set(k, v);
    const str = p.toString();
    return `/sales/orders${str ? `?${str}` : ""}`;
  };
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: ctx.settings.timezone });
  const total = rows.reduce((n, r) => n + r.totalCents - r.refundedCents, 0);
  return (
    <>
      <PageHeader title={say("Orders", "Purchases")} note={say(...NOTE)} />
      {repo.sample && <SampleBanner demo={demoMode()} />}
      <div className={s.stack}>
        <Segmented label="Show" items={FILTERS.map(([k, label]) => ({ href: k === "all" ? "/sales/orders" : `/sales/orders?status=${k}`, label, current: status === k }))} />
        <Card title={say("Orders", "Purchases")} flush testId="order-list">
          <form className={m.toolbar} action="/sales/orders" style={{ padding: "14px 14px 0" }}>
            {status !== "all" && <input type="hidden" name="status" value={status} />}
            <input name="q" className="input" defaultValue={sp.q} placeholder="Search by name, email or #number" aria-label={say("Search orders", "Search purchases")} />
            <button type="submit" className="btn">
              Search
            </button>
          </form>
          {rows.length === 0 ? (
            <div className={m.empty}>
              <strong>{sp.q || status !== "all" ? "Nothing matches that." : say("No orders yet.", "No purchases yet.")}</strong>
              <span>{sp.q || status !== "all" ? "Try another search or filter." : say("Paid orders from your shop and from paid estimates show up here.", "Paid purchases from your club's online store and from paid quotes show up here.")}</span>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className={m.table}>
                <thead>
                  <tr>
                    <th>{say("Order", "Purchase")}</th>
                    <th className={m.hideSm}>Where from</th>
                    <th>Status</th>
                    <th className={s.right}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id} data-testid="order-row" aria-current={sp.id === o.id ? "true" : undefined}>
                      <td>
                        <Link href={qs({ id: o.id })} scroll={false} className={m.cellMain} style={{ color: "inherit", textDecoration: "none" }}>
                          <strong>
                            #{o.number} {o.name || o.email}
                          </strong>
                          <span>
                            {fmt.format(o.paidAt)} · {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                            {o.tradeCompany ? ` · ${o.tradeCompany}` : ""}
                          </span>
                        </Link>
                      </td>
                      <td className={`${m.hideSm} muted`}>{SOURCE[o.source] ?? o.source}</td>
                      <td>
                        <span className={pillClass(o.status === "paid" ? FULFILLED[o.fulfillment].tone : ORDER_STATUS[o.status].tone)}>{o.status === "paid" ? FULFILLED[o.fulfillment].label : ORDER_STATUS[o.status].label}</span>
                      </td>
                      <td className={`${s.money} ${s.right}`}>{formatMoney(o.totalCents, o.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className={m.pager}>
            <span>
              <span className="num">{rows.length.toLocaleString("en-US")}</span> {rows.length === 1 ? say("order", "purchase") : say("orders", "purchases")}, {formatMoney(total, rows[0]?.currency ?? "usd")}
              <Help title={say("Orders total", "Purchases total")}>
                <p>{say("What the orders in this list were paid, including shipping and tax, less anything refunded.", "What the purchases in this list were paid, including shipping and tax, less anything refunded.")}</p>
              </Help>
            </span>
          </div>
        </Card>
      </div>
      {sp.id && <Panel ctx={ctx} id={sp.id} back={qs({})} />}
    </>
  );
}

export default function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<SaidHeader title={["Orders", "Purchases"]} note={NOTE} />}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}
