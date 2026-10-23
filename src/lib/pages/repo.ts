import "server-only";
// Landing pages in the database. Every read and write runs inside withTenant,
// so row-level security keeps each company's pages to itself.
//
// Pages are content a company makes, not data it measures, so sample mode
// doesn't apply: they save whether sample data is on or off.
import { sql } from "kysely";
import { audit } from "@/lib/audit";
import { type Database, db, isUuid, type TenantScope, withTenant } from "@/lib/db";
import { findPlaceholders, type PageDoc, pageDocSchema, RESERVED_PAGE_SLUGS, SLUG_PATTERN, slugifyPage } from "./schema";

export type PageStatus = "draft" | "published" | "changed";

export type PageSummary = { id: string; title: string; slug: string; status: PageStatus; updatedAt: Date; publishedAt: Date | null; sections: number; doc: PageDoc };
export type PageRecord = { id: string; title: string; slug: string; status: PageStatus; doc: PageDoc; publishedAt: Date | null; updatedAt: Date };

export class PageInputError extends Error {}

function readDoc(value: unknown): PageDoc {
  const parsed = pageDocSchema.safeParse(typeof value === "string" ? JSON.parse(value) : value);
  if (!parsed.success) throw new Error("A saved page doesn't match the page format.");
  return parsed.data;
}

function status(publishedAt: Date | null, changed: boolean): PageStatus {
  if (!publishedAt) return "draft";
  return changed ? "changed" : "published";
}

export async function listPages(scope: TenantScope, database?: Database): Promise<PageSummary[]> {
  const rows = await withTenant(
    scope,
    (tx) =>
      tx
        .selectFrom("pages")
        .select(["id", "title", "slug", "doc", "updated_at", "published_at", sql<boolean>`published_doc is distinct from doc`.as("changed")])
        .orderBy("updated_at", "desc")
        .execute(),
    database,
  );
  return rows.map((r) => {
    const doc = readDoc(r.doc);
    return { id: r.id, title: r.title, slug: r.slug, status: status(r.published_at, r.changed), updatedAt: r.updated_at, publishedAt: r.published_at, sections: doc.sections.length, doc };
  });
}

export async function getPage(scope: TenantScope, id: string, database?: Database): Promise<PageRecord | null> {
  if (!isUuid(id)) return null;
  const row = await withTenant(
    scope,
    (tx) =>
      tx
        .selectFrom("pages")
        .select(["id", "title", "slug", "doc", "updated_at", "published_at", sql<boolean>`published_doc is distinct from doc`.as("changed")])
        .where("id", "=", id)
        .executeTakeFirst(),
    database,
  );
  if (!row) return null;
  return { id: row.id, title: row.title, slug: row.slug, doc: readDoc(row.doc), status: status(row.published_at, row.changed), publishedAt: row.published_at, updatedAt: row.updated_at };
}

