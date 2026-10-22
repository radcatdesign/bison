// Tenant isolation, tested the way an attacker or a buggy query would hit it:
// connected as the real app role, with no help from app code.
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { createDb, resolveSiteByKey, resolveTenantByClerkOrg, resolveTenantByStripeCustomer, withTenant } from "@/lib/db";
import { A, app, B, pgCode, rawAsApp, TENANT_TABLES } from "./helpers";

afterAll(async () => {
  await app().destroy();
});

describe("reads", () => {
  it("returns nothing from any table when no tenant is set", async () => {
    for (const table of [...TENANT_TABLES, "tenants"]) {
      const rows = await rawAsApp<{ n: string }>(`select count(*) as n from ${table}`);
      expect(Number(rows[0].n), table).toBe(0);
    }
  });

  it("returns only the current tenant's rows from every table, even with no where clause", async () => {
    for (const [mine, theirs] of [
      [A, B],
      [B, A],
    ]) {
      for (const table of TENANT_TABLES) {
        const rows = await rawAsApp<{ tenant_id: string }>(`select distinct tenant_id from ${table}`, mine);
        expect(rows.map((r) => r.tenant_id).filter((t) => t !== mine), `${table} leaked ${theirs}`).toEqual([]);
      }
      const tenants = await rawAsApp<{ id: string }>("select id from tenants", mine);
      expect(tenants.map((t) => t.id)).toEqual([mine]);
    }
  });

  it("still isolates when the query asks for the other tenant by id", async () => {
    const rows = await rawAsApp(`select * from contacts where tenant_id = '${B}'`, A);
    expect(rows).toEqual([]);
    const tenant = await rawAsApp(`select * from tenants where id = '${B}'`, A);
    expect(tenant).toEqual([]);
  });

  it("returns nothing for a tenant id that doesn't exist", async () => {
    const rows = await rawAsApp<{ n: string }>("select count(*) as n from contacts", randomUUID());
    expect(Number(rows[0].n)).toBe(0);
  });

  it("does not carry the tenant over to the next transaction on the same pool", async () => {
    await withTenant({ tenantId: A }, (tx) => tx.selectFrom("contacts").select("id").execute(), app());
    for (let i = 0; i < 6; i++) {
      const rows = await rawAsApp<{ n: string }>("select count(*) as n from contacts");
      expect(Number(rows[0].n)).toBe(0);
    }
  });
});

