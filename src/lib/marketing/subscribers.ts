import "server-only";
// What the Subscribers screens read. A database version and a sample version
// with the same shape; screens never know which one they have.
import { sql } from "kysely";
import { isUuid, type TenantScope, withTenant } from "@/lib/db";
import type { SubscriberSource, SubscriberStatus, UnsubscribeReason } from "@/lib/db/types";
import { sampleLists, type SampleTenant, sampleSubscribers } from "@/lib/sample/marketing";

export const PAGE_SIZE = 50;

export type SubscriberRow = { id: string; email: string; name: string; kind: string; status: SubscriberStatus; source: SubscriberSource; subscribedAt: Date; lists: string[] };
export type SubscriberDetail = SubscriberRow & {
  sourceDetail: string;
  unsubscribedAt: Date | null;
  unsubscribeReason: UnsubscribeReason | null;
  listIds: string[];
  runs: { sequence: string; status: string; startedAt: Date }[];
  sends: { subject: string; kind: string; status: string; at: Date }[];
  offer: { code: string; redeemedAt: Date | null } | null;
};
export type ListRow = { id: string; name: string; count: number };
export type SubscriberQuery = { status?: "subscribed" | "unsubscribed" | "all"; listId?: string; kind?: string; q?: string; page?: number };
export type SubscriberPage = { rows: SubscriberRow[]; total: number; page: number; pages: number };
export type SubscriberStats = { subscribed: number; new30: number; unsubscribed30: number };

export interface SubscribersRepo {
  mode: "sample" | "live";
  stats(): Promise<SubscriberStats>;
  list(q: SubscriberQuery): Promise<SubscriberPage>;
  get(id: string): Promise<SubscriberDetail | null>;
  lists(): Promise<ListRow[]>;
}

const DAY = 86_400_000;

function paged<T>(all: T[], page: number): { rows: T[]; total: number; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  return { rows: all.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE), total: all.length, page: p, pages };
}

// ---- Sample ------------------------------------------------------------------------

export function sampleSubscribersRepo(tenant: SampleTenant, now = new Date()): SubscribersRepo {
  const all = sampleSubscribers(tenant, now).sort((a, b) => b.subscribedAt.getTime() - a.subscribedAt.getTime());
  const lists = sampleLists(tenant);
  const names = new Map(lists.map((l) => [l.id, l.name]));
  const toRow = (s: (typeof all)[number]): SubscriberRow => ({ id: s.id, email: s.email, name: s.name, kind: s.kind, status: s.status, source: s.source, subscribedAt: s.subscribedAt, lists: s.listIds.map((id) => names.get(id) ?? "") });
  return {
    mode: "sample",
    async stats() {
      const since = now.getTime() - 30 * DAY;
      return {
        subscribed: all.filter((s) => s.status === "subscribed").length,
        new30: all.filter((s) => s.subscribedAt.getTime() >= since).length,
        unsubscribed30: all.filter((s) => s.unsubscribedAt && s.unsubscribedAt.getTime() >= since).length,
      };
    },
    async list(q) {
      const needle = q.q?.trim().toLowerCase();
      const filtered = all.filter(
        (s) =>
          (q.status === "all" || (q.status === "unsubscribed" ? s.status !== "subscribed" : s.status === "subscribed")) &&
          (!q.listId || s.listIds.includes(q.listId)) &&
          (!q.kind || s.kind === q.kind) &&
          (!needle || s.email.includes(needle) || s.name.toLowerCase().includes(needle)),
      );
      const page = paged(filtered, q.page ?? 1);
      return { ...page, rows: page.rows.map(toRow) };
    },
    async get(id) {
      const s = all.find((x) => x.id === id);
      if (!s) return null;
      return {
        ...toRow(s),
        sourceDetail: s.sourceDetail,
        unsubscribedAt: s.unsubscribedAt,
        unsubscribeReason: s.status === "bounced" ? "bounce" : s.status === "unsubscribed" ? "link" : null,
        listIds: s.listIds,
        runs: [{ sequence: "Welcome series", status: s.subscribedAt.getTime() > now.getTime() - 8 * DAY ? "active" : "done", startedAt: s.subscribedAt }],
        sends: [{ subject: "Welcome! Here's what to expect", kind: "series", status: "delivered", at: s.subscribedAt }],
        offer: null,
      };
    },
    async lists() {
      return lists.map((l) => ({ ...l, count: all.filter((s) => s.status === "subscribed" && s.listIds.includes(l.id)).length }));
    },
  };
}

// ---- Database ----------------------------------------------------------------------