export async function createPage(scope: TenantScope, input: { title: string; doc: PageDoc; actor: string }, database?: Database): Promise<{ id: string; slug: string }> {
  const title = input.title.trim().slice(0, 120) || "Untitled page";
  const raw = slugifyPage(title);
  const base = RESERVED_PAGE_SLUGS.has(raw) ? `${raw}-page` : raw;
  return withTenant(
    scope,
    async (tx) => {
      const taken = new Set(
        (await tx.selectFrom("pages").select("slug").where("slug", "like", `${base}%`).execute()).map((r) => r.slug),
      );
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base.slice(0, 56)}-${n}`;
      const row = await tx
        .insertInto("pages")
        .values({ title, slug, doc: JSON.stringify(input.doc), created_by: input.actor })
        .returning(["id", "slug"])
        .executeTakeFirstOrThrow();
      await audit(tx, { action: "page.created", targetType: "page", targetId: row.id, detail: { slug } });
      return row;
    },
    database,
  );
}

export async function saveDraft(scope: TenantScope, id: string, doc: PageDoc, database?: Database): Promise<Date> {
  if (!isUuid(id)) throw new PageInputError("That page doesn't exist.");
  const row = await withTenant(
    scope,
    (tx) => tx.updateTable("pages").set({ doc: JSON.stringify(doc) }).where("id", "=", id).returning("updated_at").executeTakeFirst(),
    database,
  );
  if (!row) throw new PageInputError("That page doesn't exist. It may have been deleted.");
  return row.updated_at;
}

export async function renamePage(scope: TenantScope, id: string, input: { title: string; slug: string }, database?: Database): Promise<void> {
  const title = input.title.trim();
  const slug = input.slug.trim().toLowerCase();
  if (!title || title.length > 120) throw new PageInputError("Give the page a name of up to 120 characters.");
  if (!SLUG_PATTERN.test(slug) || slug.length > 60) throw new PageInputError("The address can use lowercase letters, numbers and dashes, like spring-sale.");
  if (RESERVED_PAGE_SLUGS.has(slug)) throw new PageInputError(`/${slug} is used by your shop. Pick a different address.`);
  try {
    const row = await withTenant(scope, (tx) => tx.updateTable("pages").set({ title, slug }).where("id", "=", id).returning("id").executeTakeFirst(), database);
    if (!row) throw new PageInputError("That page doesn't exist.");
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new PageInputError(`Another page already uses /${slug}. Pick a different address.`);
    throw err;
  }
}

/** Saves what the agent built along with what it was asked, so every change can be traced. */
export async function recordAgentRun(
  scope: TenantScope,
  id: string,
  input: { doc: PageDoc; instruction: string; reply: string; actor: string },
  database?: Database,
): Promise<void> {
  await withTenant(
    scope,
    async (tx) => {
      const row = await tx.updateTable("pages").set({ doc: JSON.stringify(input.doc) }).where("id", "=", id).returning("id").executeTakeFirst();
      if (!row) throw new PageInputError("That page doesn't exist. It may have been deleted.");
      await tx
        .insertInto("page_revisions")
        .values({ page_id: id, source: "agent", doc: JSON.stringify(input.doc), instruction: input.instruction.slice(0, 4000), reply: input.reply.slice(0, 4000), actor: input.actor })
        .execute();
    },
    database,
  );
}

/** The conversation with the agent on one page, oldest first. */
export async function agentTurns(scope: TenantScope, pageId: string, limit = 12, database?: Database): Promise<{ instruction: string; reply: string; at: Date }[]> {
  if (!isUuid(pageId)) return [];
  const rows = await withTenant(
    scope,
    (tx) =>
      tx
        .selectFrom("page_revisions")
        .select(["instruction", "reply", "created_at"])
        .where("page_id", "=", pageId)
        .where("source", "=", "agent")
        .orderBy("created_at", "desc")
        .limit(limit)
        .execute(),
    database,
  );
  return rows.reverse().map((r) => ({ instruction: r.instruction, reply: r.reply, at: r.created_at }));
}

const monthStart = sql<Date>`date_trunc('month', now() at time zone 'utc') at time zone 'utc'`;

/** Agent requests since the start of this calendar month (UTC), for the plan limit. */
export async function agentRunsThisMonth(scope: TenantScope, database?: Database): Promise<number> {
  const row = await withTenant(
    scope,
    (tx) => tx.selectFrom("page_agent_runs").select(sql<number>`count(*)`.as("n")).where("created_at", ">=", monthStart).executeTakeFirstOrThrow(),
    database,
  );
  return Number(row.n);
}

/**
 * Counts an agent request before it runs, so stopped or failed runs count too.
 * A per-tenant lock makes the check and the count one step, so requests sent at
 * the same moment can't all slip under the limit.
 */
export async function startAgentRun(scope: TenantScope, input: { pageId: string | null; actor: string; limit: number }, database?: Database): Promise<{ ok: true } | { ok: false; used: number }> {
  return withTenant(
    scope,
    async (tx) => {
      await sql`select pg_advisory_xact_lock(hashtextextended('page-agent:' || ${scope.tenantId}, 0))`.execute(tx);
      const { n } = await tx.selectFrom("page_agent_runs").select(sql<number>`count(*)`.as("n")).where("created_at", ">=", monthStart).executeTakeFirstOrThrow();
      if (Number(n) >= input.limit) return { ok: false as const, used: Number(n) };
      await tx.insertInto("page_agent_runs").values({ page_id: input.pageId, actor: input.actor }).execute();
      return { ok: true as const };
    },
    database,
  );
}

export async function publishPage(scope: TenantScope, id: string, actor: string, database?: Database): Promise<{ slug: string }> {
  return withTenant(
    scope,
    async (tx) => {
      const row = await tx.selectFrom("pages").select(["doc", "slug"]).where("id", "=", id).executeTakeFirst();
      if (!row) throw new PageInputError("That page doesn't exist.");
      const doc = readDoc(row.doc);
      if (doc.sections.length === 0) throw new PageInputError("This page is empty. Add a section before you publish.");
      const left = findPlaceholders(doc);
      if (left.length) throw new PageInputError(`Fill in ${left.length === 1 ? "the placeholder" : `all ${left.length} placeholders`} before you publish. They're marked in yellow, starting with "${left[0].text}".`);
      await tx.updateTable("pages").set({ published_doc: JSON.stringify(doc), published_at: new Date() }).where("id", "=", id).execute();
      await tx.insertInto("page_revisions").values({ page_id: id, source: "publish", doc: JSON.stringify(doc), actor }).execute();
      await audit(tx, { action: "page.published", targetType: "page", targetId: id, detail: { slug: row.slug } });
      return { slug: row.slug };
    },
    database,
  );
}

export async function unpublishPage(scope: TenantScope, id: string, database?: Database): Promise<void> {
  await withTenant(
    scope,
    async (tx) => {
      await tx.updateTable("pages").set({ published_doc: null, published_at: null }).where("id", "=", id).execute();
      await audit(tx, { action: "page.unpublished", targetType: "page", targetId: id });
    },
    database,
  );
}

export async function deletePage(scope: TenantScope, id: string, database?: Database): Promise<void> {
  if (!isUuid(id)) return;
  await withTenant(
    scope,
    async (tx) => {
      await tx.deleteFrom("pages").where("id", "=", id).execute();
      await audit(tx, { action: "page.deleted", targetType: "page", targetId: id });
    },
    database,
  );
}

// ---- Public pages -------------------------------------------------------------

export type PublishedPage = { tenantId: string; pageId: string; brand: string; slug: string; doc: PageDoc };

export async function getPublishedPage(tenantSlug: string, pageSlug: string, database: Database = db()): Promise<PublishedPage | null> {
  if (!/^[a-z0-9-]{1,63}$/.test(tenantSlug) || !SLUG_PATTERN.test(pageSlug)) return null;
  const { rows } = await sql<{ tenant_id: string; page_id: string }>`select * from resolve_published_page(${tenantSlug}, ${pageSlug})`.execute(database);
  const hit = rows[0];
  if (!hit) return null;
  return withTenant(
    { tenantId: hit.tenant_id },
    async (tx) => {
      const page = await tx.selectFrom("pages").select(["published_doc", "slug"]).where("id", "=", hit.page_id).executeTakeFirst();
      const tenant = await tx.selectFrom("tenants").select("name").executeTakeFirst();
      if (!page?.published_doc || !tenant) return null;
      return { tenantId: hit.tenant_id, pageId: hit.page_id, brand: tenant.name, slug: page.slug, doc: readDoc(page.published_doc) };
    },
    database,
  );
}
