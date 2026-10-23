import "server-only";
// What happens to a person, in one place, so every path (a landing page form, an
// import, the team, an unsubscribe link, a provider webhook) does it the same way.
// Every function takes a transaction that's already inside withTenant.
import { randomInt } from "node:crypto";
import { sql } from "kysely";
import { audit } from "@/lib/audit";
import type { Tx } from "@/lib/db";
import type { SequenceTrigger, SubscriberSource, UnsubscribeReason } from "@/lib/db/types";
import type { OfferSettings } from "./settings";

export const EMAIL_PATTERN = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

export type SignUpInput = {
  email: string;
  name?: string;
  kind?: string;
  source: SubscriberSource;
  detail?: string;
  listIds?: string[];
  /** Start "joined the list" series for people new to the list. On for signups; a choice on imports. */
  startSeries?: boolean;
  /** Issue the welcome offer. Only for people signing up themselves. */
  offer?: OfferSettings | null;
};

export type SignUpResult =
  | { ok: true; id: string; created: boolean; resubscribed: boolean }
  | { ok: false; reason: "suppressed"; since: Date };

/**
 * Adds someone to the list, or fills in what's missing for someone already on it.
 * People who sign up themselves come back onto the list even after unsubscribing;
 * the team and imports can't put back someone who asked to stop.
 */
