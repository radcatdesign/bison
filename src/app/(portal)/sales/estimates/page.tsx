import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import m from "@/components/marketing/marketing.module.css";
import { salesGate } from "@/components/sales/gate";
import { ESTIMATE_STATUS, pillClass } from "@/components/sales/labels";
import { SaidHeader } from "@/components/sales/said";
import s from "@/components/sales/sales.module.css";
import { SalesSetupFor } from "@/components/sales/setup";
import { Card, Help, PageHeader, SampleBanner, Segmented } from "@/components/ui";
import { may } from "@/config/roles";
import { sayOf } from "@/lib/edition";
import { demoMode } from "@/lib/env";
import { getPortalContext } from "@/lib/portal";
import { formatMoney } from "@/lib/sales/money";
import { salesRepo } from "@/lib/sales/repo";

export async function generateMetadata(): Promise<Metadata> {
  return { title: sayOf(await getPortalContext())("Estimates", "Quotes") };
}

const NOTE: [string, string] = ["Quotes your clients open on their own page, approve by typing their name, and pay by invoice.", "Corporate memberships, PT bundles and team events. People open their quote on its own page, approve it by typing their name, and pay by invoice."];

const FILTERS = [
  ["open", "Open"],
  ["draft", "Drafts"],
  ["changes_requested", "Changes requested"],
  ["approved", "Approved"],
  ["invoiced", "Invoiced"],
  ["paid", "Paid"],
  ["all", "All"],
] as const;

type Search = { status?: string };

async function Body({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await getPortalContext();
  const blocked = salesGate(ctx, "sales.estimates");
  if (blocked) return blocked;
  const sp = await searchParams;
  const status = FILTERS.some(([k]) => k === sp.status) || ["sent", "viewed", "declined", "void"].includes(sp.status ?? "") ? sp.status! : "open";
  const repo = salesRepo(ctx);
  const rows = await repo.estimates(status);
  const say = sayOf(ctx);
  const canEdit = may(ctx.member.role, "sales.edit");
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: ctx.settings.timezone });
  const total = rows.reduce((n, r) => n + r.totalCents, 0);
  const currency = rows[0]?.currency ?? "usd";
  return (
    <>
      <PageHeader
        title={say("Estimates", "Quotes")}
        note={say(...NOTE)}
        actions={
          canEdit && (
            <Link href="/sales/estimates/new" className="btn btn-primary" data-testid="new-estimate">
              <Plus aria-hidden="true" />
              {say("New estimate", "New quote")}
            </Link>
          )
        }
      />
      {repo.sample && <SampleBanner demo={demoMode()} />}
      <SalesSetupFor ctx={ctx} tool="estimates" />
      <div className={s.stack}>
        <Segmented label="Show" items={FILTERS.map(([k, label]) => ({ href: `/sales/estimates?status=${k}`, label, current: status === k }))} />
        <Card title={FILTERS.find(([k]) => k === status)?.[1] ?? ESTIMATE_STATUS[status]?.label ?? say("Estimates", "Quotes")} flush testId="estimate-list">
          {rows.length === 0 ? (
            <div className={m.empty}>
              <strong>{status === "open" ? say("No open estimates.", "No open quotes.") : "Nothing here."}</strong>
              <span>{status === "open" ? say("Start one, add lines from your catalog or by hand, and send it. Quote requests from the shop land here as drafts too.", "Start one for a local employer, a PT bundle or a team event. Add memberships and packs from your list or type your own lines, then send it. Quote requests from your online store land here as drafts too.") : "Try another filter."}</span>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className={m.table}>
                <thead>
                  <tr>
                    <th>{say("Estimate", "Quote")}</th>
                    <th>Status</th>
                    <th className={m.hideSm}>Sent</th>
                    <th className={s.right}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} data-testid="estimate-row">
                      <td>
                        <Link href={`/sales/estimates/${r.id}`} className={m.cellMain} style={{ color: "inherit", textDecoration: "none" }}>
                          <strong>
                            #{r.number} {r.client.company || r.client.name || r.client.email || say("No client yet", "No one yet")}
                          </strong>
                          <span>{[r.title, r.source === "inquiry" ? say("From the shop", "From your online store") : ""].filter(Boolean).join(" · ") || "Untitled"}</span>
                        </Link>
                      </td>
                      <td>
                        <span className={pillClass(ESTIMATE_STATUS[r.status].tone)}>{ESTIMATE_STATUS[r.status].label}</span>
                      </td>
                      <td className={`${m.hideSm} muted`}>{r.sentAt ? fmt.format(r.sentAt) : "Not sent"}</td>
                      <td className={`${s.money} ${s.right}`}>{formatMoney(r.totalCents, r.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className={m.pager}>
            <span>
              <span className="num">{rows.length.toLocaleString("en-US")}</span> {rows.length === 1 ? say("estimate", "quote") : say("estimates", "quotes")}, {formatMoney(total, currency)}
              <Help title={say("Estimate total", "Quote total")}>
                <p>{say("The totals of the estimates in this list added together: lines, less any discount, plus shipping. Tax is added on the invoice, so it isn't in here.", "The totals of the quotes in this list added together: lines, less any discount, plus shipping. Tax is added on the invoice, so it isn't in here.")}</p>
              </Help>
            </span>
          </div>
        </Card>
      </div>
    </>
  );
}

export default function EstimatesPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<SaidHeader title={["Estimates", "Quotes"]} note={NOTE} />}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}
