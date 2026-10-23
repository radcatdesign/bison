// Uploaded images, public so email apps can load them. The id is random and
// unguessable; a SECURITY DEFINER lookup finds whose image it is, then the read
// happens under that company's own row-level security.
import { sql } from "kysely";
import { db, isUuid, withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (demoMode() || !isUuid(id)) return new Response("Not found.", { status: 404 });
  const { rows } = await sql<{ tenant_id: string | null }>`select resolve_public_file(${id}) as tenant_id`.execute(db());
  const tenantId = rows[0]?.tenant_id;
  if (!tenantId) return new Response("Not found.", { status: 404 });
  const file = await withTenant({ tenantId }, (tx) => tx.selectFrom("files").select(["bytes", "content_type"]).where("id", "=", id).executeTakeFirst());
  if (!file) return new Response("Not found.", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.content_type,
      // Files never change once uploaded; a new upload gets a new id.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "cross-origin",
    },
  });
}
