import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import m from "@/components/marketing/marketing.module.css";
import { salesGate } from "@/components/sales/gate";
import { pillClass, salesLabels } from "@/components/sales/labels";
import { SaidHeader } from "@/components/sales/said";
import x from "@/components/sales/screens.module.css";
import s from "@/components/sales/sales.module.css";
import { Card, Help, Metric, MetricStrip, SampleBanner, Segmented } from "@/components/ui";
import { itemOf, type Say } from "@/config/editions";
import { can } from "@/lib/access/entitlements";
import { withTenant } from "@/lib/db";
import { sayOf } from "@/lib/edition";
import { demoMode } from "@/lib/env";
import { formatAgo } from "@/lib/format";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";
import { formatMoney } from "@/lib/sales/money";
import { salesRepo } from "@/lib/sales/repo";
import { defaultSalesSettings } from "@/lib/sales/settings";
import { getSalesSettings } from "@/lib/sales/store";
import type { CartRow } from "@/lib/sales/types";

export async function generateMetadata(): Promise<Metadata> {
  return { title: sayOf(await getPortalContext())("Carts", "Unfinished joins") };
}

const NOTE: [string, string] = [
  "Carts where the shopper gave an email at checkout. Left-behind carts come first, so you can follow up while they still want it.",
  "People who started joining online and gave their email at checkout. The ones who didn't finish come first, so your front desk can follow up while it's fresh.",
];

const DAY = 86_400_000;

const FILTERS = [
  ["all", "All"],
  ["abandoned", "Left behind"],
  ["ordered", "Bought"],
  ["open", "Still shopping"],
  ["inquiry", "Asked for a quote"],
] as const;
type Filter = (typeof FILTERS)[number][0];

const FIT_FILTERS: Record<Filter, string> = { all: "All", abandoned: "Didn't finish", ordered: "Finished", open: "Still choosing", inquiry: "Asked for a quote" };
const filtersFor = (say: Say) => FILTERS.map(([k, label]) => [k, say(label, FIT_FILTERS[k])] as const);

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

function RecoveryCard({ r, hours, say, marketingName }: { r: Recovery; hours: number; say: Say; marketingName: string }) {
  return (
    <Card title={say("Win carts back by email", "Win unfinished joins back by email")} testId="cart-recovery">
      <div className={x.recovery}>
        <p>
          {say("A cart counts as left behind", "A join counts as unfinished")} after {hours} quiet {hours === 1 ? "hour" : "hours"} once we have {say("the shopper's", "their")} email. You can change that in{" "}
          <Link href="/sales/checkout#carts" className="link">
            Checkout
          </Link>
          .
        </p>
        {!r.marketing ? (
          <>
            <p>{say("With Marketing, an email series can go to each person who leaves a cart, with what was in it and a link back to checkout. It stops the moment they buy.", `With ${marketingName}, a follow-up can go to each person who doesn't finish joining, with what they picked and a link back to checkout. It stops the moment they buy.`)}</p>
            <Link href="/marketing" className="btn" data-testid="cart-recovery-marketing">
              See {marketingName}
              <ArrowRight aria-hidden="true" />
            </Link>
          </>
        ) : r.series ? (
          <>
            <p data-testid="cart-recovery-status">
              {r.series.on
                ? say(`"${r.series.name}" is on. Each person who leaves a cart gets it, and it stops when they buy.`, `"${r.series.name}" is on. Each person who doesn't finish joining gets it, and it stops when they buy.`)
                : say(`"${r.series.name}" starts when someone leaves a cart, but it's turned off. Turn it on to send it.`, `"${r.series.name}" starts when someone doesn't finish joining, but it's turned off. Turn it on to send it.`)}
            </p>
            <Link href={`/marketing/series/${r.series.id}`} className="btn" data-testid="cart-recovery-open">
              {say("Open the series", "Open the follow-up")}
              <ArrowRight aria-hidden="true" />
            </Link>
          </>
        ) : (
          <>
            <p>{say(`Make an email series that starts when "Someone leaves a cart". Each person who leaves one gets it, and it stops when they buy. It's optional; nothing goes out until you turn it on.`, "Make a follow-up in Email series that starts when someone leaves a cart. Each person who doesn't finish joining gets it, and it stops when they buy. It's optional; nothing goes out until you turn it on.")}</p>
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
  const say = sayOf(ctx);
  const { CART_STATUS } = salesLabels(ctx.tenant.edition);
  const filters = filtersFor(say);
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
        <Metric
          label={say("Left behind, 30 days", "Unfinished, 30 days")}
          value={left.length.toLocaleString("en-US")}
          testId="metric-carts-left"
          help={
            <p>
              {say("Carts with an email that went quiet for", "Joins with an email that went quiet for")} {settings.store.abandonedAfterHours} hours or more without being {say("bought", "paid for")}, counted by when they went quiet, over the last 30 days.{repo.sample ? " Sample data is on, so this is made up." : ""}
            </p>
          }
        />
        <Metric label={say("Left behind, value", "Unfinished, value")} value={money(left.reduce((n, c) => n + c.subtotalCents, 0))} help={<p>{say("What those left-behind carts held, at the prices the shopper saw, before codes, shipping and tax.", "What those unfinished joins held, at the prices they saw, before codes, shipping and tax.")}</p>} />
        <Metric label={say("Bought, 30 days", "Finished, 30 days")} value={bought.length.toLocaleString("en-US")} help={<p>{say("Carts with an email that turned into a paid order, by when the shopper was last in the cart, over the last 30 days. Carts without an email aren't counted anywhere on this page.", "Joins with an email that turned into a paid purchase, by when the person was last in the cart, over the last 30 days. Carts without an email aren't counted anywhere on this page.")}</p>} />
      </MetricStrip>

      <div className={`${s.stack} ${x.gapAbove}`}>
        <Segmented label="Show" items={filters.map(([k, label]) => ({ href: k === "all" ? "/sales/carts" : `/sales/carts?status=${k}`, label, current: filter === k }))} />
        <Card title={filters.find(([k]) => k === filter)?.[1] ?? say("Carts", "Unfinished joins")} flush testId="cart-list">
          {rows.length === 0 ? (
            <div className={m.empty}>
              <strong>{filter === "all" ? say("No carts with an email yet.", "No unfinished joins yet.") : "Nothing here."}</strong>
              <span>{filter === "all" ? say("Once shoppers reach checkout and give their email, their carts show up here, whether they buy or not.", "Once people reach checkout and give their email, they show up here, whether they finish or not.") : "Try another filter."}</span>
            </div>
          ) : (
            <div className={x.scrollX}>
              <table className={m.table}>
                <thead>
                  <tr>
                    <th>{say("Shopper", "Person")}</th>
                    <th className={m.hideSm}>In the cart</th>
                    <th className={s.right}>
                      <span className={x.thHelp}>
                        Value
                        <Help title="Cart value">
                          <p>{say("The cart at the prices the shopper saw, trade prices included, before codes, shipping and tax.", "The cart at the prices they saw, corporate prices included, before codes, shipping and tax.")}</p>
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
              <span className="num">{rows.length.toLocaleString("en-US")}</span> {rows.length === 1 ? say("cart", "join") : say("carts", "joins")}
            </span>
          </div>
        </Card>
        <RecoveryCard r={recovery} hours={settings.store.abandonedAfterHours} say={say} marketingName={itemOf(ctx.tenant.edition, "module:marketing").name} />
      </div>
    </>
  );
}

export default function CartsPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <>
      <SaidHeader title={["Carts", "Unfinished joins"]} note={NOTE} />
      <Suspense fallback={null}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}
