// Database access. App code only ever talks to Postgres as `bisonops_app`,
// and only through withTenant() or the narrow system lookups below.
import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import pg from "pg";
import type { DB } from "./types";

// Plain dates (like an estimate's "good until") read as "2026-11-30", not a Date at
// local midnight that shifts a day depending on the server's time zone.
pg.types.setTypeParser(1082, (v: string) => v);

export type Database = Kysely<DB>;
export type Tx = Transaction<DB>;

export function createDb(connectionString: string, max = Number(process.env.DATABASE_POOL_MAX ?? 5)): Database {
  const pool = new pg.Pool({ connectionString, max, idleTimeoutMillis: 10_000 });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

const globalForDb = globalThis as unknown as { __boDb?: Database };

/** The app's shared connection pool (DATABASE_URL, role bisonops_app). */
export function db(): Database {
  if (!globalForDb.__boDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
    globalForDb.__boDb = createDb(url);
  }
  return globalForDb.__boDb;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export type TenantScope = { tenantId: string; userId?: string | null };

const checkedRole = new WeakMap<Database, Promise<void>>();

/**
 * Refuses to run tenant queries as any role that could skip RLS, for example
 * Neon's default owner string pasted into DATABASE_URL by mistake. Checked once
 * per pool.
 */
export function assertSafeRole(database: Database): Promise<void> {
  let check = checkedRole.get(database);
  if (!check) {
    check = sql<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean; member_of: number }>`
      select r.rolname, r.rolsuper, r.rolbypassrls, (select count(*)::int from pg_auth_members m where m.member = r.oid) as member_of
      from pg_roles r where r.rolname = current_user`
      .execute(database)
      .then(({ rows }) => {
        const r = rows[0];
        if (!r || r.rolname !== "bisonops_app" || r.rolsuper || r.rolbypassrls || r.member_of > 0) {
          throw new Error(`DATABASE_URL connects as "${r?.rolname ?? "unknown"}". The app must connect as bisonops_app, which can't bypass row-level security. Run pnpm db:setup and use that role.`);
        }
      });
    check.catch(() => checkedRole.delete(database));
    checkedRole.set(database, check);
  }
  return check;
}

/**
 * Runs `fn` in a transaction scoped to one tenant. RLS policies read the
 * tenant from `app.tenant_id`, which is set locally to this transaction, so it
 * can't leak to the next request on a pooled connection.
 */
export async function withTenant<T>(scope: TenantScope, fn: (tx: Tx) => Promise<T>, database: Database = db()): Promise<T> {
  if (!isUuid(scope.tenantId)) throw new Error("withTenant needs a valid tenant id.");
  await assertSafeRole(database);
  return database.transaction().execute(async (tx) => {
    await sql`select set_config('app.tenant_id', ${scope.tenantId}, true), set_config('app.user_id', ${scope.userId ?? ""}, true)`.execute(tx);
    return fn(tx);
  });
}

// ── System lookups (SECURITY DEFINER functions; return an id and nothing else) ──

export async function resolveTenantByClerkOrg(orgId: string, database: Database = db()): Promise<string | null> {
  const { rows } = await sql<{ id: string | null }>`select resolve_tenant_by_clerk_org(${orgId}) as id`.execute(database);
  return rows[0]?.id ?? null;
}

export async function resolveTenantByStripeCustomer(customerId: string, database: Database = db()): Promise<string | null> {
  const { rows } = await sql<{ id: string | null }>`select resolve_tenant_by_stripe_customer(${customerId}) as id`.execute(database);
  return rows[0]?.id ?? null;
}

export async function resolveSiteByKey(siteKey: string, database: Database = db()) {
  const { rows } = await sql<{ tenant_id: string; site_id: string; domain: string }>`select * from resolve_site_by_key(${siteKey})`.execute(database);
  return rows[0] ?? null;
}
