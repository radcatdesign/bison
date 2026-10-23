import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { marketingGate } from "@/components/marketing/gate";
import s from "@/components/marketing/marketing.module.css";
import { SetupFor } from "@/components/marketing/setup-for";
import { AddButtons, ListsEditor, SignupEditor, SubscriberPanel } from "@/components/marketing/subscribers";
import { Card, Metric, MetricStrip, PageHeader } from "@/components/ui";
import { CATALOG } from "@/config/catalog";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { defaultMarketingSettings } from "@/lib/marketing/settings";
import { getMarketingSettings, settingsTenantOf } from "@/lib/marketing/store";
import { subscribersRepo, type SubscriberQuery } from "@/lib/marketing/subscribers";
import { getPortalContext, scopeOf } from "@/lib/portal";

export const metadata: Metadata = { title: "Subscribers" };

const NOTE = "Everyone who agreed to get your email. Every email has a one-click unsubscribe, and unsubscribing stops everything for that person.";

type Search = { q?: string; status?: string; list?: string; kind?: string; page?: string; id?: string };

const SOURCE: Record<string, string> = { manual: "Added by hand", import: "Imported", page: "Landing page", form: "Site form" };

function hrefWith(base: Search, change: Partial<Search>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...change })) if (v) p.set(k, v);
  const q = p.toString();
  return `/marketing/subscribers${q ? `?${q}` : ""}`;
}

