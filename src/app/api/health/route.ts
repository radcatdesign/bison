import { sql } from "kysely";
import { db } from "@/lib/db";

// Uptime check. Says whether the database answers; never returns data.
export async function GET() {
  try {
    await sql`select 1`.execute(db());
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, problem: "database" }, { status: 503 });
  }
}
