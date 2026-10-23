import "server-only";
// The email job. Runs from cron (every few minutes where the plan allows), and
// straight after someone presses Send or signs up, so nothing waits for cron.
//
// For each company with something due:
//   1. scheduled newsletters that are due get their recipients, one queued send each
//   2. series runs that are due get their next step queued
//   3. queued sends go out in batches of up to 100, each claimed with a short
//      lease so two runs of the job never send the same email
//   4. newsletters with nothing left to send are marked sent
//
// Network calls happen between short transactions, never inside one.
import { createHash } from "node:crypto";
import { sql } from "kysely";
import { CATALOG } from "@/config/catalog";
import { can, loadAccess } from "@/lib/access/entitlements";
import { audit } from "@/lib/audit";
import { type Database, db, type Tx, withTenant } from "@/lib/db";
import type { EmailSendKind } from "@/lib/db/types";
import { emailProvider } from "@/lib/email/provider";
import { emailsThisMonth } from "./people";
import { compose, type Content, deliver, loadSendSetup, type OfferCode, readDoc, type SendSetup, sendBlocker } from "./send";

const BATCH = 100;
const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 4;
const STALE_DAYS = 3;
const DAY = 86_400_000;

export const monthlyEmailLimit = () => CATALOG["module:marketing"].limits.emailSendsPerMonth ?? 0;

export type WorkResult = { tenants: number; started: number; queued: number; sent: number; failed: number; finished: number };

const empty = (): WorkResult => ({ tenants: 0, started: 0, queued: 0, sent: 0, failed: 0, finished: 0 });

// ---- 1. Newsletters that are due ----------------------------------------------------

export type StartResult = { ok: true; recipients: number } | { ok: false; error: string };

/**
 * Gives a newsletter its recipients: everyone subscribed (or on its list) who
 * isn't on the do-not-email list. Checks the plan limit before anything queues.
 */
export async function startNewsletter(tx: Tx, newsletterId: string, setup: SendSetup): Promise<StartResult> {
  const n = await tx.selectFrom("newsletters").selectAll().where("id", "=", newsletterId).forUpdate().executeTakeFirst();
  if (!n) return { ok: false, error: "That newsletter doesn't exist anymore." };
  if (n.status !== "scheduled" && n.status !== "draft" && n.status !== "failed") return { ok: false, error: "This newsletter has already gone out." };

  const fail = async (error: string): Promise<StartResult> => {
    await tx.updateTable("newsletters").set({ status: "failed", error }).where("id", "=", n.id).execute();
    await audit(tx, { action: "newsletter.failed", targetType: "newsletter", targetId: n.id, detail: { error } });
    return { ok: false, error };
  };

  const blocker = sendBlocker(setup);
  if (blocker) return fail(blocker);
  if (setup.info.sampleData) return fail("Sample data is on, so your list on screen is made up. Turn it off in Settings, then send again.");
  if (!readDoc(n.doc)) return fail("This email didn't load correctly. Open it, check it, and send again.");
  if (n.audience === "list" && !n.list_id) return fail("The list this was going to was deleted. Pick who it goes to and send again.");

  const listName = n.audience === "list" && n.list_id ? ((await tx.selectFrom("lists").select("name").where("id", "=", n.list_id).executeTakeFirst())?.name ?? "") : "";
  const audienceName = n.audience === "all" ? "Everyone subscribed" : listName;

  const recipients = tx
    .selectFrom("subscribers as s")
    .where("s.status", "=", "subscribed")
    .where((eb) => eb.not(eb.exists(eb.selectFrom("unsubscribes as u").select("u.id").whereRef("u.email", "=", "s.email"))))
    .$if(n.audience === "list", (q) => q.where((eb) => eb.exists(eb.selectFrom("list_items as li").select("li.subscriber_id").whereRef("li.subscriber_id", "=", "s.id").where("li.list_id", "=", n.list_id!))));

  const { count } = await recipients.select(sql<number>`count(*)::int`.as("count")).executeTakeFirstOrThrow();
  if (count === 0) return fail(n.audience === "list" ? `Nobody on ${listName || "that list"} is subscribed right now.` : "Nobody is subscribed yet.");
  const used = await emailsThisMonth(tx);
  const limit = monthlyEmailLimit();
  if (used + count > limit) {
    return fail(`This would send ${count.toLocaleString("en-US")} emails, and your plan has ${Math.max(0, limit - used).toLocaleString("en-US")} left this month. It resets on the 1st.`);
  }

  await tx
    .insertInto("email_sends")
    .columns(["kind", "newsletter_id", "subscriber_id", "email", "name", "subject"])
    .expression(recipients.select([sql<EmailSendKind>`'newsletter'`.as("kind"), sql<string>`${n.id}::uuid`.as("newsletter_id"), "s.id", "s.email", "s.name", sql<string>`${n.subject.slice(0, 200)}`.as("subject")]))
    .onConflict((oc) => oc.doNothing())
    .execute();
  await tx.updateTable("newsletters").set({ status: "sending", started_at: new Date(), recipients: count, audience_name: audienceName, error: null }).where("id", "=", n.id).execute();
  await audit(tx, { action: "newsletter.sending", targetType: "newsletter", targetId: n.id, detail: { recipients: count } });
  return { ok: true, recipients: count };
}