export function liveSubscribersRepo(scope: TenantScope): SubscribersRepo {
  return {
    mode: "live",
    async stats() {
      return withTenant(scope, async (tx) => {
        const { rows } = await sql<{ subscribed: number; new30: number; unsub30: number }>`
          select
            (select count(*)::int from subscribers where status = 'subscribed') as subscribed,
            (select count(*)::int from subscribers where subscribed_at >= now() - interval '30 days' and status = 'subscribed') as new30,
            (select count(*)::int from unsubscribes where created_at >= now() - interval '30 days') as unsub30`.execute(tx);
        return { subscribed: rows[0].subscribed, new30: rows[0].new30, unsubscribed30: rows[0].unsub30 };
      });
    },

    async list(q) {
      return withTenant(scope, async (tx) => {
        let base = tx.selectFrom("subscribers as s");
        if (q.status !== "all") base = q.status === "unsubscribed" ? base.where("s.status", "!=", "subscribed") : base.where("s.status", "=", "subscribed");
        if (q.listId && isUuid(q.listId)) {
          const listId = q.listId;
          base = base.where((eb) => eb.exists(eb.selectFrom("list_items as li").select("li.subscriber_id").whereRef("li.subscriber_id", "=", "s.id").where("li.list_id", "=", listId)));
        }
        if (q.kind) base = base.where("s.kind", "=", q.kind);
        const needle = q.q?.trim().toLowerCase().slice(0, 100);
        if (needle) {
          const like = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
          base = base.where((eb) => eb.or([eb("s.email", "like", like), eb(sql`lower(s.name)`, "like", like)]));
        }
        const { n } = await base.select(sql<number>`count(*)::int`.as("n")).executeTakeFirstOrThrow();
        const pages = Math.max(1, Math.ceil(n / PAGE_SIZE));
        const page = Math.min(Math.max(1, q.page ?? 1), pages);
        const rows = await base
          .select(["s.id", "s.email", "s.name", "s.kind", "s.status", "s.source", "s.subscribed_at"])
          .select(sql<string[]>`coalesce((select array_agg(l.name order by l.name) from list_items li join lists l on l.tenant_id = li.tenant_id and l.id = li.list_id where li.subscriber_id = s.id), '{}')`.as("lists"))
          .orderBy("s.subscribed_at", "desc")
          .orderBy("s.id")
          .limit(PAGE_SIZE)
          .offset((page - 1) * PAGE_SIZE)
          .execute();
        return {
          rows: rows.map((r) => ({ id: r.id, email: r.email, name: r.name, kind: r.kind, status: r.status, source: r.source, subscribedAt: r.subscribed_at, lists: r.lists })),
          total: n,
          page,
          pages,
        };
      });
    },

    async get(id) {
      if (!isUuid(id)) return null;
      return withTenant(scope, async (tx) => {
        const s = await tx.selectFrom("subscribers").selectAll().where("id", "=", id).executeTakeFirst();
        if (!s) return null;
        const lists = await tx.selectFrom("list_items as li").innerJoin("lists as l", (j) => j.onRef("l.id", "=", "li.list_id").onRef("l.tenant_id", "=", "li.tenant_id")).select(["l.id", "l.name"]).where("li.subscriber_id", "=", id).orderBy("l.name").execute();
        const unsub = await tx.selectFrom("unsubscribes").select("reason").where("email", "=", s.email).executeTakeFirst();
        const runs = await tx.selectFrom("sequence_runs as r").innerJoin("sequences as q", (j) => j.onRef("q.id", "=", "r.sequence_id").onRef("q.tenant_id", "=", "r.tenant_id")).select(["q.name", "r.status", "r.started_at"]).where("r.email", "=", s.email).orderBy("r.started_at", "desc").limit(10).execute();
        const sends = await tx.selectFrom("email_sends").select(["subject", "kind", "status", "created_at"]).where("email", "=", s.email).orderBy("created_at", "desc").limit(10).execute();
        const offer = await tx.selectFrom("offer_codes").select(["code", "redeemed_at"]).where("email", "=", s.email).executeTakeFirst();
        return {
          id: s.id,
          email: s.email,
          name: s.name,
          kind: s.kind,
          status: s.status,
          source: s.source,
          subscribedAt: s.subscribed_at,
          lists: lists.map((l) => l.name),
          listIds: lists.map((l) => l.id),
          sourceDetail: s.source_detail,
          unsubscribedAt: s.unsubscribed_at,
          unsubscribeReason: unsub?.reason ?? null,
          runs: runs.map((r) => ({ sequence: r.name, status: r.status, startedAt: r.started_at })),
          sends: sends.map((x) => ({ subject: x.subject, kind: x.kind, status: x.status, at: x.created_at })),
          offer: offer ? { code: offer.code, redeemedAt: offer.redeemed_at } : null,
        };
      });
    },

    async lists() {
      return withTenant(scope, async (tx) => {
        const rows = await tx
          .selectFrom("lists as l")
          .select(["l.id", "l.name"])
          .select(sql<number>`(select count(*)::int from list_items li join subscribers s on s.tenant_id = li.tenant_id and s.id = li.subscriber_id where li.list_id = l.id and s.status = 'subscribed')`.as("count"))
          .orderBy("l.name")
          .execute();
        return rows.map((r) => ({ id: r.id, name: r.name, count: r.count }));
      });
    },
  };
}

export function subscribersRepo(ctx: { scope: TenantScope; tenant: SampleTenant; sampleData: boolean }): SubscribersRepo {
  return ctx.sampleData ? sampleSubscribersRepo(ctx.tenant) : liveSubscribersRepo(ctx.scope);
}
