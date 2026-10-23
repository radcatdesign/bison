import "server-only";
// The sales job, run with the email job (every few minutes where the plan
// allows, and daily as a backstop): marks quiet carts as left behind (which
// can start Marketing's "left a cart" series), lets go of code holds from
// checkouts that ended, and retries orders that didn't reach ShipStation.
import { sql } from "kysely";
import { type Database, db, withTenant } from "@/lib/db";
import { markAbandoned } from "./checkout";
import { releaseStaleHolds } from "./discount-codes";
import { MAX_FULFILLMENT_ATTEMPTS, sendToFulfillment } from "./orders";

export type SalesWork = { tenants: number; abandoned: number; released: number; retried: number };

export async function runSalesWork(opts: { tenantId?: string; database?: Database; now?: Date; budgetMs?: number } = {}): Promise<SalesWork> {
  const database = opts.database ?? db();
  const now = opts.now ?? new Date();
  const stop = Date.now() + (opts.budgetMs ?? 60_000);
  const out: SalesWork = { tenants: 0, abandoned: 0, released: 0, retried: 0 };
  // Each company sets its own quiet time (1 hour at least), so look at anything quiet for an hour.
  const ids = opts.tenantId ? [opts.tenantId] : (await sql<{ id: string }>`select due_sales_tenants(${new Date(now.getTime() - 3_600_000)}) as id`.execute(database)).rows.map((r) => r.id);
  for (const tenantId of ids) {
    if (Date.now() > stop) break;
    out.tenants++;
    const due = await withTenant(
      { tenantId, userId: "system:sales-job" },
      async (tx) => {
        out.abandoned += await markAbandoned(tx, now);
        out.released += await releaseStaleHolds(tx, now);
        const waiting = await tx.selectFrom("orders").select(["id", "fulfillment_detail"]).where("fulfillment", "in", ["pending", "failed"]).limit(20).execute();
        return waiting.filter((o) => {
          const d = (o.fulfillment_detail ?? {}) as { attempts?: number; at?: string };
          const attempts = d.attempts ?? 0;
          if (attempts >= MAX_FULFILLMENT_ATTEMPTS) return false;
          // Back off: 2, 4, 8, 16 minutes after each try.
          return !d.at || now.getTime() - new Date(d.at).getTime() >= 2 ** attempts * 60_000;
        });
      },
      database,
    );
    for (const o of due) {
      if (Date.now() > stop) break;
      await sendToFulfillment(tenantId, o.id, database);
      out.retried++;
    }
  }
  return out;
}
