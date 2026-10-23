import "server-only";
// What Resend tells us after an email goes out. Signed with Svix and checked
// before anything is read. Hard bounces, spam complaints and Resend's own
// suppressions put the address on the do-not-email list, the same as an
// unsubscribe, so the provider and Bison Ops never disagree about who to skip.
import { sql } from "kysely";
import { Webhook } from "svix";
import { type Database, db, withTenant } from "@/lib/db";
import { unsubscribeEmail } from "./people";

export type ResendEvent = { type?: string; data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string; subType?: string; message?: string } } };

export function verifyResendWebhook(body: string, headers: Headers, secret = process.env.RESEND_WEBHOOK_SECRET): ResendEvent | null {
  if (!secret) return null;
  try {
    return new Webhook(secret).verify(body, {
      "svix-id": headers.get("svix-id") ?? "",
      "svix-timestamp": headers.get("svix-timestamp") ?? "",
      "svix-signature": headers.get("svix-signature") ?? "",
    }) as unknown as ResendEvent;
  } catch {
    return null;
  }
}

export async function handleResendEvent(deliveryId: string, event: ResendEvent, database: Database = db()): Promise<string> {
  const providerId = event.data?.email_id;
  if (!providerId || !event.type) return "Ignored.";
  const { rows } = await sql<{ tenant_id: string; send_id: string }>`select * from resolve_email_provider_id(${providerId})`.execute(database);
  const hit = rows[0];
  if (!hit) return "Not one of ours.";

  return withTenant(
    { tenantId: hit.tenant_id, userId: "system:resend" },
    async (tx) => {
      const fresh = await tx.insertInto("webhook_events").values({ provider: "resend", event_id: deliveryId }).onConflict((oc) => oc.doNothing()).executeTakeFirst();
      if (!fresh.numInsertedOrUpdatedRows) return "Already processed.";
      const send = await tx.selectFrom("email_sends").select(["id", "email", "status"]).where("id", "=", hit.send_id).executeTakeFirst();
      if (!send) return "Send not found.";

      switch (event.type) {
        case "email.delivered":
          await tx.updateTable("email_sends").set({ status: "delivered" }).where("id", "=", send.id).where("status", "=", "sent").execute();
          return "Delivered.";
        case "email.bounced": {
          const temporary = /transient|temporary|soft/i.test(event.data?.bounce?.type ?? "");
          await tx.updateTable("email_sends").set({ status: "bounced", error: (event.data?.bounce?.message ?? "Bounced").slice(0, 500) }).where("id", "=", send.id).execute();
          if (!temporary) await unsubscribeEmail(tx, send.email, "bounce", event.data?.bounce?.subType ?? "");
          return temporary ? "Soft bounce noted." : "Hard bounce: address won't be emailed again.";
        }
        case "email.complained":
          await tx.updateTable("email_sends").set({ status: "complained" }).where("id", "=", send.id).execute();
          await unsubscribeEmail(tx, send.email, "complaint", "Marked as spam");
          return "Complaint: address unsubscribed.";
        case "email.suppressed":
          await tx.updateTable("email_sends").set({ status: "failed", error: "Resend skipped this address because it bounced or complained before." }).where("id", "=", send.id).execute();
          await unsubscribeEmail(tx, send.email, "suppressed", "Suppressed by the email provider");
          return "Suppressed: address won't be emailed again.";
        default:
          return "Ignored.";
      }
    },
    database,
  );
}
