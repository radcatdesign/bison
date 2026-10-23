/* eslint-disable @next/next/no-img-element -- the company's logo can live on any https host. */
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { type CSSProperties, Suspense } from "react";
import { EstimateAnswer } from "@/components/sales/estimate-client";
import s from "@/components/shop/shop.module.css";
import { demoMode } from "@/lib/env";
import { clientView, resolveEstimateLink } from "@/lib/sales/estimates";
import { formatMoney } from "@/lib/sales/money";
import { addressLines } from "@/lib/sales/settings";

// A client's estimate, at a signed link that only they were sent. Public.
// Opening it marks it viewed; answering it is the form at the bottom.

export const metadata: Metadata = { title: { absolute: "Your estimate" }, robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

type Props = { params: Promise<{ token: string }> };

const HEX = /^#[0-9a-f]{6}$/i;

function Invalid() {
  return (
    <div className={s.shell}>
      <main className={s.main}>
        <h1 className={s.title} data-testid="estimate-invalid">
          This link isn&apos;t working
        </h1>
        <p className={s.lead}>It may have expired, been replaced by a newer estimate, or been copied only in part. Reply to the email it came in and ask for a fresh link.</p>
      </main>
    </div>
  );
}

async function Body({ params }: Props) {
  const { token } = await params;
  await connection();
  const link = demoMode() ? null : await resolveEstimateLink(token);
  const view = link ? await clientView(link.tenantId, link.estimateId) : null;
  if (!view) return <Invalid />;
  const { estimate: e, business: b } = view;
  const money = (n: number) => formatMoney(n, view.currency);
  const dateFmt = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const validUntil = e.validUntil ? dateFmt.format(new Date(`${e.validUntil}T12:00:00Z`)) : null;
  const open = ["sent", "viewed", "changes_requested"].includes(e.status);
  const style = { "--shop-accent": HEX.test(b.accent) ? b.accent : "#3b5bff" } as CSSProperties;
  const to = [e.client.company, e.client.name].filter(Boolean).join(", ");

  return (
    <div className={s.shell} style={style}>
      <header className={s.bar}>
        <span className={s.brand}>{b.logo ? <img src={b.logo} alt={b.name} /> : b.name}</span>
        {b.email && (
          <a className={s.ghost} href={`mailto:${b.email}`}>
            Email {b.name}
          </a>
        )}
      </header>
      <main className={s.main}>
        <p className={s.note}>Estimate #{e.number}</p>
        <h1 className={s.title}>{e.title || `Estimate from ${b.name}`}</h1>
        <p className={s.lead}>
          {to ? `For ${to}. ` : ""}
          {validUntil && open ? `Good until ${validUntil}.` : ""}
        </p>

        {e.status === "paid" && (
          <p className={`${s.message} ${s.banner}`} data-tone="ok" role="status" data-testid="estimate-state">
            Paid. Thank you.
          </p>
        )}
        {e.status === "approved" && (
          <p className={`${s.message} ${s.banner}`} data-tone="ok" role="status" data-testid="estimate-state">
            Approved by {e.approvedName}. The invoice comes next.
          </p>
        )}
        {e.status === "invoiced" && (
          <div className={`${s.message} ${s.banner}`} data-tone="ok" role="status" data-testid="estimate-state">
            Approved by {e.approvedName}. Your invoice is ready.{" "}
            {view.payable && e.invoiceUrl && (
              <a className={`${s.button} ${s.payButton}`} href={e.invoiceUrl} data-testid="estimate-pay">
                Pay {money(e.totalCents)}
              </a>
            )}
          </div>
        )}
        {e.status === "declined" && (
          <p className={`${s.message} ${s.banner}`} role="status" data-testid="estimate-state">
            You declined this estimate. If you&apos;ve changed your mind, ask {b.name} for a new one.
          </p>
        )}
        {e.status === "void" && (
          <p className={`${s.message} ${s.banner}`} role="status" data-testid="estimate-state">
            {b.name} withdrew this estimate.
          </p>
        )}
        {e.status === "changes_requested" && (
          <p className={`${s.message} ${s.banner}`} role="status" data-testid="estimate-state">
            You asked for changes. {b.name} will send an updated estimate. You can still approve this one as it is.
          </p>
        )}
        {view.expired && (
          <p className={`${s.message} ${s.banner}`} data-tone="error" role="status">
            This estimate has expired. Ask {b.name} for an updated one.
          </p>
        )}

        <div className={s.checkout}>
          <div className={s.panel}>
            <section className={s.step} aria-labelledby="est-items">
              <h2 id="est-items">What&apos;s included</h2>
              {e.items.map((l) => (
                <div key={l.id} className={s.sumLine} data-testid="estimate-item">
                  <div>
                    <span>
                      {l.qty} × {l.name}
                    </span>
                    <span>{money(Math.round(l.qty * l.unitCents))}</span>
                  </div>
                  {l.detail && <small>{l.detail}</small>}
                </div>
              ))}
              <dl className={s.sums}>
                <dt>Subtotal</dt>
                <dd>{money(e.subtotalCents)}</dd>
                {e.discountCents > 0 && (
                  <>
                    <dt>Discount</dt>
                    <dd>−{money(e.discountCents)}</dd>
                  </>
                )}
                {e.shippingCents > 0 && (
                  <>
                    <dt>Shipping or delivery</dt>
                    <dd>{money(e.shippingCents)}</dd>
                  </>
                )}
                <dt className={s.total}>Total</dt>
                <dd className={s.total} data-testid="estimate-client-total">
                  {money(e.totalCents)}
                </dd>
              </dl>
              <p className={s.note}>Sales tax, if any, is added on the invoice.</p>
            </section>
            {e.notes && (
              <section className={s.step} aria-labelledby="est-notes">
                <h2 id="est-notes">Notes</h2>
                <p className={s.preWrap}>{e.notes}</p>
              </section>
            )}
          </div>
          <aside className={s.panel}>
            {open && <EstimateAnswer token={token} seen={e.updatedAt.toISOString()} total={money(e.totalCents)} business={b.name} />}
            <section className={s.summary} aria-label="From">
              <strong>{b.name}</strong>
              {b.address && <span className={`${s.note} ${s.preWrap}`}>{b.address}</span>}
              {e.client.address && addressLines(e.client.address).length > 0 && (
                <span className={s.note}>
                  Job address:
                  <br />
                  {addressLines(e.client.address).join(", ")}
                </span>
              )}
            </section>
          </aside>
        </div>
      </main>
      <footer className={s.foot}>{b.name}</footer>
    </div>
  );
}

export default function EstimateClientPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <Body {...props} />
    </Suspense>
  );
}
