// Database versions of the repositories. Every query runs inside withTenant,
// so RLS limits it to one tenant even if a where clause is missing.
import { sql } from "kysely";
import { audit } from "@/lib/audit";
import { isUuid, type TenantScope, withTenant } from "@/lib/db";
import type { ContactStatus } from "@/lib/db/types";
import {
  type AnalyticsRepo,
  type AnalyticsSummary,
  type ContactDetail,
  type ContactListItem,
  type ContactsRepo,
  type DailyPoint,
  displayNameFor,
  type LandingPage,
  NotFoundError,
  type Totals,
} from "./types";

type ContactRow = {
  id: string;
  name: string;
  email: string;
  status: ContactStatus;
  is_new: boolean;
  last_seen_at: Date;
  form_type: string | null;
  message: string | null;
};

function toListItem(r: ContactRow): ContactListItem {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    displayName: displayNameFor(r.name, r.email),
    status: r.status,
    isNew: r.is_new,
    formType: r.form_type,
    message: r.message,
    lastSeenAt: r.last_seen_at,
  };
}

export function liveContacts(scope: TenantScope): ContactsRepo {
  return {
    async list({ limit = 100 } = {}) {
      return withTenant(scope, async (tx) => {
        const { rows } = await sql<ContactRow>`
          select c.id, c.name, c.email, c.status, c.is_new, c.last_seen_at, s.form_type, s.fields ->> 'message' as message
          from contacts c
          left join lateral (
            select form_type, fields from submissions
            where submissions.contact_id = c.id order by created_at desc limit 1
          ) s on true
          order by c.last_seen_at desc
          limit ${limit}`.execute(tx);
        return rows.map(toListItem);
      });
    },

    async get(id) {
      if (!isUuid(id)) return null;
      return withTenant(scope, async (tx) => {
        const c = await tx.selectFrom("contacts").selectAll().where("id", "=", id).executeTakeFirst();
        if (!c) return null;
        const subs = await tx
          .selectFrom("submissions")
          .select(["id", "form_type", "fields", "created_at"])
          .where("contact_id", "=", id)
          .where("status", "=", "received")
          .orderBy("created_at", "desc")
          .execute();
        const latest = subs[0];
        const detail: ContactDetail = {
          ...toListItem({ ...c, form_type: latest?.form_type ?? null, message: latest?.fields?.message ?? null }),
          phone: c.phone,
          firstSeenAt: c.first_seen_at,
          submissions: subs.map((s) => ({ id: s.id, formType: s.form_type, fields: s.fields, createdAt: s.created_at })),
        };
        return detail;
      });
    },

    async setStatus(id, status) {
      if (!isUuid(id)) throw new NotFoundError("That contact doesn't exist. It may have been deleted.");
      await withTenant(scope, async (tx) => {
        const result = await tx.updateTable("contacts").set({ status, is_new: false }).where("id", "=", id).executeTakeFirst();
        if (!result.numUpdatedRows) throw new NotFoundError("That contact doesn't exist. It may have been deleted.");
        await audit(tx, { action: "contact.status_changed", targetType: "contact", targetId: id, detail: { status } });
      });
    },
  };
}

type TotalsRow = {
  visits: string;
  pageviews: string;
  bounces: string;
  avg_active_ms: string | null;
  returning_visits: string;
  visitors: string;
};

async function totals(scope: TenantScope, from: Date, to: Date, tz: string): Promise<Totals> {
  return withTenant(scope, async (tx) => {
    const { rows } = await sql<TotalsRow>`
      with v as (
        select visit_id,
          count(*) filter (where type = 'pageview') as pv,
          count(*) filter (where type = 'action') as actions,
          -- Props come from visitors' browsers, so cast only what looks right.
          sum(case when props ->> 'active_ms' ~ '^[0-9]{1,9}$' then (props ->> 'active_ms')::int else 0 end) filter (where type = 'leave') as active_ms,
          bool_or(props ->> 'returning' = 'true') as is_returning
        from events
        where occurred_at >= ${from} and occurred_at < ${to}
        group by visit_id
      )
      select
        count(*) filter (where pv > 0) as visits,
        coalesce(sum(pv), 0) as pageviews,
        count(*) filter (where pv = 1 and actions = 0 and coalesce(active_ms, 0) < 10000) as bounces,
        avg(active_ms) filter (where pv > 0 and active_ms is not null) as avg_active_ms,
        count(*) filter (where pv > 0 and is_returning) as returning_visits,
        (select count(*) from (
          select distinct date_trunc('day', occurred_at at time zone ${tz}), visitor_hash
          from events where type = 'pageview' and occurred_at >= ${from} and occurred_at < ${to}
        ) d) as visitors
      from v`.execute(tx);
    const r = rows[0];
    const visits = Number(r.visits);
    const pageviews = Number(r.pageviews);
    return {
      visitors: Number(r.visitors),
      pageviews,
      visits,
      bounceRate: visits ? Number(r.bounces) / visits : null,
      avgActiveSeconds: r.avg_active_ms === null ? null : Math.round(Number(r.avg_active_ms) / 1000),
      pagesPerVisit: visits ? pageviews / visits : null,
      returningShare: visits ? Number(r.returning_visits) / visits : null,
    };
  });
}

