import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { salesLabels } from "@/components/sales/labels";
import s from "@/components/shop/shop.module.css";
import { sayFor } from "@/config/editions";
import { demoMode } from "@/lib/env";
import { openShare } from "@/lib/sales/contact-share";
import { formatMoney } from "@/lib/sales/money";

// One contact's page, shared by the team at a signed link that expires.
// Public. Read only, and never shows team notes. A club's page reads in club
// words; the edition comes with the shared page.

type Props = { params: Promise<{ token: string }> };

/** The shared page, read once per request so the title and the page share it. */
const shareFor = cache(async (token: string) => (demoMode() ? null : openShare(token)));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  await connection();
  const view = await shareFor(token);
  return { title: { absolute: sayFor(view?.edition ?? "bison")("Shared contact", "Shared lead") }, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const LABELS: Record<string, string> = { name: "Name", email: "Email", phone: "Phone", message: "Message", company: "Company", cart: "Cart" };

async function Body({ params }: Props) {
  const { token } = await params;
  await connection();
  const view = await shareFor(token);
  if (!view) {
    return (
      <div className={s.shell}>
        <main className={s.main}>
          <h1 className={s.title} data-testid="share-invalid">
            This link isn&apos;t working
          </h1>
          <p className={s.lead}>It may have expired or been turned off. Ask whoever sent it for a new one.</p>
        </main>
      </div>
    );
  }
  const d = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  const c = view.contact;
  const say = sayFor(view.edition);
  const { CART_STATUS, ESTIMATE_STATUS, ORDER_STATUS } = salesLabels(view.edition);
  return (
    <div className={s.shell}>
      <header className={s.bar}>
        <span className={s.brand}>{view.business}</span>
        <span className={s.note}>Shared until {d.format(view.expiresAt)}</span>
      </header>
      <main className={s.main}>
        <h1 className={s.title} data-testid="share-name">
          {c.name || c.email}
        </h1>
        <p className={s.lead}>
          <a href={`mailto:${c.email}`}>{c.email}</a>
          {c.phone ? (
            <>
              {" · "}
              <a href={`tel:${c.phone}`}>{c.phone}</a>
            </>
          ) : null}
          {` · First seen ${d.format(c.firstSeenAt)}`}
        </p>
        <div className={s.checkout}>
          <div className={s.panel}>
            <section className={s.step} aria-labelledby="sh-orders">
              <h2 id="sh-orders">{say("Orders", "Purchases")}</h2>
              {view.orders.length ? (
                view.orders.map((o) => (
                  <div key={o.id} className={s.sumLine} data-testid="share-order">
                    <div>
                      <span>
                        #{o.number}, {d.format(o.paidAt)}
                      </span>
                      <span>{formatMoney(o.totalCents, o.currency)}</span>
                    </div>
                    <small>
                      {o.itemCount} {o.itemCount === 1 ? "item" : "items"} · {ORDER_STATUS[o.status].label}
                    </small>
                  </div>
                ))
              ) : (
                <p className={s.note}>{say("No orders yet.", "No purchases yet.")}</p>
              )}
            </section>
            <section className={s.step} aria-labelledby="sh-est">
              <h2 id="sh-est">{say("Estimates", "Quotes")}</h2>
              {view.estimates.length ? (
                view.estimates.map((e) => (
                  <div key={e.id} className={s.sumLine}>
                    <div>
                      <span>
                        #{e.number} {e.title}
                      </span>
                      <span>{formatMoney(e.totalCents, e.currency)}</span>
                    </div>
                    <small>{ESTIMATE_STATUS[e.status].label}</small>
                  </div>
                ))
              ) : (
                <p className={s.note}>{say("No estimates sent.", "No quotes sent.")}</p>
              )}
            </section>
            {view.carts.length > 0 && (
              <section className={s.step} aria-labelledby="sh-carts">
                <h2 id="sh-carts">Carts</h2>
                {view.carts.map((cart, i) => (
                  <div key={i} className={s.sumLine}>
                    <div>
                      <span>{CART_STATUS[cart.status]?.label ?? cart.status}</span>
                      <span>{formatMoney(cart.subtotalCents, cart.currency)}</span>
                    </div>
                    <small>{cart.items.map((x) => `${x.qty} × ${x.name}${x.variant ? ` (${x.variant})` : ""}`).join(", ")}</small>
                  </div>
                ))}
              </section>
            )}
          </div>
          <aside className={s.panel}>
            <section className={s.step} aria-labelledby="sh-sent">
              <h2 id="sh-sent">What they sent</h2>
              {view.sent.length ? (
                view.sent.map((x, i) => (
                  <div key={i} className={s.sumLine}>
                    <div>
                      <span>{x.formType}</span>
                      <span>{d.format(x.at)}</span>
                    </div>
                    {Object.entries(x.fields)
                      .filter(([k]) => !["email", "name"].includes(k))
                      .map(([k, v]) => (
                        <small key={k}>
                          {LABELS[k] ?? k}: {v}
                        </small>
                      ))}
                  </div>
                ))
              ) : (
                <p className={s.note}>No forms yet.</p>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default function SharedContactPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <Body {...props} />
    </Suspense>
  );
}
