import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import m from "@/components/marketing/marketing.module.css";
import { salesGate } from "@/components/sales/gate";
import { CART_STATUS, pillClass } from "@/components/sales/labels";
import x from "@/components/sales/screens.module.css";
import s from "@/components/sales/sales.module.css";
import { Card, Help, Metric, MetricStrip, PageHeader, SampleBanner, Segmented } from "@/components/ui";
import { can } from "@/lib/access/entitlements";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { formatAgo } from "@/lib/format";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";
import { formatMoney } from "@/lib/sales/money";
import { salesRepo } from "@/lib/sales/repo";
import { defaultSalesSettings } from "@/lib/sales/settings";
import { getSalesSettings } from "@/lib/sales/store";
import type { CartRow } from "@/lib/sales/types";

export const metadata: Metadata = { title: "Carts" };

const NOTE = "Carts where the shopper gave an email at checkout. Left-behind carts come first, so you can follow up while they still want it.";

const DAY = 86_400_000;

const FILTERS = [
  ["all", "All"],
  ["abandoned", "Left behind"],
  ["ordered", "Bought"],
  ["open", "Still shopping"],
  ["inquiry", "Asked for a quote"],
] as const;
type Filter = (typeof FILTERS)[number][0];

type Search = { status?: string };

const RANK: Record<string, number> = { abandoned: 0, checkout: 1, open: 1, inquiry: 2, ordered: 3 };

function matches(c: CartRow, f: Filter) {
  if (f === "all") return true;
  if (f === "open") return c.status === "open" || c.status === "checkout";
  return c.status === f;
}

function itemsLine(c: CartRow): string {
  const shown = c.items.slice(0, 2).map((i) => `${i.qty} × ${i.name}${i.variant ? ` (${i.variant})` : ""}`);
  const more = c.items.length - shown.length;
  return `${shown.join(", ")}${more > 0 ? `, and ${more} more` : ""}`;
}

type Recovery = { marketing: boolean; series: { id: string; name: string; on: boolean } | null };

async function recoveryFor(ctx: PortalContext, demo: boolean): Promise<Recovery> {
  const marketing = can(ctx.tenant, "marketing.sequences");
  if (!marketing || demo) return { marketing, series: null };
  const row = await withTenant(scopeOf(ctx), (tx) => tx.selectFrom("sequences").select(["id", "name", "status"]).where("trigger", "=", "cart").orderBy("status", "desc").orderBy("created_at").limit(1).executeTakeFirst());
  return { marketing, series: row ? { id: row.id, name: row.name, on: row.status === "on" } : null };
}