type LandingRow = { path: string; title: string | null; entries: string; bounces: string; avg_active_ms: string | null; form_visits: string };

async function landingPages(scope: TenantScope, rangeDays: number): Promise<LandingPage[]> {
  const to = new Date();
  const from = new Date(to.getTime() - rangeDays * 86_400_000);
  return withTenant(scope, async (tx) => {
    const { rows } = await sql<LandingRow>`
      with first_page as (
        select distinct on (visit_id) visit_id, path, props ->> 'title' as title
        from events
        where type = 'pageview' and occurred_at >= ${from} and occurred_at < ${to}
        order by visit_id, occurred_at
      ),
      v as (
        select visit_id,
          count(*) filter (where type = 'pageview') as pv,
          count(*) filter (where type = 'action') as actions,
          count(*) filter (where type = 'action' and name = 'form-sent') as forms,
          sum(case when type = 'leave' and props ->> 'active_ms' ~ '^[0-9]{1,9}$' then (props ->> 'active_ms')::int else 0 end) as active_ms
        from events
        where occurred_at >= ${from} and occurred_at < ${to}
        group by visit_id
      )
      select f.path, max(f.title) as title, count(*) as entries,
        count(*) filter (where v.pv = 1 and v.actions = 0 and v.active_ms < 10000) as bounces,
        avg(v.active_ms) filter (where v.active_ms > 0) as avg_active_ms,
        count(*) filter (where v.forms > 0) as form_visits
      from first_page f join v using (visit_id)
      group by f.path
      order by entries desc
      limit 24`.execute(tx);
    const total = rows.reduce((sum, r) => sum + Number(r.entries), 0);
    return rows.map((r) => {
      const entries = Number(r.entries);
      return {
        path: r.path,
        title: r.title,
        entries,
        share: total ? entries / total : 0,
        bounceRate: entries ? Number(r.bounces) / entries : null,
        avgActiveSeconds: r.avg_active_ms === null ? null : Math.round(Number(r.avg_active_ms) / 1000),
        formRate: entries ? Number(r.form_visits) / entries : null,
      };
    });
  });
}

export function liveAnalytics(scope: TenantScope, timezone: string): AnalyticsRepo {
  return {
    landingPages: (rangeDays) => landingPages(scope, rangeDays),
    async summary(rangeDays): Promise<AnalyticsSummary> {
      const to = new Date();
      const from = new Date(to.getTime() - rangeDays * 86_400_000);
      const prevFrom = new Date(from.getTime() - rangeDays * 86_400_000);

      const [current, previous, daily, topPages] = await Promise.all([
        totals(scope, from, to, timezone),
        totals(scope, prevFrom, from, timezone),
        withTenant(scope, async (tx) => {
          const { rows } = await sql<{ day: string; visitors: string; pageviews: string; visits: string }>`
            select to_char(gs.day, 'YYYY-MM-DD') as day,
              count(distinct e.visitor_hash) as visitors,
              count(e.*) as pageviews,
              count(distinct e.visit_id) as visits
            from generate_series(
              date_trunc('day', ${from}::timestamptz at time zone ${timezone}),
              date_trunc('day', ${to}::timestamptz at time zone ${timezone}),
              interval '1 day') as gs(day)
            left join events e
              on e.type = 'pageview'
              and date_trunc('day', e.occurred_at at time zone ${timezone}) = gs.day
              and e.occurred_at >= ${from} and e.occurred_at < ${to}
            group by gs.day order by gs.day`.execute(tx);
          return rows.map((r): DailyPoint => ({ date: r.day, visitors: Number(r.visitors), pageviews: Number(r.pageviews), visits: Number(r.visits) }));
        }),
        withTenant(scope, async (tx) => {
          const rows = await tx
            .selectFrom("events")
            .select(["path", sql<string>`count(*)`.as("views")])
            .where("type", "=", "pageview")
            .where("occurred_at", ">=", from)
            .groupBy("path")
            .orderBy("views", "desc")
            .limit(6)
            .execute();
          return rows.map((r) => ({ path: r.path, views: Number(r.views) }));
        }),
      ]);
      return { rangeDays, current, previous, daily: daily.slice(-rangeDays), topPages };
    },
  };
}