async function Body({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.subscribers");
  if (blocked) return blocked;
  const sp = await searchParams;
  const demo = demoMode();
  const sample = demo || ctx.settings.sampleData;
  const repo = subscribersRepo({ scope: scopeOf(ctx), tenant: ctx.tenant, sampleData: sample });
  const settings = demo ? defaultMarketingSettings(settingsTenantOf(ctx)) : await withTenant(scopeOf(ctx), (tx) => getMarketingSettings(tx, settingsTenantOf(ctx)));
  const query: SubscriberQuery = {
    status: sp.status === "unsubscribed" || sp.status === "all" ? sp.status : "subscribed",
    listId: sp.list,
    kind: sp.kind,
    q: sp.q?.slice(0, 100),
    page: Number(sp.page) || 1,
  };
  const [stats, page, lists, person] = await Promise.all([repo.stats(), repo.list(query), repo.lists(), sp.id ? repo.get(sp.id) : Promise.resolve(null)]);
  const canEdit = may(ctx.member.role, "marketing.edit") && !demo;
  const types = settings.signup.types;
  const typeLabel = new Map(types.map((t) => [t.value, t.label]));
  const limit = CATALOG["module:marketing"].limits.subscribers ?? 0;
  const base: Search = { q: sp.q, status: sp.status, list: sp.list, kind: sp.kind };
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: ctx.settings.timezone });

  return (
    <>
      <PageHeader
        title="Subscribers"
        note={NOTE}
        actions={
          <>
            {may(ctx.member.role, "data.export") && (
              <a href="/api/marketing/subscribers/export" className="btn" download>
                <Download aria-hidden="true" />
                Export
              </a>
            )}
            <AddButtons lists={lists} types={types} canEdit={canEdit && !sample} />
          </>
        }
      />
      <SetupFor ctx={ctx} tool="subscribers" />
      {sample && !demo && <p className="notice" style={{ marginBottom: 18 }}>Sample data is on, so this list is made up and adding or importing is paused. Turn it off in Settings to work with your real list.</p>}

      <MetricStrip>
        <Metric label="Subscribed" value={stats.subscribed.toLocaleString("en-US")} testId="metric-subscribed" help={<p>People on your list right now who can get email. Not counted: anyone who unsubscribed, bounced or marked an email as spam. Your plan includes {limit.toLocaleString("en-US")}.</p>} />
        <Metric label="New in 30 days" value={stats.new30.toLocaleString("en-US")} help={<p>People who joined in the last 30 days and are still subscribed, from forms, imports or added by hand.</p>} />
        <Metric label="Unsubscribed in 30 days" value={stats.unsubscribed30.toLocaleString("en-US")} help={<p>Addresses added to your do-not-email list in the last 30 days: unsubscribes, spam complaints and hard bounces.</p>} />
      </MetricStrip>

      <div style={{ height: 24 }} />

      <Card title="People" id="add" flush testId="subscriber-list">
        <form className={s.toolbar} action="/marketing/subscribers" style={{ padding: "14px 14px 0" }}>
          <input name="q" className="input" defaultValue={sp.q} placeholder="Search by email or name" aria-label="Search subscribers" />
          <select name="status" className="select" defaultValue={query.status} aria-label="Status">
            <option value="subscribed">Subscribed</option>
            <option value="unsubscribed">Not subscribed</option>
            <option value="all">Everyone</option>
          </select>
          {lists.length > 0 && (
            <select name="list" className="select" defaultValue={sp.list ?? ""} aria-label="List">
              <option value="">All lists</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          {types.length > 0 && (
            <select name="kind" className="select" defaultValue={sp.kind ?? ""} aria-label="Type">
              <option value="">All types</option>
              {types.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
          <button type="submit" className="btn">
            Show
          </button>
        </form>

        {page.rows.length === 0 ? (
          <div className={s.empty}>
            <strong>{sp.q || sp.list || sp.kind ? "Nobody matches that." : "No subscribers yet."}</strong>
            <span>{sp.q || sp.list || sp.kind ? "Try a different search or filter." : "Import a CSV from your old email tool, add people by hand, or put a signup form on a landing page."}</span>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Person</th>
                  <th className={s.hideSm}>Type</th>
                  <th className={s.hideSm}>Lists</th>
                  <th className={s.hideSm}>From</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((r) => (
                  <tr key={r.id} data-testid="subscriber-row">
                    <td>
                      <Link href={hrefWith(base, { id: r.id, page: sp.page })} scroll={false} className={s.cellMain} style={{ color: "inherit", textDecoration: "none" }}>
                        <strong>{r.name || r.email}</strong>
                        <span>
                          {r.name ? r.email : ""}
                          {r.status !== "subscribed" ? `${r.name ? " · " : ""}${r.status === "bounced" ? "Bounced" : r.status === "complained" ? "Marked as spam" : "Unsubscribed"}` : ""}
                        </span>
                      </Link>
                    </td>
                    <td className={s.hideSm}>{r.kind ? (typeLabel.get(r.kind) ?? r.kind) : <span className="muted">Not set</span>}</td>
                    <td className={s.hideSm}>
                      <span className={s.tags}>
                        {r.lists.map((l) => (
                          <span key={l} className="pill">
                            {l}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className={`${s.hideSm} muted`}>{SOURCE[r.source]}</td>
                    <td className="muted">{fmt.format(r.subscribedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={s.pager}>
          <span>
            <span className="num">{page.total.toLocaleString("en-US")}</span> {page.total === 1 ? "person" : "people"}
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            {page.page > 1 && (
              <Link href={hrefWith(base, { page: String(page.page - 1) })} className="btn">
                Previous
              </Link>
            )}
            {page.page < page.pages && (
              <Link href={hrefWith(base, { page: String(page.page + 1) })} className="btn">
                Next
              </Link>
            )}
          </span>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginTop: 24 }}>
        <Card title="Lists" note="Groups you can send to on their own." id="lists">
          <ListsEditor lists={lists} canEdit={canEdit} sample={sample} />
        </Card>
        <Card title="Signup forms" note='The "I am a..." question on signup forms, and its choices.' id="signup">
          <SignupEditor initial={settings.signup} canEdit={may(ctx.member.role, "marketing.edit")} storage={demo ? "browser" : "server"} tenantId={ctx.tenant.id} />
          <p className={s.hint} style={{ marginTop: 14 }}>
            To collect signups, open a landing page in{" "}
            <Link href="/marketing/pages" className="link">
              Pages
            </Link>
            , edit its form and turn on &quot;Add to email list&quot;.
          </p>
        </Card>
      </div>

      {person && <SubscriberPanel person={person} lists={lists} types={types} canEdit={canEdit && !sample} canDelete={may(ctx.member.role, "data.delete") && !sample && !demo} closeHref={hrefWith(base, { page: sp.page })} />}
    </>
  );
}

export default function SubscribersPage({ searchParams }: PageProps<"/marketing/subscribers">) {
  return (
    <Suspense fallback={<PageHeader title="Subscribers" note={NOTE} />}>
      <Body searchParams={searchParams as Promise<Search>} />
    </Suspense>
  );
}
