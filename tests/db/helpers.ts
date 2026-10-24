import { sql } from "kysely";
import pg from "pg";
import { DEV_TENANTS } from "@/lib/auth/dev-people";
import { createDb, type Database } from "@/lib/db";

export const A = DEV_TENANTS.brightwater.id;
export const B = DEV_TENANTS.ridgeline.id;

/** Every table that holds tenant data. The schema test checks this list is complete. */
export const TENANT_TABLES = [
  "sites",
  "members",
  "entitlements",
  "subscriptions",
  "integrations",
  "settings",
  "audit_log",
  "contacts",
  "submissions",
  "events",
  "pages",
  "page_revisions",
  "page_agent_runs",
  "marketing_settings",
  "files",
  "subscribers",
  "lists",
  "list_items",
  "unsubscribes",
  "newsletters",
  "newsletter_templates",
  "sequences",
  "sequence_steps",
  "sequence_runs",
  "offer_codes",
  "email_sends",
  "sales_settings",
  "products",
  "product_variants",
  "trade_accounts",
  "page_tests",
  "page_test_versions",
  "page_test_visits",
  "page_test_salts",
  "discounts",
  "carts",
  "estimates",
  "estimate_events",
  "orders",
  "discount_redemptions",
  "contact_shares",
  "kiosk_settings",
  "kiosk_devices",
  "kiosk_pair_codes",
  "kiosk_check_ins",
  "kiosk_waivers",
  "campaigns",
  "campaign_graphics",
  "xp_awards",
  "achievements",
] as const;

let appDb: Database | null = null;

/** Connects as bisonops_app, exactly like the running app. */
export function app(): Database {
  appDb ??= createDb(process.env.DATABASE_URL!, 4);
  return appDb;
}

/** Schema owner connection, for setting up states the app itself can't. Bypasses RLS. */
export async function asOwner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_MIGRATE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function rawAsApp<T extends object>(query: string, tenantId?: string): Promise<T[]> {
  return app()
    .transaction()
    .execute(async (tx) => {
      if (tenantId) await sql`select set_config('app.tenant_id', ${tenantId}, true)`.execute(tx);
      const { rows } = await sql.raw<T>(query).execute(tx);
      return rows;
    });
}

export function pgCode(err: unknown): string | undefined {
  return (err as { code?: string })?.code;
}