describe("writes", () => {
  it("refuses to insert a row for another tenant", async () => {
    await expect(
      withTenant({ tenantId: A }, (tx) => tx.insertInto("contacts").values({ tenant_id: B, email: "intruder@example.com" } as never).execute(), app()),
    ).rejects.toSatisfy((err) => pgCode(err) === "42501");
  });

  it("puts new rows in the current tenant when tenant_id is left out", async () => {
    const email = `default-${Date.now()}@example.com`;
    const row = await withTenant({ tenantId: A }, (tx) => tx.insertInto("contacts").values({ email }).returning("tenant_id").executeTakeFirstOrThrow(), app());
    expect(row.tenant_id).toBe(A);
    await withTenant({ tenantId: A }, (tx) => tx.deleteFrom("contacts").where("email", "=", email).execute(), app());
  });

  it("can't update or delete another tenant's rows, even by exact id", async () => {
    const theirs = await withTenant({ tenantId: B }, (tx) => tx.selectFrom("contacts").select(["id", "name"]).executeTakeFirstOrThrow(), app());

    const updated = await withTenant({ tenantId: A }, (tx) => tx.updateTable("contacts").set({ name: "Hacked" }).where("id", "=", theirs.id).executeTakeFirst(), app());
    expect(Number(updated.numUpdatedRows)).toBe(0);
    const deleted = await withTenant({ tenantId: A }, (tx) => tx.deleteFrom("contacts").where("id", "=", theirs.id).executeTakeFirst(), app());
    expect(Number(deleted.numDeletedRows)).toBe(0);

    const after = await withTenant({ tenantId: B }, (tx) => tx.selectFrom("contacts").select(["name"]).where("id", "=", theirs.id).executeTakeFirst(), app());
    expect(after?.name).toBe(theirs.name);
  });

  it("can't move a row to another tenant", async () => {
    const mine = await withTenant({ tenantId: A }, (tx) => tx.selectFrom("contacts").select("id").executeTakeFirstOrThrow(), app());
    await expect(
      withTenant({ tenantId: A }, (tx) => tx.updateTable("contacts").set({ tenant_id: B } as never).where("id", "=", mine.id).execute(), app()),
    ).rejects.toBeTruthy();
  });

  it("can't point a row at another tenant's row", async () => {
    const theirContact = await withTenant({ tenantId: B }, (tx) => tx.selectFrom("contacts").select("id").executeTakeFirstOrThrow(), app());
    await expect(
      withTenant({ tenantId: A }, (tx) => tx.insertInto("submissions").values({ contact_id: theirContact.id, form_key: "x", fields: "{}", alert: "{}", site_id: null, spam_reason: null }).execute(), app()),
    ).rejects.toSatisfy((err) => pgCode(err) === "23503");
  });

  it("can't change another tenant's settings or plan", async () => {
    const s = await withTenant({ tenantId: A }, (tx) => tx.updateTable("settings").set({ accent: "#ff0000" }).where("tenant_id", "=", B).executeTakeFirst(), app());
    expect(Number(s.numUpdatedRows)).toBe(0);
    await expect(
      withTenant({ tenantId: A }, (tx) => tx.insertInto("entitlements").values({ tenant_id: B, item_key: "module:sales", source: "grant", ends_at: null, stripe_subscription_item_id: null, note: null } as never).execute(), app()),
    ).rejects.toSatisfy((err) => pgCode(err) === "42501");
  });

  it("leaves deleting, suspending or re-pointing a tenant to the system", async () => {
    await expect(rawAsApp(`delete from tenants where id = '${A}'`, A)).rejects.toSatisfy((err) => pgCode(err) === "42501");
    await expect(rawAsApp(`update tenants set status = 'suspended'`, A)).rejects.toSatisfy((err) => pgCode(err) === "42501");
    await expect(rawAsApp(`update tenants set clerk_org_id = 'org_other'`, A)).rejects.toSatisfy((err) => pgCode(err) === "42501");
    const renamed = await rawAsApp<{ name: string }>(`update tenants set name = name returning name`, A);
    expect(renamed).toHaveLength(1);
  });

  it("can't mark its own domain as verified", async () => {
    await expect(rawAsApp(`update sites set verified_at = now()`, A)).rejects.toSatisfy((err) => pgCode(err) === "42501");
    await expect(rawAsApp(`insert into sites (domain, verified_at) values ('sneaky.example.com', now())`, A)).rejects.toSatisfy((err) => pgCode(err) === "42501");
  });

  it("keeps the audit log append-only", async () => {
    await expect(rawAsApp("update audit_log set action = 'x'", A)).rejects.toSatisfy((err) => pgCode(err) === "42501");
    await expect(rawAsApp("delete from audit_log", A)).rejects.toSatisfy((err) => pgCode(err) === "42501");
  });
});

describe("side doors", () => {
  it("refuses to run tenant queries as a role that could skip RLS", async () => {
    const owner = createDb(process.env.DATABASE_MIGRATE_URL!, 1);
    try {
      await expect(withTenant({ tenantId: A }, (tx) => tx.selectFrom("contacts").select("id").execute(), owner)).rejects.toThrow(/must connect as bisonops_app/);
    } finally {
      await owner.destroy();
    }
  });

  it("blocks direct reads of event partitions", async () => {
    const { rows } = await sql<{ relname: string }>`select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid where i.inhparent = 'events'::regclass limit 1`.execute(app());
    await expect(rawAsApp(`select * from ${rows[0].relname}`, A)).rejects.toSatisfy((err) => pgCode(err) === "42501");
  });

  it("lets the app record webhook ids but never read them", async () => {
    await rawAsApp(`insert into webhook_events (provider, event_id) values ('test', '${randomUUID()}')`);
    await expect(rawAsApp("select * from webhook_events")).rejects.toSatisfy((err) => pgCode(err) === "42501");
  });

  it("blocks the migrations table", async () => {
    await expect(rawAsApp("select * from schema_migrations")).rejects.toSatisfy((err) => pgCode(err) === "42501");
  });

  it("system lookups return an id and nothing else", async () => {
    expect(await resolveTenantByClerkOrg("org_does_not_exist", app())).toBeNull();
    expect(await resolveTenantByStripeCustomer("cus_does_not_exist", app())).toBeNull();
    const site = await withTenant({ tenantId: B }, (tx) => tx.selectFrom("sites").select(["site_key"]).executeTakeFirstOrThrow(), app());
    expect(await resolveSiteByKey(site.site_key, app())).toEqual({ tenant_id: B, site_id: expect.any(String), domain: "ridgelineroasters.com" });
  });

  it("can't turn RLS off or change the tenant setting to dodge policies", async () => {
    await expect(rawAsApp("alter table contacts disable row level security", A)).rejects.toSatisfy((err) => pgCode(err) === "42501");
    await expect(rawAsApp("set role bisonops_owner", A)).rejects.toSatisfy((err) => pgCode(err) === "42501");
  });
});
