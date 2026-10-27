import "server-only";
// Instant lead alerts (a boost): an email to the team the moment someone
// becomes a lead at the kiosk or on a funnel page. Runs after the person's
// answer has gone back, so a slow email never holds up the tablet or the form.
import { appUrl } from "@/lib/env";
import { type Database, db, withTenant } from "@/lib/db";
import { plainEmail, salesSender, sendOne } from "@/lib/sales/emails";
import { getSalesSettings } from "@/lib/sales/store";
import type { Delivery } from "@/lib/sales/types";
import { type LeadNote, leadAlertText } from "./catalog";
import { boostOn } from "./store";

/** Sends the alert when the club has the boost on. Never throws; returns what happened, or null when it's off. */
export async function sendLeadAlert(tenantId: string, note: LeadNote, database: Database = db()): Promise<Delivery | null> {
  try {
    const job = await withTenant(
      { tenantId, userId: "system:lead-alert" },
      async (tx) => {
        if (!(await boostOn(tx, "lead-alerts"))) return null;
        const settings = await getSalesSettings(tx);
        return { to: settings.store.alertEmails, sender: await salesSender(tx) };
      },
      database,
    );
    if (!job || !job.to.length) return null;
    const t = leadAlertText(note);
    const mail = job.sender ? plainEmail(job.sender, t.subject, t.lines.join("\n\n"), { label: "Open Leads", href: `${appUrl()}/analyze/contacts` }) : { subject: t.subject, html: "", text: "" };
    const ref = `${note.kind}:${note.email}`;
    return await sendOne(job.sender, { to: job.to.join(","), replyTo: note.email, subject: mail.subject, html: mail.html, text: mail.text, kind: "lead-alert", ref }, `fit/lead-alert/${tenantId}/${ref}/${Date.now()}`);
  } catch (err) {
    console.error("lead alert failed", err);
    return null;
  }
}
