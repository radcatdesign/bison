import "server-only";
// Newsletters and saved templates in the database. Every read and write runs
// inside withTenant. Newsletters are content, so drafts save whether sample
// data is on or off; sending to the list is what sample mode stops.
import { sql } from "kysely";
import { audit } from "@/lib/audit";
import { isUuid, type TenantScope, type Tx, withTenant } from "@/lib/db";
import type { NewsletterStatus } from "@/lib/db/types";
import { emailProblems } from "@/lib/email/ops";
import { type EmailDoc, fileIdsIn, hasInlineImages, parseEmailDoc } from "@/lib/email/schema";
import { emailsThisMonth } from "./people";
import { loadSendSetup, readDoc, sendBlocker } from "./send";
import { ownFiles } from "./store";
import { monthlyEmailLimit, startNewsletter } from "./worker";

export class NewsletterInputError extends Error {}

export type NewsletterStats = { recipients: number; sent: number; delivered: number; bounced: number; complained: number; failed: number; canceled: number; waiting: number; unsubscribed: number };
export type NewsletterSummary = {
  id: string;
  subject: string;
  preheader: string;
  status: NewsletterStatus;
  audience: "all" | "list";
  listId: string | null;
  audienceName: string;
  scheduledFor: Date | null;
  sentAt: Date | null;
  updatedAt: Date;
  error: string | null;
  stats: NewsletterStats;
  doc: EmailDoc;
};

const EMPTY_STATS: NewsletterStats = { recipients: 0, sent: 0, delivered: 0, bounced: 0, complained: 0, failed: 0, canceled: 0, waiting: 0, unsubscribed: 0 };

export type Content = { subject: string; preheader: string; doc: EmailDoc };

/** Checks content from the browser: the schema, no demo-only pictures, and only this company's uploads. */
export async function checkContent(tx: Tx, input: { subject?: unknown; preheader?: unknown; doc?: unknown }): Promise<Content> {
  const subject = typeof input.subject === "string" ? input.subject.replace(/[\r\n]+/g, " ").trim().slice(0, 150) : "";
  const preheader = typeof input.preheader === "string" ? input.preheader.replace(/[\r\n]+/g, " ").trim().slice(0, 150) : "";
  let doc: EmailDoc;
  try {
    doc = parseEmailDoc(input.doc);
  } catch (err) {
    throw new NewsletterInputError(err instanceof Error ? err.message : "That email didn't load correctly.");
  }
  if (hasInlineImages(doc)) throw new NewsletterInputError("One of the pictures didn't finish uploading. Upload it again.");
  if (!(await ownFiles(tx, fileIdsIn(doc)))) throw new NewsletterInputError("One of the pictures isn't one of your uploads. Upload it again.");
  return { subject, preheader, doc };
}

async function statsFor(tx: Tx, ids: string[]): Promise<Map<string, NewsletterStats>> {
  const out = new Map<string, NewsletterStats>();
  if (!ids.length) return out;
  const { rows } = await sql<{ newsletter_id: string; status: string; n: number; unsub: number }>`
    select e.newsletter_id, e.status, count(*)::int as n,
      count(u.id)::int as unsub
    from email_sends e
    left join unsubscribes u on u.tenant_id = e.tenant_id and u.detail = 'send ' || e.id::text
    where e.kind = 'newsletter' and e.newsletter_id = any(${ids}::uuid[])
    group by e.newsletter_id, e.status`.execute(tx);
  for (const r of rows) {
    const s = out.get(r.newsletter_id) ?? { ...EMPTY_STATS };
    s.recipients += r.n;
    s.unsubscribed += r.unsub;
    if (r.status === "sent" || r.status === "delivered" || r.status === "bounced" || r.status === "complained") s.sent += r.n;
    if (r.status === "delivered") s.delivered += r.n;
    if (r.status === "bounced") s.bounced += r.n;
    if (r.status === "complained") s.complained += r.n;
    if (r.status === "failed") s.failed += r.n;
    if (r.status === "canceled") s.canceled += r.n;
    if (r.status === "queued" || r.status === "sending") s.waiting += r.n;
    out.set(r.newsletter_id, s);
  }
  return out;
}

type Row = { id: string; subject: string; preheader: string; status: NewsletterStatus; audience: "all" | "list"; list_id: string | null; audience_name: string; scheduled_for: Date | null; sent_at: Date | null; updated_at: Date; error: string | null; doc: unknown };

function toSummary(r: Row, stats: NewsletterStats | undefined): NewsletterSummary | null {
  const doc = readDoc(r.doc);
  if (!doc) return null;
  return { id: r.id, subject: r.subject, preheader: r.preheader, status: r.status, audience: r.audience, listId: r.list_id, audienceName: r.audience_name, scheduledFor: r.scheduled_for, sentAt: r.sent_at, updatedAt: r.updated_at, error: r.error, stats: stats ?? { ...EMPTY_STATS }, doc };
}