function RecoveryCard({ r, hours }: { r: Recovery; hours: number }) {
  return (
    <Card title="Win carts back by email" testId="cart-recovery">
      <div className={x.recovery}>
        <p>
          A cart counts as left behind after {hours} quiet {hours === 1 ? "hour" : "hours"} once we have the shopper&apos;s email. You can change that in{" "}
          <Link href="/sales/checkout#carts" className="link">
            Checkout
          </Link>
          .
        </p>
        {!r.marketing ? (
          <>
            <p>With Marketing, an email series can go to each person who leaves a cart, with what was in it and a link back to checkout. It stops the moment they buy.</p>
            <Link href="/marketing" className="btn" data-testid="cart-recovery-marketing">
              See Marketing
              <ArrowRight aria-hidden="true" />
            </Link>
          </>
        ) : r.series ? (
          <>
            <p data-testid="cart-recovery-status">
              {r.series.on ? `"${r.series.name}" is on. Each person who leaves a cart gets it, and it stops when they buy.` : `"${r.series.name}" starts when someone leaves a cart, but it's turned off. Turn it on to send it.`}
            </p>
            <Link href={`/marketing/series/${r.series.id}`} className="btn" data-testid="cart-recovery-open">
              Open the series
              <ArrowRight aria-hidden="true" />
            </Link>
          </>
        ) : (
          <>
            <p>Make an email series that starts when &quot;Someone leaves a cart&quot;. Each person who leaves one gets it, and it stops when they buy. It&apos;s optional; nothing goes out until you turn it on.</p>
            <Link href="/marketing/series" className="btn" data-testid="cart-recovery-new">
              Go to Email series
              <ArrowRight aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
    </Card>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await getPortalContext();
  const blocked = salesGate(ctx, "sales.abandoned");
  if (blocked) return blocked;
  const sp = await searchParams;
  const filter: Filter = FILTERS.some(([k]) => k === sp.status) ? (sp.status as Filter) : "all";
  const demo = demoMode();
  const repo = salesRepo(ctx);
  const [all, settings, recovery] = await Promise.all([repo.carts(), demo ? Promise.resolve(defaultSalesSettings()) : withTenant(scopeOf(ctx), (tx) => getSalesSettings(tx)), recoveryFor(ctx, demo)]);
  const now = new Date();
  const since = now.getTime() - 30 * DAY;
  const currency = settings.store.currency;
  const money = (n: number) => formatMoney(n, currency);
  const left = all.filter((c) => c.status === "abandoned" && (c.abandonedAt ?? c.lastActiveAt).getTime() >= since);
  const bought = all.filter((c) => c.status === "ordered" && c.lastActiveAt.getTime() >= since);
  const rows = all
    .filter((c) => matches(c, filter))
    .sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || (b.abandonedAt ?? b.lastActiveAt).getTime() - (a.abandonedAt ?? a.lastActiveAt).getTime());

  return (
    <>
      {repo.sample && <SampleBanner demo={demo} />}
      <MetricStrip>
        <Metric label="Left behind, 30 days" value={left.length.toLocaleString("en-US")} testId="metric-carts-left" help={<p>Carts with an email that went quiet for {settings.store.abandonedAfterHours} hours or more without being bought, counted by when they went quiet, over the last 30 days.{repo.sample ? " Sample data is on, so this is made up." : ""}</p>} />
        <Metric label="Left behind, value" value={money(left.reduce((n, c) => n + c.subtotalCents, 0))} help={<p>What those left-behind carts held, at the prices the shopper saw, before codes, shipping and tax.</p>} />
        <Metric label="Bought, 30 days" value={bought.length.toLocaleString("en-US")} help={<p>Carts with an email that turned into a paid order, by when the shopper was last in the cart, over the last 30 days. Carts without an email aren&apos;t counted anywhere on this page.</p>} />
      </MetricStrip>

      <div className={`${s.stack} ${x.gapAbove}`}>
        <Segmented label="Show" items={FILTERS.map(([k, label]) => ({ href: k === "all" ? "/sales/carts" : `/sales/carts?status=${k}`, label, current: filter === k }))} />
        <Card title={FILTERS.find(([k]) => k === filter)?.[1] ?? "Carts"} flush testId="cart-list">
          {rows.length === 0 ? (
            <div className={m.empty}>
              <strong>{filter === "all" ? "No carts with an email yet." : "Nothing here."}</strong>
              <span>{filter === "all" ? "Once shoppers reach checkout and give their email, their carts show up here, whether they buy or not." : "Try another filter."}</span>
            </div>
          ) : (
            <div className={x.scrollX}>
              <table className={m.table}>
                <thead>
                  <tr>
                    <th>Shopper</th>
                    <th className={m.hideSm}>In the cart</th>
                    <th className={s.right}>
                      <span className={x.thHelp}>
                        Value
                        <Help title="Cart value">
                          <p>The cart at the prices the shopper saw, trade prices included, before codes, shipping and tax.</p>
                        </Help>
                      </span>
                    </th>
                    <th className={m.hideSm}>Last active</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const who = (
                      <span className={m.cellMain}>
                        <strong>{c.name || c.email}</strong>
                        <span>{c.name ? c.email : `${c.itemCount} ${c.itemCount === 1 ? "item" : "items"}`}</span>
                      </span>
                    );
                    return (
                      <tr key={c.id} data-testid="cart-row" data-status={c.status}>
                        <td>
                          {c.contactId ? (
                            <Link href={`/analyze/contacts?c=${encodeURIComponent(c.contactId)}`} className={x.personLink} data-testid="cart-person">
                              {who}
                            </Link>
                          ) : (
                            who
                          )}
                        </td>
                        <td className={`${m.hideSm} muted`}>{itemsLine(c)}</td>
                        <td className={`${s.money} ${s.right}`}>{money(c.subtotalCents)}</td>
                        <td className={`${m.hideSm} muted`}>{formatAgo(c.lastActiveAt, now)}</td>
                        <td>
                          <span className={pillClass(CART_STATUS[c.status]?.tone ?? "neutral")}>{CART_STATUS[c.status]?.label ?? c.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className={m.pager}>
            <span>
              <span className="num">{rows.length.toLocaleString("en-US")}</span> {rows.length === 1 ? "cart" : "carts"}
            </span>
          </div>
        </Card>
        <RecoveryCard r={recovery} hours={settings.store.abandonedAfterHours} />
      </div>
    </>
  );
}

export default function CartsPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <>
      <PageHeader title="Carts" note={NOTE} />
      <Suspense fallback={null}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}
