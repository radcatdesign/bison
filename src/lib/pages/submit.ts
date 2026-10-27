import "server-only";
// Form sends from published landing pages. They land in Contacts like any other
// form: one contact per email address, one submission per send.
import { sql } from "kysely";
import type { LeadNote } from "@/lib/boosts/catalog";
import { type Database, db, isUuid, withTenant } from "@/lib/db";
import { signUp, startSeries } from "@/lib/marketing/people";
import { getMarketingSettings, tenantInfo } from "@/lib/marketing/store";
import { checkFormToken } from "./form-token";
import { getPublishedPage } from "./repo";
import { type PageDoc, pageDocSchema } from "./schema";

export type SubmitInput = { formId?: unknown; fields?: unknown; trap?: unknown; token?: unknown; version?: unknown };
/** `spam` sends get the same answer as real ones; `pageId` lets the caller count an A/B test goal. */
export type SubmitResult = { ok: true; message: string; tenantId?: string; pageId?: string; queued?: boolean; spam?: boolean; lead?: LeadNote } | { ok: false; status: number; message: string };

/** The page as this visitor saw it: a version of a running A/B test, or the published page. */
async function versionDoc(tenantId: string, pageId: string, versionId: unknown, database: Database): Promise<PageDoc | null> {
  if (typeof versionId !== "string" || !isUuid(versionId)) return null;
  const row = await withTenant(
    { tenantId, userId: "public:page-form" },
    (tx) =>
      tx
        .selectFrom("page_test_versions as v")
        .innerJoin("page_tests as t", (j) => j.onRef("t.id", "=", "v.test_id").onRef("t.tenant_id", "=", "v.tenant_id"))
        .select("v.doc")
        .where("v.id", "=", versionId)
        .where("t.page_id", "=", pageId)
        .where("t.status", "=", "running")
        .executeTakeFirst(),
    database,
  );
  const parsed = row?.doc ? pageDocSchema.safeParse(typeof row.doc === "string" ? JSON.parse(row.doc) : row.doc) : null;
  return parsed?.success ? parsed.data : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitPageForm(tenantSlug: string, pageSlug: string, input: SubmitInput, database: Database = db(), now = Date.now()): Promise<SubmitResult> {
  const page = await getPublishedPage(tenantSlug, pageSlug, database);
  if (!page) return { ok: false, status: 404, message: "This page isn't available anymore." };
  // In an A/B test, version B's form can differ from the live page's, so check against what they saw.
  const doc = (await versionDoc(page.tenantId, page.pageId, input.version, database)) ?? page.doc;
  const form = doc.sections.find((s) => s.type === "form" && s.id === input.formId);
  if (!form || form.type !== "form") return { ok: false, status: 400, message: "This form has changed since the page loaded. Reload the page and try again." };

  const given = input.fields && typeof input.fields === "object" ? (input.fields as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};
  for (const f of form.fields) {
    const v = given[f];
    if (typeof v === "string" && v.trim()) fields[f] = v.trim().slice(0, f === "message" ? 2000 : 200);
  }
  if (fields.kind !== undefined) fields.kind = fields.kind.toLowerCase().slice(0, 40);
  const email = (fields.email ?? "").toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, status: 400, message: "Enter your email address so they can reply." };
  fields.email = email;

  // Bots fill the hidden field, skip the page, or send instantly. They get the
  // same answer as a person, so they learn nothing, and the send is kept as spam.
  const trapped = typeof input.trap === "string" && input.trap.length > 0;
  const token = checkFormToken(input.token, page.pageId, now);
  const spamReason = trapped ? "hidden field filled" : token === "too-fast" ? "sent too fast" : token === "missing" ? "no form token" : token === "expired" ? "form token expired" : null;

  const queued = await withTenant(
    { tenantId: page.tenantId, userId: "public:page-form" },
    async (tx) => {
      if (spamReason) {
        await tx
          .insertInto("submissions")
          .values({ contact_id: null, form_key: `page:${page.slug}`, form_type: "landing-page", fields: JSON.stringify(fields), status: "spam", spam_reason: spamReason, alert: "{}" })
          .execute();
        return false;
      }
      // "I am a..." only keeps values the company set up; anything else is dropped.
      const settings = await getMarketingSettings(tx, await tenantInfo(tx));
      if (fields.kind !== undefined && !settings.signup.types.some((t) => t.value === fields.kind)) delete fields.kind;
      const contact = await tx
        .insertInto("contacts")
        .values({ email, name: fields.name ?? "", phone: fields.phone ?? "" })
        .onConflict((oc) =>
          oc.columns(["tenant_id", "email"]).doUpdateSet({
            last_seen_at: sql`now()`,
            is_new: true,
            // A public form fills in what's missing but never overwrites what the team already has.
            name: sql`coalesce(nullif(contacts.name, ''), excluded.name)`,
            phone: sql`coalesce(nullif(contacts.phone, ''), excluded.phone)`,
          }),
        )
        .returning("id")
        .executeTakeFirstOrThrow();
      await tx
        .insertInto("submissions")
        .values({ contact_id: contact.id, form_key: `page:${page.slug}`, form_type: "landing-page", fields: JSON.stringify(fields), alert: "{}" })
        .execute();

      let started = 0;
      let subscriberId: string | null = null;
      if (form.subscribe) {
        const r = await signUp(tx, { email, name: fields.name ?? "", kind: fields.kind ?? "", source: "page", detail: `page:${page.slug}`, offer: settings.offer });
        if (r.ok) {
          subscriberId = r.id;
          started += r.created || r.resubscribed ? 1 : 0;
        }
      }
      started += await startSeries(tx, "form", { email, name: fields.name ?? "", subscriberId }, `page:${page.slug}`);
      return started > 0;
    },
    database,
  );
  const lead: LeadNote | undefined = spamReason ? undefined : { kind: "page", name: fields.name ?? "", email, phone: fields.phone ?? "", detail: [`Page: ${page.slug}`, fields.message ? `"${fields.message.slice(0, 500)}"` : ""].filter(Boolean).join("\n") };
  return { ok: true, message: form.success, tenantId: page.tenantId, pageId: page.pageId, queued, spam: Boolean(spamReason), lead };
}