const COLUMNS = ["id", "subject", "preheader", "status", "audience", "list_id", "audience_name", "scheduled_for", "sent_at", "updated_at", "error", "doc"] as const;

export async function listNewsletters(scope: TenantScope): Promise<NewsletterSummary[]> {
  return withTenant(scope, async (tx) => {
    const rows = await tx.selectFrom("newsletters").select(COLUMNS).orderBy("updated_at", "desc").limit(200).execute();
    const stats = await statsFor(tx, rows.map((r) => r.id));
    return rows.map((r) => toSummary(r, stats.get(r.id))).filter((x): x is NewsletterSummary => !!x);
  });
}

export async function getNewsletter(scope: TenantScope, id: string): Promise<NewsletterSummary | null> {
  if (!isUuid(id)) return null;
  return withTenant(scope, async (tx) => {
    const r = await tx.selectFrom("newsletters").select(COLUMNS).where("id", "=", id).executeTakeFirst();
    if (!r) return null;
    return toSummary(r, (await statsFor(tx, [id])).get(id));
  });
}

export async function createNewsletter(scope: TenantScope, content: Content, actor: string): Promise<string> {
  return withTenant(scope, async (tx) => {
    const row = await tx.insertInto("newsletters").values({ subject: content.subject, preheader: content.preheader, doc: JSON.stringify(content.doc), created_by: actor }).returning("id").executeTakeFirstOrThrow();
    await audit(tx, { action: "newsletter.created", targetType: "newsletter", targetId: row.id });
    return row.id;
  });
}

const EDITABLE: NewsletterStatus[] = ["draft", "failed", "scheduled", "canceled"];

export async function saveNewsletter(scope: TenantScope, id: string, input: { subject?: unknown; preheader?: unknown; doc?: unknown }): Promise<Date> {
  if (!isUuid(id)) throw new NewsletterInputError("That newsletter doesn't exist.");
  return withTenant(scope, async (tx) => {
    const content = await checkContent(tx, input);
    const row = await tx
      .updateTable("newsletters")
      .set({ subject: content.subject, preheader: content.preheader, doc: JSON.stringify(content.doc) })
      .where("id", "=", id)
      .where("status", "in", EDITABLE)
      .returning("updated_at")
      .executeTakeFirst();
    if (!row) throw new NewsletterInputError("This newsletter has gone out, so it can't change. Duplicate it to make a new one.");
    return row.updated_at;
  });
}

export async function deleteNewsletter(scope: TenantScope, id: string): Promise<void> {
  if (!isUuid(id)) return;
  await withTenant(scope, async (tx) => {
    const r = await tx.deleteFrom("newsletters").where("id", "=", id).where("status", "in", ["draft", "failed", "canceled"]).returning("id").executeTakeFirst();
    if (!r) throw new NewsletterInputError("Scheduled or sent newsletters can't be deleted. Cancel the schedule first.");
    await audit(tx, { action: "newsletter.deleted", targetType: "newsletter", targetId: id });
  });
}

export async function duplicateNewsletter(scope: TenantScope, id: string, actor: string): Promise<string> {
  const n = await getNewsletter(scope, id);
  if (!n) throw new NewsletterInputError("That newsletter doesn't exist.");
  return createNewsletter(scope, { subject: n.subject, preheader: n.preheader, doc: n.doc }, actor);
}

export const MAX_SCHEDULE_DAYS = 30;

export type ScheduleInput = { when: Date | null; audience: "all" | "list"; listId: string | null };
export type ScheduleResult = { ok: true; recipients: number; at: Date; now: boolean } | { ok: false; message: string };

/** Count of people a newsletter would go to right now. */
export async function audienceCount(tx: Tx, audience: "all" | "list", listId: string | null): Promise<number> {
  const { rows } = await sql<{ n: number }>`
    select count(*)::int as n from subscribers s
    where s.status = 'subscribed'
      and not exists (select 1 from unsubscribes u where u.email = s.email)
      and (${audience} = 'all' or exists (select 1 from list_items li where li.subscriber_id = s.id and li.list_id = ${listId}::uuid))`.execute(tx);
  return rows[0]?.n ?? 0;
}

/**
 * Schedules a newsletter, or sends it now. Checks everything first: the email
 * itself, sending setup, sample mode, the audience, the date, and the plan's
 * monthly email count.
 */