async function startDueNewsletters(tenantId: string, database: Database, result: WorkResult) {
  await withTenant(
    { tenantId },
    async (tx) => {
      // Something that should have gone out days ago (say, while the plan was off) doesn't go out late.
      await tx
        .updateTable("newsletters")
        .set({ status: "failed", error: "This was scheduled more than 3 days ago and didn't go out. Check the date and schedule it again." })
        .where("status", "=", "scheduled")
        .where("scheduled_for", "<", new Date(Date.now() - STALE_DAYS * DAY))
        .execute();
      const due = await tx.selectFrom("newsletters").select("id").where("status", "=", "scheduled").where("scheduled_for", "<=", new Date()).orderBy("scheduled_for").limit(5).execute();
      if (!due.length) return;
      const setup = await loadSendSetup(tx);
      for (const n of due) {
        const r = await startNewsletter(tx, n.id, setup);
        if (r.ok) result.started++;
      }
    },
    database,
  );
}

// ---- 2. Series steps that are due ---------------------------------------------------

async function advanceRuns(tenantId: string, database: Database, result: WorkResult) {
  await withTenant(
    { tenantId },
    async (tx) => {
      const runs = await tx
        .selectFrom("sequence_runs as r")
        .innerJoin("sequences as q", (j) => j.onRef("q.id", "=", "r.sequence_id").onRef("q.tenant_id", "=", "r.tenant_id"))
        .select(["r.id", "r.sequence_id", "r.subscriber_id", "r.email", "r.name", "r.started_at", "r.last_day"])
        .where("r.status", "=", "active")
        .where("q.status", "=", "on")
        .where("r.next_at", "<=", new Date())
        .orderBy("r.next_at")
        .limit(200)
        .forUpdate("r")
        .skipLocked()
        .execute();
      if (!runs.length) return;

      let left = monthlyEmailLimit() - (await emailsThisMonth(tx));
      const blocked = new Set((await tx.selectFrom("unsubscribes").select("email").where("email", "in", runs.map((r) => r.email)).execute()).map((u) => u.email));
      const steps = await tx.selectFrom("sequence_steps").select(["id", "sequence_id", "delay_days", "subject"]).where("sequence_id", "in", [...new Set(runs.map((r) => r.sequence_id))]).orderBy("delay_days").execute();

      for (const run of runs) {
        if (blocked.has(run.email)) {
          await tx.updateTable("sequence_runs").set({ status: "stopped", stopped_reason: "Unsubscribed", next_at: null }).where("id", "=", run.id).execute();
          continue;
        }
        const mine = steps.filter((s) => s.sequence_id === run.sequence_id);
        const step = mine.find((s) => s.delay_days > run.last_day);
        if (!step) {
          await tx.updateTable("sequence_runs").set({ status: "done", next_at: null }).where("id", "=", run.id).execute();
          continue;
        }
        if (left <= 0) {
          // Over the monthly limit: try again tomorrow rather than drop the step.
          await tx.updateTable("sequence_runs").set({ next_at: new Date(Date.now() + DAY) }).where("id", "=", run.id).execute();
          continue;
        }
        await tx
          .insertInto("email_sends")
          .values({ kind: "series", sequence_id: run.sequence_id, step_id: step.id, run_id: run.id, subscriber_id: run.subscriber_id, email: run.email, name: run.name, subject: step.subject.slice(0, 200) })
          .onConflict((oc) => oc.doNothing())
          .execute();
        left--;
        result.queued++;
        const next = mine.find((s) => s.delay_days > step.delay_days);
        await tx
          .updateTable("sequence_runs")
          .set({ last_day: step.delay_days, next_at: next ? new Date(run.started_at.getTime() + next.delay_days * DAY) : null, status: next ? "active" : "done" })
          .where("id", "=", run.id)
          .execute();
      }
    },
    database,
  );
}

// ---- 3. Sending what's queued ---------------------------------------------------------

type Claimed = { id: string; kind: EmailSendKind; newsletter_id: string | null; step_id: string | null; sequence_id: string | null; email: string; name: string; attempts: number };

