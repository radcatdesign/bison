import "server-only";
// Email series in the database: the starter welcome series every company
// gets, series and their steps for the screens, turning a series on and off,
// and starting one by hand for a list. Everything inside withTenant.
import { sql } from "kysely";
import { audit } from "@/lib/audit";
import { isUuid, type TenantScope, type Tx, withTenant } from "@/lib/db";
import type { SequenceTrigger } from "@/lib/db/types";
import { emailProblems } from "@/lib/email/ops";
import { EMAIL_DOC_VERSION, type EmailDoc } from "@/lib/email/schema";
import { checkContent, NewsletterInputError } from "./newsletters";
import { replanRuns } from "./people";
import { loadSendSetup, readDoc, sendBlocker } from "./send";
import { starterSeries } from "./starter";

export class SeriesInputError extends Error {}

export const MAX_STEPS = 12;

export const TRIGGERS: Record<SequenceTrigger, { label: string; note: string; ready: boolean }> = {
  joined: { label: "Someone joins your list", note: "From a signup form, or added by hand. Imports can start it too, if you tick the box.", ready: true },
  form: { label: "Someone sends a form", note: "Pick which form. They don't have to be on your list.", ready: true },
  estimate: { label: "Someone saves an estimate", note: "Starts once Sales is on and estimates are being saved.", ready: false },
  cart: { label: "Someone leaves a cart", note: "Starts once Sales is on and your shop is taking orders.", ready: false },
  manual: { label: "You start it for a list", note: "Nothing starts it on its own. Press Start and pick who.", ready: true },
};

export function isTrigger(v: unknown): v is SequenceTrigger {
  return typeof v === "string" && v in TRIGGERS;
}

/** Creates the starter welcome series once per company, turned off. Safe to call on every visit. */
export async function ensureStarterSeries(tx: Tx, site: string | undefined): Promise<void> {
  const existing = await tx.selectFrom("sequences").select("id").where("starter", "=", true).executeTakeFirst();
  if (existing) return;
  const starter = starterSeries(site);
  const row = await tx
    .insertInto("sequences")
    .values({ name: starter.name, trigger: "joined", status: "off", starter: true })
    .onConflict((oc) => oc.doNothing())
    .returning("id")
    .executeTakeFirst();
  if (!row) return;
  await tx
    .insertInto("sequence_steps")
    .values(starter.steps.map((s) => ({ sequence_id: row.id, delay_days: s.delayDays, subject: s.subject, preheader: s.preheader, doc: JSON.stringify(s.doc) })))
    .execute();
}

export type StepSummary = { id: string; delayDays: number; subject: string; preheader: string; doc: EmailDoc; problems: number; sent: number };
export type SeriesSummary = {
  id: string;
  name: string;
  trigger: SequenceTrigger;
  triggerDetail: string;
  status: "on" | "off";
  starter: boolean;
  steps: StepSummary[];
  active: number;
  done: number;
  stopped: number;
};

async function readSeries(tx: Tx, only?: string): Promise<SeriesSummary[]> {
  let q = tx.selectFrom("sequences").select(["id", "name", "trigger", "trigger_detail", "status", "starter", "created_at"]).orderBy("starter", "desc").orderBy("created_at");
  if (only) q = q.where("id", "=", only);
  const rows = await q.execute();
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const steps = await tx.selectFrom("sequence_steps").select(["id", "sequence_id", "delay_days", "subject", "preheader", "doc"]).where("sequence_id", "in", ids).orderBy("delay_days").execute();
  const { rows: runs } = await sql<{ sequence_id: string; status: string; n: number }>`select sequence_id, status, count(*)::int as n from sequence_runs where sequence_id = any(${ids}::uuid[]) group by sequence_id, status`.execute(tx);
  const { rows: sent } = await sql<{ step_id: string; n: number }>`select step_id, count(*)::int as n from email_sends where kind = 'series' and step_id is not null and status in ('sent', 'delivered', 'bounced', 'complained') and sequence_id = any(${ids}::uuid[]) group by step_id`.execute(tx);
  const sentBy = new Map(sent.map((x) => [x.step_id, x.n]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    trigger: r.trigger,
    triggerDetail: r.trigger_detail,
    status: r.status,
    starter: r.starter,
    steps: steps
      .filter((s) => s.sequence_id === r.id)
      .flatMap((s) => {
        const doc = readDoc(s.doc);
        return doc ? [{ id: s.id, delayDays: s.delay_days, subject: s.subject, preheader: s.preheader, doc, problems: emailProblems(doc, s.subject, s.preheader).length, sent: sentBy.get(s.id) ?? 0 }] : [];
      }),
    active: runs.find((x) => x.sequence_id === r.id && x.status === "active")?.n ?? 0,
    done: runs.find((x) => x.sequence_id === r.id && x.status === "done")?.n ?? 0,
    stopped: runs.find((x) => x.sequence_id === r.id && x.status === "stopped")?.n ?? 0,
  }));
}

