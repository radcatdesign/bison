import "server-only";
// Form sends from published landing pages. They land in Contacts like any other
// form: one contact per email address, one submission per send.
import { sql } from "kysely";
import { type Database, db, withTenant } from "@/lib/db";
import { getPublishedPage } from "./repo";

export type SubmitInput = { formId?: unknown; fields?: unknown; trap?: unknown; elapsedMs?: unknown };
export type SubmitResult = { ok: true; message: string } | { ok: false; status: number; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Faster than a person can fill in a form. */
const TOO_FAST_MS = 1500;

export async function submitPageForm(tenantSlug: string, pageSlug: string, input: SubmitInput, database: Database = db()): Promise<SubmitResult> {
  const page = await getPublishedPage(tenantSlug, pageSlug, database);
  if (!page) return { ok: false, status: 404, message: "This page isn't available anymore." };
  const form = page.doc.sections.find((s) => s.type === "form" && s.id === input.formId);
  if (!form || form.type !== "form") return { ok: false, status: 400, message: "This form has changed since the page loaded. Reload the page and try again." };

  const given = input.fields && typeof input.fields === "object" ? (input.fields as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};
  for (const f of form.fields) {
    const v = given[f];
    if (typeof v === "string" && v.trim()) fields[f] = v.trim().slice(0, f === "message" ? 2000 : 200);
  }
  const email = (fields.email ?? "").toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, status: 400, message: "Enter your email address so they can reply." };
  fields.email = email;

  // Bots fill the hidden field or send instantly. They get the same answer as a
  // person, so they learn nothing, and the send is kept as spam for review.
  const trapped = typeof input.trap === "string" && input.trap.length > 0;
  const tooFast = typeof input.elapsedMs === "number" && input.elapsedMs < TOO_FAST_MS;

  await withTenant(
    { tenantId: page.tenantId },
    async (tx) => {
      if (trapped || tooFast) {
        await tx
          .insertInto("submissions")
          .values({ contact_id: null, form_key: `page:${page.slug}`, form_type: "landing-page", fields: JSON.stringify(fields), status: "spam", spam_reason: trapped ? "hidden field filled" : "sent too fast", alert: "{}" })
          .execute();
        return;
      }
      const contact = await tx
        .insertInto("contacts")
        .values({ email, name: fields.name ?? "", phone: fields.phone ?? "" })
        .onConflict((oc) =>
          oc.columns(["tenant_id", "email"]).doUpdateSet({
            last_seen_at: sql`now()`,
            is_new: true,
            name: sql`coalesce(nullif(excluded.name, ''), contacts.name)`,
            phone: sql`coalesce(nullif(excluded.phone, ''), contacts.phone)`,
          }),
        )
        .returning("id")
        .executeTakeFirstOrThrow();
      await tx
        .insertInto("submissions")
        .values({ contact_id: contact.id, form_key: `page:${page.slug}`, form_type: "landing-page", fields: JSON.stringify(fields), alert: "{}" })
        .execute();
    },
    database,
  );
  return { ok: true, message: form.success };
}