export async function scheduleNewsletter(scope: TenantScope, id: string, input: ScheduleInput, now = new Date()): Promise<ScheduleResult> {
  if (!isUuid(id)) return { ok: false, message: "That newsletter doesn't exist." };
  return withTenant(scope, async (tx) => {
    const n = await tx.selectFrom("newsletters").select(["status", "subject", "preheader", "doc"]).where("id", "=", id).forUpdate().executeTakeFirst();
    if (!n) return { ok: false as const, message: "That newsletter doesn't exist." };
    if (n.status === "sending" || n.status === "sent") return { ok: false as const, message: "This newsletter has already gone out." };
    const doc = readDoc(n.doc);
    if (!doc) return { ok: false as const, message: "This email didn't load correctly. Reload the page." };
    const problems = emailProblems(doc, n.subject, n.preheader);
    if (problems.length) return { ok: false as const, message: problems[0].text };

    const setup = await loadSendSetup(tx);
    const blocker = sendBlocker(setup);
    if (blocker) return { ok: false as const, message: blocker };
    if (setup.info.sampleData) return { ok: false as const, message: "Sample data is on, so your list on screen is made up. Turn it off in Settings to send to your real subscribers." };

    let listId: string | null = null;
    if (input.audience === "list") {
      if (!input.listId || !isUuid(input.listId)) return { ok: false as const, message: "Pick a list." };
      const list = await tx.selectFrom("lists").select("id").where("id", "=", input.listId).executeTakeFirst();
      if (!list) return { ok: false as const, message: "That list doesn't exist anymore." };
      listId = list.id;
    }
    const recipients = await audienceCount(tx, input.audience, listId);
    if (!recipients) return { ok: false as const, message: input.audience === "list" ? "Nobody on that list is subscribed right now." : "Nobody is subscribed yet. Add subscribers first." };
    const left = monthlyEmailLimit() - (await emailsThisMonth(tx));
    if (recipients > left) return { ok: false as const, message: `This would send ${recipients.toLocaleString("en-US")} emails, and your plan has ${Math.max(0, left).toLocaleString("en-US")} left this month. It resets on the 1st.` };

    const sendNow = !input.when;
    const at = input.when ?? now;
    if (!sendNow) {
      if (at.getTime() < now.getTime() + 2 * 60_000) return { ok: false as const, message: "Pick a time at least a few minutes from now, or send it now." };
      if (at.getTime() > now.getTime() + MAX_SCHEDULE_DAYS * 86_400_000) return { ok: false as const, message: `Schedule up to ${MAX_SCHEDULE_DAYS} days ahead.` };
    }
    await tx.updateTable("newsletters").set({ status: "scheduled", scheduled_for: at, audience: input.audience, list_id: listId, error: null }).where("id", "=", id).execute();
    await audit(tx, { action: sendNow ? "newsletter.send_now" : "newsletter.scheduled", targetType: "newsletter", targetId: id, detail: { at: at.toISOString(), recipients } });
    if (sendNow) {
      const started = await startNewsletter(tx, id, setup);
      if (!started.ok) return { ok: false as const, message: started.error };
    }
    return { ok: true as const, recipients, at, now: sendNow };
  });
}

export async function cancelSchedule(scope: TenantScope, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return withTenant(scope, async (tx) => {
    const r = await tx.updateTable("newsletters").set({ status: "draft", scheduled_for: null }).where("id", "=", id).where("status", "=", "scheduled").returning("id").executeTakeFirst();
    if (r) await audit(tx, { action: "newsletter.unscheduled", targetType: "newsletter", targetId: id });
    return Boolean(r);
  });
}

// ---- Saved templates ---------------------------------------------------------------------

export type SavedTemplate = { id: string; name: string; subject: string; preheader: string; doc: EmailDoc };

export async function listTemplates(scope: TenantScope): Promise<SavedTemplate[]> {
  return withTenant(scope, async (tx) => {
    const rows = await tx.selectFrom("newsletter_templates").select(["id", "name", "subject", "preheader", "doc"]).orderBy("created_at", "desc").limit(50).execute();
    return rows.flatMap((r) => {
      const doc = readDoc(r.doc);
      return doc ? [{ id: r.id, name: r.name, subject: r.subject, preheader: r.preheader, doc }] : [];
    });
  });
}

export async function saveTemplate(scope: TenantScope, name: string, input: { subject?: unknown; preheader?: unknown; doc?: unknown }, actor: string): Promise<string> {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new NewsletterInputError("Give the template a name.");
  return withTenant(scope, async (tx) => {
    const content = await checkContent(tx, input);
    const { n } = await tx.selectFrom("newsletter_templates").select(sql<number>`count(*)::int`.as("n")).executeTakeFirstOrThrow();
    if (n >= 50) throw new NewsletterInputError("You have 50 saved templates. Delete one you don't use first.");
    const row = await tx.insertInto("newsletter_templates").values({ name: clean, subject: content.subject, preheader: content.preheader, doc: JSON.stringify(content.doc), created_by: actor }).returning("id").executeTakeFirstOrThrow();
    return row.id;
  });
}

export async function deleteTemplate(scope: TenantScope, id: string): Promise<void> {
  if (!isUuid(id)) return;
  await withTenant(scope, (tx) => tx.deleteFrom("newsletter_templates").where("id", "=", id).execute());
}