export async function listSeries(scope: TenantScope, site: string | undefined): Promise<SeriesSummary[]> {
  return withTenant(scope, async (tx) => {
    await ensureStarterSeries(tx, site);
    return readSeries(tx);
  });
}

export async function getSeries(scope: TenantScope, id: string): Promise<SeriesSummary | null> {
  if (!isUuid(id)) return null;
  return withTenant(scope, async (tx) => (await readSeries(tx, id))[0] ?? null);
}

export async function createSeries(scope: TenantScope, input: { name: string; trigger: SequenceTrigger; detail: string }): Promise<string> {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new SeriesInputError("Give the series a name.");
  return withTenant(scope, async (tx) => {
    const { n } = await tx.selectFrom("sequences").select(sql<number>`count(*)::int`.as("n")).executeTakeFirstOrThrow();
    if (n >= 30) throw new SeriesInputError("You have 30 series. Delete one you don't use first.");
    const row = await tx.insertInto("sequences").values({ name, trigger: input.trigger, trigger_detail: input.trigger === "form" ? input.detail.slice(0, 120) : "" }).returning("id").executeTakeFirstOrThrow();
    await tx
      .insertInto("sequence_steps")
      .values({
        sequence_id: row.id,
        delay_days: 0,
        subject: "[Add a subject]",
        preheader: "",
        doc: JSON.stringify({ version: EMAIL_DOC_VERSION, signOff: true, fallbackName: "there", sections: [{ id: "note", type: "text", body: "Hi {first name},\n\n[Add what this first email says.]", align: "left" }] }),
      })
      .execute();
    await audit(tx, { action: "series.created", targetType: "series", targetId: row.id });
    return row.id;
  });
}

export async function updateSeries(scope: TenantScope, id: string, input: { name: string; trigger: SequenceTrigger; detail: string }): Promise<void> {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new SeriesInputError("Give the series a name.");
  if (input.trigger === "form" && !input.detail) throw new SeriesInputError("Pick which form starts it.");
  await withTenant(scope, (tx) => tx.updateTable("sequences").set({ name, trigger: input.trigger, trigger_detail: input.trigger === "form" ? input.detail.slice(0, 120) : "" }).where("id", "=", id).execute());
}

/**
 * On starts it for new people; Off pauses it. Pausing doesn't lose anyone's
 * place: when it comes back on, everyone's schedule moves by however long it
 * was off, so nobody gets several emails at once.
 */
export async function setSeriesStatus(scope: TenantScope, id: string, on: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isUuid(id)) return { ok: false, message: "That series doesn't exist." };
  return withTenant(scope, async (tx) => {
    const seq = await tx.selectFrom("sequences").select(["status", "paused_at", "trigger", "trigger_detail"]).where("id", "=", id).forUpdate().executeTakeFirst();
    if (!seq) return { ok: false as const, message: "That series doesn't exist." };
    if (on) {
      if (seq.trigger === "form" && !seq.trigger_detail) return { ok: false as const, message: "Pick which form starts this series first." };
      const steps = await tx.selectFrom("sequence_steps").select(["doc", "subject", "preheader", "delay_days"]).where("sequence_id", "=", id).orderBy("delay_days").execute();
      if (!steps.length) return { ok: false as const, message: "Add an email to the series first." };
      for (const s of steps) {
        const doc = readDoc(s.doc);
        const problems = doc ? emailProblems(doc, s.subject, s.preheader) : [{ sectionId: null, text: "It didn't load." }];
        if (problems.length) return { ok: false as const, message: `The day ${s.delay_days} email isn't ready: ${problems[0].text}` };
      }
      const blocker = sendBlocker(await loadSendSetup(tx));
      if (blocker) return { ok: false as const, message: blocker };
      if (seq.status === "off" && seq.paused_at) {
        await sql`
          update sequence_runs set started_at = started_at + (now() - ${seq.paused_at}::timestamptz), next_at = next_at + (now() - ${seq.paused_at}::timestamptz)
          where sequence_id = ${id} and status = 'active'`.execute(tx);
      }
      await tx.updateTable("sequences").set({ status: "on", paused_at: null }).where("id", "=", id).execute();
    } else if (seq.status === "on") {
      await tx.updateTable("sequences").set({ status: "off", paused_at: new Date() }).where("id", "=", id).execute();
    }
    await audit(tx, { action: on ? "series.on" : "series.off", targetType: "series", targetId: id });
    return { ok: true as const };
  });
}

