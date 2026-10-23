// Subscribers as a CSV, for owners and admins. Cells are written so a
// spreadsheet can't mistake them for formulas.
import { sql } from "kysely";
import { may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { toCsv } from "@/lib/marketing/csv";
import { getMarketingSettings, settingsTenantOf } from "@/lib/marketing/store";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { sampleLists, sampleSubscribers } from "@/lib/sample/marketing";

const HEADER = ["Email", "Name", "Type", "Status", "Joined", "Lists", "Source"];

export async function GET() {
  const ctx = await getPortalContext();
  if (!can(ctx.tenant, "marketing.subscribers")) return new Response("Subscribers are part of Marketing.", { status: 403 });
  if (!may(ctx.member.role, "data.export")) return new Response("Only owners and admins can export subscribers.", { status: 403 });

  let rows: string[][];
  if (demoMode() || ctx.settings.sampleData) {
    const names = new Map(sampleLists(ctx.tenant).map((l) => [l.id, l.name]));
    rows = sampleSubscribers(ctx.tenant).map((x) => [x.email, x.name, x.kind, x.status, x.subscribedAt.toISOString().slice(0, 10), x.listIds.map((id) => names.get(id)).join("; "), x.source]);
  } else {
    rows = await withTenant(scopeOf(ctx), async (tx) => {
      const types = new Map((await getMarketingSettings(tx, settingsTenantOf(ctx))).signup.types.map((t) => [t.value, t.label]));
      const data = await tx
        .selectFrom("subscribers as s")
        .select(["s.email", "s.name", "s.kind", "s.status", "s.subscribed_at", "s.source"])
        .select(sql<string>`coalesce((select string_agg(l.name, '; ' order by l.name) from list_items li join lists l on l.tenant_id = li.tenant_id and l.id = li.list_id where li.subscriber_id = s.id), '')`.as("lists"))
        .orderBy("s.subscribed_at", "desc")
        .execute();
      return data.map((r) => [r.email, r.name, types.get(r.kind) ?? r.kind, r.status, r.subscribed_at.toISOString().slice(0, 10), r.lists, r.source]);
    });
  }
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(HEADER, rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="subscribers-${ctx.tenant.slug}-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
