// The Sales part of a contact's panel: their orders, estimates and carts,
// and links to share their page.
import Link from "next/link";
import { may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { type PortalContext, scopeOf } from "@/lib/portal";
import { salesForContact } from "@/lib/sales/contact-share";
import { formatMoney } from "@/lib/sales/money";
import { ShareContact } from "./contact-share";
import { CART_STATUS, ESTIMATE_STATUS, ORDER_STATUS, pillClass } from "./labels";
import s from "./sales.module.css";

export async function ContactSales({ ctx, contactId, titleClass }: { ctx: PortalContext; contactId: string; titleClass: string }) {
  const sales = can(ctx.tenant, "sales.orders");
  const share = can(ctx.tenant, "contacts.share");
  if (!sales && !share) return null;
  if (demoMode() || ctx.settings.sampleData) {
    return (
      <div data-testid="contact-sales">
        <h3 className={titleClass}>{sales ? "Sales" : "Share this person"}</h3>
        <p className="muted">{sales ? "Orders, estimates and carts for this person, and links to share their page, show here once sample data is off." : "Links to share this person's page show here once sample data is off."}</p>
      </div>
    );
  }
  const data = await withTenant(scopeOf(ctx), (tx) => salesForContact(tx, contactId));
  if (!data) return null;
  const d = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: ctx.settings.timezone,
  });
  return (
    <div className={s.stack} style={{ gap: 16 }} data-testid="contact-sales">
      {sales && (
        <>
          <div>
            <h3 className={titleClass}>Orders</h3>
            {data.orders.length ? (
              <ul className={s.lines}>
                {data.orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/sales/orders?id=${o.id}`}>
                      #{o.number}, {d.format(o.paidAt)} <span className={pillClass(ORDER_STATUS[o.status].tone)}>{ORDER_STATUS[o.status].label}</span>
                    </Link>
                    <strong className={s.money}>{formatMoney(o.totalCents, o.currency)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No orders yet.</p>
            )}
          </div>
          <div>
            <h3 className={titleClass}>Estimates</h3>
            {data.estimates.length ? (
              <ul className={s.lines}>
                {data.estimates.map((e) => (
                  <li key={e.id}>
                    <Link href={`/sales/estimates/${e.id}`}>
                      #{e.number} {e.title} <span className={pillClass(ESTIMATE_STATUS[e.status].tone)}>{ESTIMATE_STATUS[e.status].label}</span>
                    </Link>
                    <strong className={s.money}>{formatMoney(e.totalCents, e.currency)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                No estimates. <Link href="/sales/estimates/new">Start one</Link>
              </p>
            )}
          </div>
          {data.carts.length > 0 && (
            <div>
              <h3 className={titleClass}>Carts</h3>
              <ul className={s.lines}>
                {data.carts.map((c, i) => (
                  <li key={i}>
                    <div>
                      <span className={pillClass(CART_STATUS[c.status]?.tone ?? "neutral")}>{CART_STATUS[c.status]?.label ?? c.status}</span> {d.format(c.lastActiveAt)}
                      <br />
                      <span>{c.items.map((x) => `${x.qty} × ${x.name}`).join(", ")}</span>
                    </div>
                    <strong className={s.money}>{formatMoney(c.subtotalCents, c.currency)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {share && (
        <div>
          <h3 className={titleClass}>Share this person</h3>
          <ShareContact
            contactId={contactId}
            shares={data.shares.map((x) => ({
              id: x.id,
              url: x.url,
              expiresAt: x.expiresAt.toISOString(),
            }))}
            canShare={may(ctx.member.role, "contacts.edit")}
          />
        </div>
      )}
    </div>
  );
}
