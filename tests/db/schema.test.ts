// Schema lint: fails the build if any table could skip tenant isolation.
// When you add a table, it must have tenant_id, RLS and the tenant_isolation policy,
// or be added to SYSTEM_TABLES here with a reason.
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { app, TENANT_TABLES } from "./helpers";

const SYSTEM_TABLES: Record<string, string> = {
  schema_migrations: "Migration bookkeeping. The app role has no access.",
  webhook_events: "Webhook dedupe across tenants. The app role may insert only.",
};

afterAll(async () => {
  await app().destroy();
});

describe("the app role", () => {
  it("can't bypass row-level security in any way", async () => {
    const { rows } = await sql<{ rolsuper: boolean; rolbypassrls: boolean; rolcreaterole: boolean; rolcreatedb: boolean; member_of: number; owns: number }>`
      select r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb,
        (select count(*)::int from pg_auth_members m where m.member = r.oid) as member_of,
        (select count(*)::int from pg_class c where c.relowner = r.oid) as owns
      from pg_roles r where r.rolname = current_user`.execute(app());
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, member_of: 0, owns: 0 });
  });
});

describe("every table", () => {
  it("has RLS, tenant_id and the tenant policy, unless it's a listed system table", async () => {
    const { rows } = await sql<{ table: string; rls: boolean; has_tenant_id: boolean; policies: string[] | null }>`
      select c.relname as table, c.relrowsecurity as rls,
        exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped) as has_tenant_id,
        (select array_agg(p.polname::text) from pg_policy p where p.polrelid = c.oid) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')`.execute(app());

    const problems: string[] = [];
    for (const r of rows) {
      if (r.table in SYSTEM_TABLES) continue;
      if (!r.rls) problems.push(`${r.table}: RLS is off`);
      if (!r.has_tenant_id && r.table !== "tenants") problems.push(`${r.table}: no tenant_id column`);
      if (!r.policies?.includes("tenant_isolation")) problems.push(`${r.table}: no tenant_isolation policy`);
    }
    expect(problems).toEqual([]);
  });

  it("matches the list the isolation tests walk through", async () => {
    const { rows } = await sql<{ table: string }>`
      select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition`.execute(app());
    const tables = rows.map((r) => r.table).filter((t) => !(t in SYSTEM_TABLES) && t !== "tenants");
    expect(tables.sort()).toEqual([...TENANT_TABLES].sort());
  });

  it("uses one policy shape: tenant_id or id equal to app_tenant_id(), for reads and writes", async () => {
    const { rows } = await sql<{ table: string; using: string; check: string }>`
      select c.relname as table, pg_get_expr(p.polqual, p.polrelid) as using, pg_get_expr(p.polwithcheck, p.polrelid) as check
      from pg_policy p join pg_class c on c.oid = p.polrelid where p.polname = 'tenant_isolation'`.execute(app());
    for (const r of rows) {
      const column = r.table === "tenants" ? "id" : "tenant_id";
      expect(r.using, r.table).toBe(`(${column} = app_tenant_id())`);
      expect(r.check, r.table).toBe(`(${column} = app_tenant_id())`);
    }
  });
});

describe("system functions", () => {
  it("are SECURITY DEFINER with a fixed search_path and not callable by PUBLIC", async () => {
    const { rows } = await sql<{ name: string; config: string[] | null; public_exec: boolean }>`
      select p.proname as name, p.proconfig as config, has_function_privilege('public', p.oid, 'execute') as public_exec
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef`.execute(app());
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.config?.some((c) => c.startsWith("search_path=")), r.name).toBe(true);
      expect(r.public_exec, r.name).toBe(false);
    }
  });
});