export async function deleteSeries(scope: TenantScope, id: string): Promise<void> {
  if (!isUuid(id)) return;
  await withTenant(scope, async (tx) => {
    const r = await tx.deleteFrom("sequences").where("id", "=", id).where("starter", "=", false).returning("id").executeTakeFirst();
    if (!r) throw new SeriesInputError("The welcome series can be turned off, but not deleted.");
    await tx.updateTable("email_sends").set({ status: "canceled", error: "The series was deleted." }).where("sequence_id", "is", null).where("kind", "=", "series").where("status", "=", "queued").execute();
    await audit(tx, { action: "series.deleted", targetType: "series", targetId: id });
  });
}

// ---- Steps ----------------------------------------------------------------------------

export async function addStep(scope: TenantScope, seriesId: string, delayDays: number): Promise<string> {
  if (!isUuid(seriesId)) throw new SeriesInputError("That series doesn't exist.");
  const day = Math.round(delayDays);
  if (!Number.isFinite(day) || day < 0 || day > 365) throw new SeriesInputError("Pick a day from 0 to 365.");
  return withTenant(scope, async (tx) => {
    const { n } = await tx.selectFrom("sequence_steps").select(sql<number>`count(*)::int`.as("n")).where("sequence_id", "=", seriesId).executeTakeFirstOrThrow();
    if (n >= MAX_STEPS) throw new SeriesInputError(`A series can have up to ${MAX_STEPS} emails.`);
    try {
      const row = await tx
        .insertInto("sequence_steps")
        .values({ sequence_id: seriesId, delay_days: day, subject: "[Add a subject]", preheader: "", doc: JSON.stringify({ version: EMAIL_DOC_VERSION, signOff: true, fallbackName: "there", sections: [{ id: "note", type: "text", body: "Hi {first name},\n\n[Add what this email says.]", align: "left" }] }) })
        .returning("id")
        .executeTakeFirstOrThrow();
      await replanRuns(tx, seriesId);
      return row.id;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw new SeriesInputError(`There's already an email on day ${day}. Pick another day.`);
      throw err;
    }
  });
}

export async function getStep(scope: TenantScope, stepId: string): Promise<(StepSummary & { seriesId: string; seriesName: string; seriesStatus: "on" | "off" }) | null> {
  if (!isUuid(stepId)) return null;
  return withTenant(scope, async (tx) => {
    const s = await tx
      .selectFrom("sequence_steps as s")
      .innerJoin("sequences as q", (j) => j.onRef("q.id", "=", "s.sequence_id").onRef("q.tenant_id", "=", "s.tenant_id"))
      .select(["s.id", "s.delay_days", "s.subject", "s.preheader", "s.doc", "q.id as series_id", "q.name", "q.status"])
      .where("s.id", "=", stepId)
      .executeTakeFirst();
    if (!s) return null;
    const doc = readDoc(s.doc);
    if (!doc) return null;
    return { id: s.id, delayDays: s.delay_days, subject: s.subject, preheader: s.preheader, doc, problems: emailProblems(doc, s.subject, s.preheader).length, sent: 0, seriesId: s.series_id, seriesName: s.name, seriesStatus: s.status };
  });
}

export async function saveStep(scope: TenantScope, stepId: string, input: { subject?: unknown; preheader?: unknown; doc?: unknown; delayDays?: unknown }): Promise<Date> {
  if (!isUuid(stepId)) throw new SeriesInputError("That email doesn't exist.");
  return withTenant(scope, async (tx) => {
    let content;
    try {
      content = await checkContent(tx, input);
    } catch (err) {
      throw new SeriesInputError(err instanceof NewsletterInputError ? err.message : "That email didn't load correctly.");
    }
    const step = await tx
      .selectFrom("sequence_steps as s")
      .innerJoin("sequences as q", (j) => j.onRef("q.id", "=", "s.sequence_id").onRef("q.tenant_id", "=", "s.tenant_id"))
      .select(["s.sequence_id", "s.delay_days", "q.status"])
      .where("s.id", "=", stepId)
      .executeTakeFirst();
    if (!step) throw new SeriesInputError("That email doesn't exist anymore.");
    // A series that's on keeps going out, so it can't take an email that isn't ready.
    if (step.status === "on" && emailProblems(content.doc, content.subject, content.preheader).length) {
      throw new SeriesInputError("This series is on, so this email has to stay ready to send. Fix what's flagged, or turn the series off first.");
    }
    const day = typeof input.delayDays === "number" ? Math.round(input.delayDays) : step.delay_days;
    if (day < 0 || day > 365) throw new SeriesInputError("Pick a day from 0 to 365.");
    try {
      const row = await tx
        .updateTable("sequence_steps")
        .set({ subject: content.subject, preheader: content.preheader, doc: JSON.stringify(content.doc), delay_days: day })
        .where("id", "=", stepId)
        .returning("updated_at")
        .executeTakeFirstOrThrow();
      if (day !== step.delay_days) await replanRuns(tx, step.sequence_id);
      return row.updated_at;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw new SeriesInputError(`There's already an email on day ${day}. Pick another day.`);
      throw err;
    }
  });
}

