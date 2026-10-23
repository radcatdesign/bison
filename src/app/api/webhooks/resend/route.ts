// Resend delivery events: delivered, bounced, complained, suppressed.
// Signature checked first; deliveries deduped in webhook_events.
import { handleResendEvent, verifyResendWebhook } from "@/lib/marketing/webhook";

export async function POST(req: Request) {
  const deliveryId = req.headers.get("svix-id");
  const body = await req.text();
  if (body.length > 100_000) return new Response("Too large.", { status: 413 });
  const event = verifyResendWebhook(body, req.headers);
  if (!event || !deliveryId) return new Response("Signature check failed.", { status: 400 });
  try {
    return new Response(await handleResendEvent(deliveryId, event), { status: 200 });
  } catch (err) {
    console.error("resend webhook failed", err);
    return new Response("Failed. Resend will retry.", { status: 500 });
  }
}
