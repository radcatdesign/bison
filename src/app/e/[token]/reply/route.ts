import { z } from "zod";
import { demoMode } from "@/lib/env";
import { clientReply, resolveEstimateLink } from "@/lib/sales/estimates";
import { failure, json, readBody } from "@/lib/sales/shop-http";
import { allow, clientIp } from "@/lib/rate-limit";

// The client's answer to an estimate: approve (by typing their name), ask for
// changes, or decline. Public; the signed link is the only key.
const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approve"), name: z.string().max(120), seen: z.string().max(40) }),
  z.object({ kind: z.literal("changes"), message: z.string().max(5000), seen: z.string().max(40) }),
  z.object({ kind: z.literal("decline"), message: z.string().max(5000).default(""), seen: z.string().max(40) }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allow(`estimate-reply:${clientIp(req)}`, 20, 10 * 60 * 1000)) return json({ ok: false, message: "Too many tries in a short time. Wait a few minutes." }, 429);
  if (demoMode()) return json({ ok: false, message: "This is a demo." }, 404);
  const parsed = body.safeParse(await readBody(req, 12_000));
  if (!parsed.success) return json({ ok: false, message: "Couldn't read that. Reload the page and try again." }, 400);
  try {
    const link = await resolveEstimateLink(token);
    if (!link) return json({ ok: false, message: "This link isn't working anymore. Ask for a new one." }, 404);
    const r = await clientReply(link.tenantId, link.estimateId, parsed.data);
    return json(r, r.ok ? 200 : 409);
  } catch (err) {
    return failure(err, "estimate reply");
  }
}