export async function deleteStep(scope: TenantScope, stepId: string): Promise<string | null> {
  if (!isUuid(stepId)) return null;
  return withTenant(scope, async (tx) => {
    const step = await tx
      .selectFrom("sequence_steps as s")
      .innerJoin("sequences as q", (j) => j.onRef("q.id", "=", "s.sequence_id").onRef("q.tenant_id", "=", "s.tenant_id"))
      .select(["s.sequence_id", "q.status"])
      .where("s.id", "=", stepId)
      .executeTakeFirst();
    if (!step) return null;
    const { n } = await tx.selectFrom("sequence_steps").select(sql<number>`count(*)::int`.as("n")).where("sequence_id", "=", step.sequence_id).executeTakeFirstOrThrow();
    if (n <= 1 && step.status === "on") throw new SeriesInputError("A series that's on needs at least one email. Turn it off first.");
    await tx.updateTable("email_sends").set({ status: "canceled", error: "That email was removed from the series." }).where("step_id", "=", stepId).where("status", "=", "queued").execute();
    await tx.deleteFrom("sequence_steps").where("id", "=", stepId).execute();
    await replanRuns(tx, step.sequence_id);
    return step.sequence_id;
  });
}

/** "Started by hand for a list": everyone subscribed on it who hasn't been in this series before. */
export async function startSeriesForList(scope: TenantScope, seriesId: string, listId: string | null): Promise<number> {
  if (!isUuid(seriesId)) throw new SeriesInputError("That series doesn't exist.");
  return withTenant(scope, async (tx) => {
    const seq = await tx.selectFrom("sequences").select(["status"]).where("id", "=", seriesId).executeTakeFirst();
    if (!seq) throw new SeriesInputError("That series doesn't exist.");
    if (seq.status !== "on") throw new SeriesInputError("Turn the series on first.");
    const first = await tx.selectFrom("sequence_steps").select("delay_days").where("sequence_id", "=", seriesId).orderBy("delay_days").limit(1).executeTakeFirst();
    if (!first) throw new SeriesInputError("Add an email to the series first.");
    if (listId && !isUuid(listId)) throw new SeriesInputError("Pick a list.");
    const r = await sql`
      insert into sequence_runs (sequence_id, subscriber_id, email, name, started_at, next_at)
      select ${seriesId}::uuid, s.id, s.email, s.name, now(), now() + make_interval(days => ${first.delay_days})
      from subscribers s
      where s.status = 'subscribed'
        and not exists (select 1 from unsubscribes u where u.email = s.email)
        and (${listId}::uuid is null or exists (select 1 from list_items li where li.subscriber_id = s.id and li.list_id = ${listId}::uuid))
      on conflict (tenant_id, sequence_id, email) do nothing`.execute(tx);
    const started = Number(r.numAffectedRows ?? 0);
    await audit(tx, { action: "series.started_by_hand", targetType: "series", targetId: seriesId, detail: { started } });
    return started;
  });
}

/** Forms a series can be started by: landing page forms, plus any form that has sent something. */
export async function formChoices(scope: TenantScope): Promise<{ value: string; label: string }[]> {
  return withTenant(scope, async (tx) => {
    const pages = await tx.selectFrom("pages").select(["slug", "title", "doc"]).execute();
    const seen = await tx.selectFrom("submissions").select(["form_key", "form_type"]).where("status", "=", "received").groupBy(["form_key", "form_type"]).limit(50).execute();
    const out = new Map<string, string>();
    for (const p of pages) {
      const doc = p.doc as { sections?: { type?: string }[] };
      if (doc?.sections?.some((s) => s.type === "form")) out.set(`page:${p.slug}`, `${p.title} (landing page)`);
    }
    for (const s of seen) if (!out.has(s.form_key)) out.set(s.form_key, s.form_type && s.form_type !== "general" ? `${s.form_type} (${s.form_key})` : s.form_key);
    return [...out].map(([value, label]) => ({ value, label }));
  });
}