async function claim(tenantId: string, database: Database): Promise<Claimed[]> {
  return withTenant(
    { tenantId },
    async (tx) => {
      await tx
        .updateTable("email_sends")
        .set({ status: "canceled", error: "Waited too long to send, so it was dropped.", locked_until: null })
        .where("status", "=", "queued")
        .where("created_at", "<", new Date(Date.now() - STALE_DAYS * DAY))
        .execute();
      const { rows } = await sql<Claimed>`
        update email_sends e set status = 'sending', locked_until = now() + ${`${LEASE_MS / 1000} seconds`}::interval, attempts = e.attempts + 1
        where e.id in (
          select x.id from email_sends x
          where x.kind <> 'test'
            and ((x.status = 'queued' and x.next_attempt_at <= now()) or (x.status = 'sending' and x.locked_until < now()))
            and (x.kind <> 'series' or exists (select 1 from sequences q where q.tenant_id = x.tenant_id and q.id = x.sequence_id and q.status = 'on'))
          order by x.next_attempt_at
          limit ${BATCH}
          for update skip locked
        )
        returning e.id, e.kind, e.newsletter_id, e.step_id, e.sequence_id, e.email, e.name, e.attempts`.execute(tx);
      return rows;
    },
    database,
  );
}

async function sendQueued(tenantId: string, database: Database, deadline: number, result: WorkResult) {
  const provider = emailProvider();
  if (!provider) return;
  let setup: SendSetup | null = null;
  const contents = new Map<string, Content | null>();

  while (Date.now() < deadline) {
    const rows = await claim(tenantId, database);
    if (!rows.length) return;

    const prepared = await withTenant(
      { tenantId },
      async (tx) => {
        setup ??= await loadSendSetup(tx);
        const newsletterIds = [...new Set(rows.map((r) => r.newsletter_id).filter((x): x is string => !!x && !contents.has(`n:${x}`)))];
        if (newsletterIds.length) {
          for (const n of await tx.selectFrom("newsletters").select(["id", "doc", "subject", "preheader", "created_at"]).where("id", "in", newsletterIds).execute()) {
            const doc = readDoc(n.doc);
            contents.set(`n:${n.id}`, doc ? { doc, subject: n.subject, preheader: n.preheader, campaign: `newsletter-${n.created_at.toISOString().slice(0, 10)}` } : null);
          }
        }
        const stepIds = [...new Set(rows.map((r) => r.step_id).filter((x): x is string => !!x && !contents.has(`s:${x}`)))];
        if (stepIds.length) {
          for (const s of await tx.selectFrom("sequence_steps as s").innerJoin("sequences as q", (j) => j.onRef("q.id", "=", "s.sequence_id").onRef("q.tenant_id", "=", "s.tenant_id")).select(["s.id", "s.doc", "s.subject", "s.preheader", "s.delay_days", "q.name"]).where("s.id", "in", stepIds).execute()) {
            const doc = readDoc(s.doc);
            contents.set(`s:${s.id}`, doc ? { doc, subject: s.subject, preheader: s.preheader, campaign: `${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-day-${s.delay_days}` } : null);
          }
        }
        const emails = rows.map((r) => r.email);
        const blocked = new Set((await tx.selectFrom("unsubscribes").select("email").where("email", "in", emails).execute()).map((u) => u.email));
        const offers = new Map((await tx.selectFrom("offer_codes").select(["email", "code", "discount_kind", "discount", "expires_at", "redeemed_at"]).where("email", "in", emails).execute()).filter((o) => !o.redeemed_at).map((o) => [o.email, o as OfferCode]));
        return { blocked, offers };
      },
      database,
    );
    const s = setup as SendSetup | null;
    if (!s) return;

    const outcomes = new Map<string, { status: "sent" | "queued" | "failed" | "canceled"; providerId?: string; error?: string; attempts: number }>();
    const batch: { row: Claimed; email: ReturnType<typeof compose> }[] = [];
    const blocker = sendBlocker(s);
    for (const row of rows) {
      const content = contents.get(row.newsletter_id ? `n:${row.newsletter_id}` : `s:${row.step_id}`) ?? null;
      if (prepared.blocked.has(row.email)) outcomes.set(row.id, { status: "canceled", error: "Unsubscribed before this went out.", attempts: row.attempts });
      else if (!content) outcomes.set(row.id, { status: "canceled", error: "The email this belonged to was deleted or didn't load.", attempts: row.attempts });
      else if (blocker) outcomes.set(row.id, { status: row.attempts >= MAX_ATTEMPTS ? "failed" : "queued", error: blocker, attempts: row.attempts });
      else batch.push({ row, email: compose(s, s.from!, content, { sendId: row.id, email: row.email, name: row.name, kind: row.kind }, prepared.offers.get(row.email) ?? null) });
    }

    if (batch.length) {
      const key = `bison/${createHash("sha256").update(batch.map((b) => `${b.row.id}:${b.row.attempts}`).join(",")).digest("hex").slice(0, 40)}`;
      const results = await deliver(provider, batch.map((b) => b.email), key);
      batch.forEach((b, i) => {
        const r = results[i] ?? { ok: false, error: "No answer from the provider.", retry: true };
        if (r.ok) outcomes.set(b.row.id, { status: "sent", providerId: r.providerId, attempts: b.row.attempts });
        else outcomes.set(b.row.id, { status: r.retry && b.row.attempts < MAX_ATTEMPTS ? "queued" : "failed", error: r.error, attempts: b.row.attempts });
      });
    }

    await withTenant(
      { tenantId },
      async (tx) => {
        for (const [id, o] of outcomes) {
          if (o.status === "sent") {
            await tx.updateTable("email_sends").set({ status: "sent", provider_id: o.providerId ?? null, sent_at: new Date(), error: null, locked_until: null }).where("id", "=", id).where("status", "=", "sending").execute();
            result.sent++;
          } else if (o.status === "queued") {
            // Wait longer after each try: 2, 4, then 8 minutes.
            await tx.updateTable("email_sends").set({ status: "queued", error: o.error?.slice(0, 500) ?? null, locked_until: null, next_attempt_at: new Date(Date.now() + 2 ** o.attempts * 60_000) }).where("id", "=", id).execute();
          } else {
            await tx.updateTable("email_sends").set({ status: o.status, error: o.error?.slice(0, 500) ?? null, locked_until: null }).where("id", "=", id).execute();
            if (o.status === "failed") result.failed++;
          }
        }
      },
      database,
    );
    // Stay under the provider's rate limit between batches.
    if (rows.length === BATCH) await new Promise((r) => setTimeout(r, 400));
  }
}