export async function signUp(tx: Tx, input: SignUpInput): Promise<SignUpResult> {
  const email = input.email.trim().toLowerCase();
  const name = (input.name ?? "").trim().slice(0, 120);
  const kind = (input.kind ?? "").trim().slice(0, 40);
  const self = input.source === "page" || input.source === "form";

  const blocked = await tx.selectFrom("unsubscribes").select(["created_at", "reason"]).where("email", "=", email).executeTakeFirst();
  if (blocked && !self) return { ok: false, reason: "suppressed", since: blocked.created_at };

  const existing = await tx.selectFrom("subscribers").select(["id", "status"]).where("email", "=", email).executeTakeFirst();
  let id: string;
  let created = false;
  let resubscribed = false;

  if (!existing) {
    const row = await tx
      .insertInto("subscribers")
      .values({ email, name, kind, source: input.source, source_detail: (input.detail ?? "").slice(0, 120), status: "subscribed" })
      .returning("id")
      .executeTakeFirstOrThrow();
    id = row.id;
    created = true;
  } else {
    id = existing.id;
    resubscribed = existing.status !== "subscribed";
    await tx
      .updateTable("subscribers")
      .set({
        // A repeat signup fills in what's missing and never overwrites what's there.
        name: sql`coalesce(nullif(name, ''), ${name})`,
        kind: sql`coalesce(nullif(kind, ''), ${kind})`,
        ...(resubscribed ? { status: "subscribed" as const, subscribed_at: new Date(), unsubscribed_at: null } : {}),
      })
      .where("id", "=", id)
      .execute();
  }
  if (blocked) await tx.deleteFrom("unsubscribes").where("email", "=", email).execute();

  const lists = [...new Set(input.listIds ?? [])];
  if (lists.length) {
    await tx
      .insertInto("list_items")
      .values(lists.map((list_id) => ({ list_id, subscriber_id: id })))
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  if (created || resubscribed) {
    if (input.startSeries ?? self) await startSeries(tx, "joined", { email, name, subscriberId: id });
    if (self && input.offer?.on) await issueOfferCode(tx, { email, subscriberId: id }, input.offer);
  }
  return { ok: true, id, created, resubscribed };
}

/**
 * Puts someone on the do-not-email list: their subscription ends, every series
 * they're in stops, and anything queued for them is canceled.
 */
export async function unsubscribeEmail(tx: Tx, email: string, reason: UnsubscribeReason, detail = ""): Promise<{ already: boolean }> {
  const inserted = await tx
    .insertInto("unsubscribes")
    .values({ email, reason, detail: detail.slice(0, 300) })
    .onConflict((oc) => oc.columns(["tenant_id", "email"]).doNothing())
    .returning("id")
    .executeTakeFirst();
  const status = reason === "complaint" ? "complained" : reason === "bounce" || reason === "suppressed" ? "bounced" : "unsubscribed";
  await tx.updateTable("subscribers").set({ status, unsubscribed_at: new Date() }).where("email", "=", email).where("status", "=", "subscribed").execute();
  await tx.updateTable("sequence_runs").set({ status: "stopped", stopped_reason: "Unsubscribed", next_at: null }).where("email", "=", email).where("status", "=", "active").execute();
  await tx.updateTable("email_sends").set({ status: "canceled", error: "Unsubscribed before this went out." }).where("email", "=", email).where("status", "=", "queued").execute();
  if (inserted) await audit(tx, { action: "subscriber.unsubscribed", targetType: "email", targetId: email, detail: { reason } });
  return { already: !inserted };
}

/** Undoes an unsubscribe. Only for the person themselves, or the team undoing its own. */
export async function resubscribeEmail(tx: Tx, email: string, allowed: UnsubscribeReason[]): Promise<boolean> {
  const row = await tx.selectFrom("unsubscribes").select("reason").where("email", "=", email).executeTakeFirst();
  if (!row || !allowed.includes(row.reason)) return false;
  await tx.deleteFrom("unsubscribes").where("email", "=", email).execute();
  await tx.updateTable("subscribers").set({ status: "subscribed", unsubscribed_at: null }).where("email", "=", email).where("status", "=", "unsubscribed").execute();
  await audit(tx, { action: "subscriber.resubscribed", targetType: "email", targetId: email });
  return true;
}

export type Person = { email: string; name: string; subscriberId: string | null };

/**
 * Starts every series that's on for this trigger. People already in a series
 * (now or before) are skipped, as are people on the do-not-email list.
 */
export async function startSeries(tx: Tx, trigger: SequenceTrigger, person: Person, detail = ""): Promise<number> {
  const blocked = await tx.selectFrom("unsubscribes").select("id").where("email", "=", person.email).executeTakeFirst();
  if (blocked) return 0;
  let q = tx.selectFrom("sequences").select("id").where("trigger", "=", trigger).where("status", "=", "on");
  if (trigger === "form") q = q.where("trigger_detail", "=", detail);
  const sequences = await q.execute();
  let started = 0;
  for (const seq of sequences) {
    if (await startRun(tx, seq.id, person)) started++;
  }
  return started;
}

/** One person into one series, unless they've been in it before. */
export async function startRun(tx: Tx, sequenceId: string, person: Person, now = new Date()): Promise<boolean> {
  const first = await tx.selectFrom("sequence_steps").select("delay_days").where("sequence_id", "=", sequenceId).orderBy("delay_days").limit(1).executeTakeFirst();
  if (!first) return false;
  const row = await tx
    .insertInto("sequence_runs")
    .values({
      sequence_id: sequenceId,
      subscriber_id: person.subscriberId,
      email: person.email,
      name: person.name.slice(0, 120),
      started_at: now,
      next_at: new Date(now.getTime() + first.delay_days * 86_400_000),
    })
    .onConflict((oc) => oc.columns(["tenant_id", "sequence_id", "email"]).doNothing())
    .returning("id")
    .executeTakeFirst();
  return Boolean(row);
}

/** After steps change, points every active run at its next step under the new plan. */
export async function replanRuns(tx: Tx, sequenceId: string): Promise<void> {
  await sql`
    update sequence_runs r set
      next_at = case when nxt.d is null then null else r.started_at + make_interval(days => nxt.d) end,
      status = case when nxt.d is null then 'done' else r.status end
    from (
      select r2.id, (select min(s.delay_days) from sequence_steps s where s.sequence_id = r2.sequence_id and s.delay_days > r2.last_day) as d
      from sequence_runs r2 where r2.sequence_id = ${sequenceId} and r2.status = 'active'
    ) nxt
    where r.id = nxt.id`.execute(tx);
}

// ---- Welcome offer codes ----------------------------------------------------------

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeOfferCode(prefix: string): string {
  let tail = "";
  for (let i = 0; i < 6; i++) tail += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${prefix}-${tail}`;
}

/** One code per signup, ever. Returns the person's code, new or existing. */
export async function issueOfferCode(tx: Tx, person: { email: string; subscriberId: string | null }, offer: OfferSettings, now = new Date()): Promise<string | null> {
  const existing = await tx.selectFrom("offer_codes").select("code").where("email", "=", person.email).executeTakeFirst();
  if (existing) return existing.code;
  if (!offer.on) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeOfferCode(offer.prefix);
    const row = await tx
      .insertInto("offer_codes")
      .values({
        code,
        email: person.email,
        subscriber_id: person.subscriberId,
        discount_kind: offer.kind,
        discount: offer.value,
        expires_at: offer.days ? new Date(now.getTime() + offer.days * 86_400_000) : null,
      })
      .onConflict((oc) => oc.doNothing())
      .returning("code")
      .executeTakeFirst();
    if (row) return row.code;
    const again = await tx.selectFrom("offer_codes").select("code").where("email", "=", person.email).executeTakeFirst();
    if (again) return again.code;
  }
  return null;
}

// ---- Usage ----------------------------------------------------------------------------

const monthStart = sql<Date>`date_trunc('month', now() at time zone 'utc') at time zone 'utc'`;

/** Emails counted toward this month's plan limit: everything sent or waiting to send. */
export async function emailsThisMonth(tx: Tx): Promise<number> {
  const row = await tx
    .selectFrom("email_sends")
    .select(sql<number>`count(*)`.as("n"))
    .where("created_at", ">=", monthStart)
    .where("status", "not in", ["canceled", "failed"])
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

export async function subscriberCount(tx: Tx): Promise<number> {
  const row = await tx.selectFrom("subscribers").select(sql<number>`count(*)`.as("n")).where("status", "=", "subscribed").executeTakeFirstOrThrow();
  return Number(row.n);
}

// ---- Imports ----------------------------------------------------------------------------

export type ImportPerson = { email: string; name: string; kind: string };
export type ImportResult = { added: number; updated: number; skippedUnsubscribed: number; listed: number };

/**
 * Adds many people at once, in a few set-based queries rather than one per
 * person. Same rules as signUp: existing people only get missing details filled
 * in, and nobody on the do-not-email list comes back.
 */
export async function importPeople(tx: Tx, people: ImportPerson[], opts: { listId?: string | null; startSeries?: boolean; detail?: string }): Promise<ImportResult> {
  const byEmail = new Map<string, ImportPerson>();
  for (const p of people) if (!byEmail.has(p.email)) byEmail.set(p.email, p);
  const emails = [...byEmail.keys()];
  if (!emails.length) return { added: 0, updated: 0, skippedUnsubscribed: 0, listed: 0 };

  const blocked = new Set<string>();
  const existing = new Set<string>();
  for (let i = 0; i < emails.length; i += 1000) {
    const chunk = emails.slice(i, i + 1000);
    for (const u of await tx.selectFrom("unsubscribes").select("email").where("email", "in", chunk).execute()) blocked.add(u.email);
    for (const s of await tx.selectFrom("subscribers").select("email").where("email", "in", chunk).execute()) existing.add(s.email);
  }

  const fresh = emails.filter((e) => !blocked.has(e) && !existing.has(e));
  const known = emails.filter((e) => !blocked.has(e) && existing.has(e));
  const addedIds: { id: string; email: string; name: string }[] = [];
  for (let i = 0; i < fresh.length; i += 500) {
    const rows = fresh.slice(i, i + 500).map((email) => {
      const p = byEmail.get(email)!;
      return { email, name: p.name.slice(0, 120), kind: p.kind, source: "import" as const, source_detail: (opts.detail ?? "Imported").slice(0, 120) };
    });
    addedIds.push(...(await tx.insertInto("subscribers").values(rows).onConflict((oc) => oc.doNothing()).returning(["id", "email", "name"]).execute()));
  }
  for (let i = 0; i < known.length; i += 500) {
    const chunk = known.slice(i, i + 500).map((email) => byEmail.get(email)!);
    const values = sql.join(chunk.map((p) => sql`(${p.email}, ${p.name.slice(0, 120)}, ${p.kind})`));
    await sql`
      update subscribers s set name = coalesce(nullif(s.name, ''), v.name), kind = coalesce(nullif(s.kind, ''), v.kind)
      from (values ${values}) as v(email, name, kind)
      where s.email = v.email`.execute(tx);
  }

  let listed = 0;
  if (opts.listId) {
    const targets = [...fresh, ...known];
    for (let i = 0; i < targets.length; i += 1000) {
      const r = await sql`
        insert into list_items (list_id, subscriber_id)
        select ${opts.listId}::uuid, s.id from subscribers s where s.email = any(${targets.slice(i, i + 1000)}::text[])
        on conflict do nothing`.execute(tx);
      listed += Number(r.numAffectedRows ?? 0);
    }
  }

  if (opts.startSeries && addedIds.length) {
    const sequences = await tx.selectFrom("sequences").select("id").where("trigger", "=", "joined").where("status", "=", "on").execute();
    for (const seq of sequences) {
      const first = await tx.selectFrom("sequence_steps").select("delay_days").where("sequence_id", "=", seq.id).orderBy("delay_days").limit(1).executeTakeFirst();
      if (!first) continue;
      for (let i = 0; i < addedIds.length; i += 500) {
        const now = new Date();
        await tx
          .insertInto("sequence_runs")
          .values(addedIds.slice(i, i + 500).map((p) => ({ sequence_id: seq.id, subscriber_id: p.id, email: p.email, name: p.name, started_at: now, next_at: new Date(now.getTime() + first.delay_days * 86_400_000) })))
          .onConflict((oc) => oc.doNothing())
          .execute();
      }
    }
  }

  await audit(tx, { action: "subscribers.imported", detail: { added: addedIds.length, updated: known.length, skipped: blocked.size } });
  return { added: addedIds.length, updated: known.length, skippedUnsubscribed: blocked.size, listed };
}
