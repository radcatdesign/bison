import { sql } from "kysely";
import { db } from "@/lib/db";
import { demoMode } from "@/lib/env";

// Uptime check. Says whether the database answers; never returns data.
export async function GET() {
  if (demoMode()) return Response.json({ ok: true, demo: true });
  try {
    await sql`select 1`.execute(db());
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, problem: "database" }, { status: 503 });
  }
}