// ---- 4. Newsletters that are done ------------------------------------------------------

async function finishNewsletters(tenantId: string, database: Database, result: WorkResult) {
  await withTenant(
    { tenantId },
    async (tx) => {
      const done = await tx
        .updateTable("newsletters")
        .set({ status: "sent", sent_at: new Date() })
        .where("status", "=", "sending")
        .where((eb) => eb.not(eb.exists(eb.selectFrom("email_sends as e").select("e.id").whereRef("e.newsletter_id", "=", "newsletters.id").where("e.status", "in", ["queued", "sending"]))))
        .returning("id")
        .execute();
      result.finished += done.length;
    },
    database,
  );
}

// ---- The job -----------------------------------------------------------------------------

async function hasMarketing(tenantId: string, database: Database): Promise<boolean> {
  return withTenant({ tenantId }, async (tx) => can({ access: await loadAccess(tx) }, "marketing.newsletters"), database);
}

export async function workTenant(tenantId: string, opts: { deadline: number; database?: Database }, result: WorkResult = empty()): Promise<WorkResult> {
  const database = opts.database ?? db();
  // Without Marketing nothing goes out; it all waits (and goes stale) until it's back.
  if (!(await hasMarketing(tenantId, database))) return result;
  result.tenants++;
  await startDueNewsletters(tenantId, database, result);
  await advanceRuns(tenantId, database, result);
  await sendQueued(tenantId, database, opts.deadline, result);
  await finishNewsletters(tenantId, database, result);
  return result;
}

/** Runs the job for one company, or every company with something due. */
export async function runEmailWork(opts: { tenantId?: string; budgetMs?: number; database?: Database } = {}): Promise<WorkResult> {
  const database = opts.database ?? db();
  const deadline = Date.now() + (opts.budgetMs ?? 50_000);
  const result = empty();
  const tenants = opts.tenantId ? [opts.tenantId] : (await sql<{ id: string }>`select due_marketing_tenants(200) as id`.execute(database)).rows.map((r) => r.id);
  for (const tenantId of tenants) {
    if (Date.now() > deadline) break;
    try {
      await workTenant(tenantId, { deadline, database }, result);
    } catch (err) {
      console.error("email job failed for a tenant", tenantId, err);
    }
  }
  if (!opts.tenantId) {
    await sql`insert into worker_runs (name, last_run_at, last_result) values ('email', now(), ${JSON.stringify(result)}::jsonb)
      on conflict (name) do update set last_run_at = now(), last_result = excluded.last_result`.execute(database);
  }
  return result;
}

/** When the email job last ran on its schedule, so screens can say if scheduled sends will be late. */
export async function lastEmailRun(database: Database = db()): Promise<Date | null> {
  const row = await database.selectFrom("worker_runs").select("last_run_at").where("name", "=", "email").executeTakeFirst();
  return row?.last_run_at ?? null;
}
