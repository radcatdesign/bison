import "server-only";
// Email series in the database: the starter welcome series every company gets,
// and reading series with their steps for the screens.
import type { Tx } from "@/lib/db";
import { starterSeries } from "./starter";

/** Creates the starter welcome series once per company, turned off. Safe to call on every visit. */
export async function ensureStarterSeries(tx: Tx, site: string | undefined): Promise<void> {
  const existing = await tx.selectFrom("sequences").select("id").where("starter", "=", true).executeTakeFirst();
  if (existing) return;
  const starter = starterSeries(site);
  const row = await tx
    .insertInto("sequences")
    .values({ name: starter.name, trigger: "joined", status: "off", starter: true })
    .onConflict((oc) => oc.doNothing())
    .returning("id")
    .executeTakeFirst();
  if (!row) return;
  await tx
    .insertInto("sequence_steps")
    .values(starter.steps.map((s) => ({ sequence_id: row.id, delay_days: s.delayDays, subject: s.subject, preheader: s.preheader, doc: JSON.stringify(s.doc) })))
    .execute();
}
