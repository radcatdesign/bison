// Image uploads for the brand kit, the email builder and product photos.
// Signed-in only, with the plan and role checked here. Images are re-encoded
// before they're saved.
import { sql } from "kysely";
import { may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { audit } from "@/lib/audit";
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { ImageError, MAX_UPLOAD_BYTES, processImage } from "@/lib/marketing/images";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { allow } from "@/lib/rate-limit";

export const maxDuration = 30;
const MAX_FILES = 2000;

const refuse = (status: number, message: string) => Response.json({ message }, { status });

export async function POST(req: Request) {
  const ctx = await getPortalContext();
  const wanted = new URL(req.url).searchParams.get("kind");
  if (wanted === "product-image") {
    if (!can(ctx.tenant, "sales.products")) return refuse(403, "Product photos are part of Sales. Unlock Sales to upload them.");
    if (!may(ctx.member.role, "sales.edit")) return refuse(403, "Your role can't change products.");
  } else {
    if (!can(ctx.tenant, "marketing.newsletters")) return refuse(403, "Images are part of Marketing. Unlock Marketing to upload them.");
    if (!may(ctx.member.role, "marketing.edit")) return refuse(403, "Your role can't upload images.");
  }
  if (demoMode()) return refuse(403, "This is a demo, so images stay in your browser.");
  if (!allow(`upload:${ctx.tenant.id}`, 120, 60 * 60 * 1000)) return refuse(429, "That's a lot of uploads in an hour. Try again in a little while.");

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 100_000) return refuse(413, "That image is over 12 MB. Try a smaller one.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return refuse(400, "Couldn't read that upload. Try again.");
  }
  const file = form.get("file");
  const kind = wanted === "product-image" ? "product-image" : form.get("kind") === "logo" ? "logo" : "email-image";
  if (!(file instanceof File)) return refuse(400, "Pick an image to upload.");
  if (file.size > MAX_UPLOAD_BYTES) return refuse(413, "That image is over 12 MB. Try a smaller one.");

  let image;
  try {
    image = await processImage(Buffer.from(await file.arrayBuffer()), kind);
  } catch (err) {
    if (err instanceof ImageError) return refuse(400, err.message);
    console.error("image processing failed", err);
    return refuse(500, "Couldn't process that image. Try a different one.");
  }

  const saved = await withTenant(scopeOf(ctx), async (tx) => {
    const { n } = await tx.selectFrom("files").select(sql<number>`count(*)::int`.as("n")).executeTakeFirstOrThrow();
    if (n >= MAX_FILES) return null;
    const row = await tx
      .insertInto("files")
      .values({ kind, content_type: image.contentType, bytes: image.bytes, width: image.width, height: image.height, name: file.name.slice(0, 200), created_by: ctx.member.email })
      .returning("id")
      .executeTakeFirstOrThrow();
    await audit(tx, { action: "file.uploaded", targetType: "file", targetId: row.id, detail: { kind, bytes: image.bytes.length } });
    return row;
  });
  if (!saved) return refuse(409, `You've reached ${MAX_FILES} images. Remove some you no longer use, or contact support.`);
  return Response.json({ src: `/f/${saved.id}`, width: image.width, height: image.height });
}
