import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import m from "@/components/marketing/marketing.module.css";
import { salesGate } from "@/components/sales/gate";
import { ESTIMATE_STATUS, pillClass } from "@/components/sales/labels";
import s from "@/components/sales/sales.module.css";
import { SalesSetupFor } from "@/components/sales/setup";
import { Card, Help, PageHeader, SampleBanner, Segmented } from "@/components/ui";
import { may } from "@/config/roles";
import { demoMode } from "@/lib/env";
import { getPortalContext } from "@/lib/portal";
import { formatMoney } from "@/lib/sales/money";
import { salesRepo } from "@/lib/sales/repo";

export const metadata: Metadata = { title: "Estimates" };

const NOTE = "Quotes your clients open on their own page, approve by typing their name, and pay by invoice.";

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
  const canEdit = may(ctx.member.role, "sales.edit");
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: ctx.settings.timezone });
  const total = rows.reduce((n, r) => n + r.totalCents, 0);
  const currency = rows[0]?.currency ?? "usd";
  return (
    <>
      <PageHeader
        title="Estimates"
        note={NOTE}
        actions={
          canEdit && (
            <Link href="/sales/estimates/new" className="btn btn-primary" data-testid="new-estimate">
              <Plus aria-hidden="true" />
              New estimate
            </Link>
          )
        }
      />
      {repo.sample && <SampleBanner demo={demoMode()} />}
      <SalesSetupFor ctx={ctx} tool="estimates" />
      <Segmented label="Show" items={FILTERS.map(([k, label]) => ({ href: `/sales/estimates?status=${k}`, label, current: status === k }))} />
      <Card title={FILTERS.find(([k]) => k === status)?.[1] ?? ESTIMATE_STATUS[status]?.label ?? "Estimates"} flush testId="estimate-list">
        {rows.length === 0 ? (
          <div className={m.empty}>
            <strong>{status === "open" ? "No open estimates." : "Nothing here."}</strong>
            <span>{status === "open" ? "Start one, add lines from your catalog or by hand, and send it. Quote requests from the shop land here as drafts too." : "Try another filter."}</span>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className={m.table}>
              <thead>
                <tr>
                  <th>Estimate</th>
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
                          #{r.number} {r.client.company || r.client.name || r.client.email || "No client yet"}
                        </strong>
                        <span>{[r.title, r.source === "inquiry" ? "From the shop" : ""].filter(Boolean).join(" · ") || "Untitled"}</span>
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
            <span className="num">{rows.length.toLocaleString("en-US")}</span> {rows.length === 1 ? "estimate" : "estimates"}, {formatMoney(total, currency)}
            <Help title="Estimate total">
              <p>The totals of the estimates in this list added together: lines, less any discount, plus shipping. Tax is added on the invoice, so it isn&apos;t in here.</p>
            </Help>
          </span>
        </div>
      </Card>
    </>
  );
}

export default function EstimatesPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<PageHeader title="Estimates" note={NOTE} />}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}
