import "server-only";
// The agents at work. `runAgents` looks at the company's own records and drafts
// anything new (each lead, cart, estimate, page, week or month once), and
// closes drafts that aren't needed anymore. Approving does the work: sends the
// email, makes the newsletter draft or the campaign. Nothing reaches a
// customer without someone on the team approving it.
import { sql } from "kysely";
import type { EditionKey } from "@/config/editions";
import { can, loadAccess } from "@/lib/access/entitlements";
import { audit } from "@/lib/audit";
import { createCampaign } from "@/lib/campaigns/store";
import { isUuid, type Tx } from "@/lib/db";
import type { AgentKey, AgentTaskStatus } from "@/lib/db/types";
import { emailTemplatesFor } from "@/lib/email/templates";
import { appUrl } from "@/lib/env";
import { getMarketingSettings, tenantInfo } from "@/lib/marketing/store";
import { findPlaceholders, pageDocSchema } from "@/lib/pages/schema";
import { estimateUrl } from "@/lib/sales/estimates";
import { type Delivery } from "@/lib/sales/types";
import { NO_SENDER, plainEmail, salesSender, type Sender, sendOne } from "@/lib/sales/emails";
import { type CampaignDraft, campaignPlan, cartNudge, type EmailDraft, estimateNudge, leadReply, type LinkDraft, type NewsletterDraft, type ReadDraft, weeklyRead } from "./drafts";
import { isTaskKind, KINDS, type TaskKind, type WeekNumbers } from "./roster";

export class AgentError extends Error {}

export type Task = { id: string; agent: AgentKey; kind: TaskKind; title: string; summary: string; draft: Record<string, unknown>; status: AgentTaskStatus; result: string; decidedBy: string; createdAt: Date; decidedAt: Date | null };

const DAY = 86_400_000;

/** Monday of this week, as a date, for things drafted once a week. */
export function weekRef(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// ---- The week in numbers ----------------------------------------------------------

/** The last 7 days and the 7 before them: visitors, new leads, check-ins and joins. */
export async function weekNumbers(tx: Tx, now = new Date()): Promise<{ week: WeekNumbers; before: WeekNumbers }> {
  const a = new Date(now.getTime() - 7 * DAY);
  const b = new Date(now.getTime() - 14 * DAY);
  const { rows } = await sql<{ w: string; v: string; l: string; c: string; j: string }>`
    select 'week' as w,
      (select count(distinct (visitor_hash, occurred_at::date)) from events where type = 'pageview' and occurred_at >= ${a}) as v,
      (select count(*) from contacts where first_seen_at >= ${a} and status <> 'spam') as l,
      (select count(*) from kiosk_check_ins where checked_in_at >= ${a}) as c,
      (select count(*) from orders where status <> 'canceled' and created_at >= ${a}) as j
    union all
    select 'before',
      (select count(distinct (visitor_hash, occurred_at::date)) from events where type = 'pageview' and occurred_at >= ${b} and occurred_at < ${a}),
      (select count(*) from contacts where first_seen_at >= ${b} and first_seen_at < ${a} and status <> 'spam'),
      (select count(*) from kiosk_check_ins where checked_in_at >= ${b} and checked_in_at < ${a}),
      (select count(*) from orders where status <> 'canceled' and created_at >= ${b} and created_at < ${a})`.execute(tx);
  const read = (w: string): WeekNumbers => {
    const r = rows.find((x) => x.w === w);
    return { visitors: Number(r?.v ?? 0), leads: Number(r?.l ?? 0), checkIns: Number(r?.c ?? 0), joins: Number(r?.j ?? 0) };
  };
  return { week: read("week"), before: read("before") };
}

// ---- Finding work ----------------------------------------------------------------

type New = { kind: TaskKind; ref: string; title: string; summary: string; draft: object };

async function add(tx: Tx, t: New): Promise<boolean> {
  const r = await tx
    .insertInto("agent_tasks")
    .values({ agent: KINDS[t.kind].agent, kind: t.kind, ref: t.ref.slice(0, 120), title: t.title.slice(0, 160), summary: t.summary.slice(0, 2000), draft: JSON.stringify(t.draft) })
    .onConflict((oc) => oc.columns(["tenant_id", "kind", "ref"]).doNothing())
    .returning("id")
    .executeTakeFirst();
  return Boolean(r);
}

/** Closes open drafts whose reason is gone, like a lead someone already answered. */
async function close(tx: Tx, kind: TaskKind, stillNeeded: string[], result: string) {
  let q = tx.updateTable("agent_tasks").set({ status: "dismissed", result, decided_by: "The agent", decided_at: new Date() }).where("kind", "=", kind).where("status", "=", "open");
  if (stillNeeded.length) q = q.where("ref", "not in", stillNeeded);
  await q.execute();
}

export async function runAgents(tx: Tx, edition: EditionKey, now = new Date()): Promise<number> {
  const access = { access: await loadAccess(tx) };
  const info = await tenantInfo(tx);
  const brand = (await getMarketingSettings(tx, info)).brand;
  const club = brand.businessName || info.name;
  const on = (k: TaskKind) => can(access, KINDS[k].feature) && (k !== "kiosk-quiet" || edition === "fit");
  let added = 0;

  if (on("lead-reply")) {
    const leads = await sql<{ id: string; name: string; email: string; form_type: string | null; fields: Record<string, string> | null }>`
      select c.id, c.name, c.email, s.form_type, s.fields from contacts c
      left join lateral (select form_type, fields from submissions where contact_id = c.id and status = 'received' order by created_at desc limit 1) s on true
      where c.status = 'new' and c.first_seen_at >= ${new Date(now.getTime() - 14 * DAY)}
      order by c.first_seen_at desc limit 25`.execute(tx);
    for (const l of leads.rows) {
      const draft = leadReply(edition, club, { name: l.name, email: l.email, formType: l.form_type, fields: l.fields ?? {} });
      if (await add(tx, { kind: "lead-reply", ref: l.id, title: `Write back to ${l.name || l.email}`, summary: l.form_type === "kiosk-pass" ? "Claimed a free pass at the front desk." : l.form_type === "kiosk-tour" ? "Asked for a tour at the front desk." : "Sent a form and hasn't heard back yet.", draft: { ...draft, contactId: l.id } })) added++;
    }
    const open = await tx.selectFrom("contacts").select("id").where("status", "=", "new").execute();
    await close(tx, "lead-reply", open.map((o) => o.id), "Someone already got back to them.");
  }

  if (on("kiosk-quiet")) {
    const quiet = await tx.selectFrom("kiosk_devices").select(["id", "name", "last_seen_at"]).where("revoked_at", "is", null).where("last_seen_at", "<", new Date(now.getTime() - DAY)).execute();
    for (const d of quiet) {
      const draft: LinkDraft = { href: "/settings/kiosk", label: "Kiosk settings" };
      if (await add(tx, { kind: "kiosk-quiet", ref: `${d.id}:${d.last_seen_at.toISOString().slice(0, 10)}`, title: `${d.name} has been off for a day`, summary: "The kiosk tablet hasn't checked in since yesterday. Check it's on, charged and on the Wi-Fi.", draft })) added++;
    }
  }

  if (on("cart-nudge")) {
    const carts = await sql<{ id: string; email: string; name: string; item: string | null }>`
      select id, email, name, items -> 0 ->> 'name' as item from carts
      where status = 'abandoned' and email is not null and abandoned_at >= ${new Date(now.getTime() - 14 * DAY)}
      order by abandoned_at desc limit 25`.execute(tx);
    for (const c of carts.rows) {
      const draft = cartNudge(edition, club, { email: c.email, name: c.name, item: c.item, shopUrl: `${appUrl()}/p/${info.slug}/shop` });
      if (await add(tx, { kind: "cart-nudge", ref: c.id, title: edition === "fit" ? `Nudge ${c.name || c.email} to finish joining` : `Nudge ${c.name || c.email} about their cart`, summary: c.item ? `Left ${c.item} behind.` : "Left without finishing.", draft: { ...draft, cartId: c.id } })) added++;
    }
    const still = await tx.selectFrom("carts").select("id").where("status", "=", "abandoned").execute();
    await close(tx, "cart-nudge", still.map((c) => c.id), edition === "fit" ? "They finished joining." : "They came back and bought.");
  }

  if (on("estimate-nudge")) {
    const quiet = await tx.selectFrom("estimates").select(["id", "number", "title", "client", "link_version", "sent_at"]).where("status", "in", ["sent", "viewed"]).where("sent_at", "<", new Date(now.getTime() - 5 * DAY)).where("sent_at", ">", new Date(now.getTime() - 60 * DAY)).limit(25).execute();
    for (const e of quiet) {
      const client = (e.client ?? {}) as { name?: string; email?: string };
      if (!client.email) continue;
      const draft = estimateNudge(edition, club, { email: client.email, name: client.name ?? "", number: e.number, title: e.title, url: estimateUrl(e.id, e.link_version) });
      if (await add(tx, { kind: "estimate-nudge", ref: `${e.id}:v${e.link_version}`, title: `Follow up on ${edition === "fit" ? "quote" : "estimate"} #${e.number}`, summary: `Sent ${Math.round((now.getTime() - (e.sent_at?.getTime() ?? now.getTime())) / DAY)} days ago with no answer yet.`, draft })) added++;
    }
    const still = await tx.selectFrom("estimates").select(["id", "link_version"]).where("status", "in", ["sent", "viewed"]).execute();
    await close(tx, "estimate-nudge", still.map((e) => `${e.id}:v${e.link_version}`), "They answered, or it was changed.");
  }

  if (on("fill-placeholders")) {
    const pages = await tx.selectFrom("pages").select(["id", "title", "doc"]).execute();
    const unfinished: string[] = [];
    for (const p of pages) {
      const parsed = pageDocSchema.safeParse(typeof p.doc === "string" ? JSON.parse(p.doc) : p.doc);
      const n = parsed.success ? findPlaceholders(parsed.data).length : 0;
      if (!n) continue;
      unfinished.push(p.id);
      const draft: LinkDraft = { href: `/marketing/pages/${p.id}`, label: "Open the page" };
      if (await add(tx, { kind: "fill-placeholders", ref: p.id, title: `Finish ${p.title}`, summary: `${n} ${n === 1 ? "spot" : "spots"} still say [Add ...]. Fill them in so it can go live.`, draft })) added++;
    }
    await close(tx, "fill-placeholders", unfinished, "All filled in.");
  }

  if (on("newsletter-draft")) {
    const recent = await tx.selectFrom("newsletters").select("id").where((eb) => eb.or([eb("created_at", ">=", new Date(now.getTime() - 7 * DAY)), eb("sent_at", ">=", new Date(now.getTime() - 21 * DAY)), eb("status", "=", "scheduled")])).limit(1).executeTakeFirst();
    const subscribers = await tx.selectFrom("subscribers").select(sql<string>`count(*)`.as("n")).where("status", "=", "subscribed").executeTakeFirstOrThrow();
    if (!recent && Number(subscribers.n) > 0) {
      const t = emailTemplatesFor(edition)[0];
      const draft: NewsletterDraft = { subject: t.subject.replace("{business name}", club), template: t.key };
      if (await add(tx, { kind: "newsletter-draft", ref: weekRef(now), title: "Time for a newsletter", summary: `It's been 3 weeks or more since the last one, and ${Number(subscribers.n)} people are on your list. I'll start a "${t.name}" draft for you to finish.`, draft })) added++;
    }
  }

  if (on("campaign-plan")) {
    const today = now.toISOString().slice(0, 10);
    const active = await tx.selectFrom("campaigns").select("id").where("archived_at", "is", null).where((eb) => eb.or([eb("ends_on", "is", null), eb("ends_on", ">=", today)])).limit(1).executeTakeFirst();
    const plan = campaignPlan(edition, now);
    if (!active && (await add(tx, { kind: "campaign-plan", ref: plan.startsOn.slice(0, 7), title: `Plan: ${plan.name}`, summary: "Nothing's running right now. Here's a campaign to get going, with what to make for it.", draft: plan }))) added++;
    if (active) await close(tx, "campaign-plan", [], "A campaign is running.");
  }

  if (on("weekly-read")) {
    const ref = weekRef(now);
    const exists = await tx.selectFrom("agent_tasks").select("id").where("kind", "=", "weekly-read").where("ref", "=", ref).executeTakeFirst();
    if (!exists) {
      const { week, before } = await weekNumbers(tx, now);
      const open = await tx.selectFrom("agent_tasks").select(["kind", sql<string>`count(*)`.as("n")]).where("status", "=", "open").groupBy("kind").execute();
      const read: ReadDraft = weeklyRead(edition, week, before, open.map((o) => ({ kind: o.kind, count: Number(o.n) })));
      if (await add(tx, { kind: "weekly-read", ref, title: "Your week in numbers", summary: read.lines[0] ?? "", draft: read })) added++;
      // Last week's read is done once this one arrives.
      await close(tx, "weekly-read", [ref], "A newer read is here.");
    }
  }

  return added;
}

// ---- Reading -----------------------------------------------------------------------

const toTask = (r: { id: string; agent: AgentKey; kind: string; title: string; summary: string; draft: unknown; status: AgentTaskStatus; result: string; decided_by: string; created_at: Date; decided_at: Date | null }): Task => ({
  id: r.id,
  agent: r.agent,
  kind: (isTaskKind(r.kind) ? r.kind : "weekly-read") as TaskKind,
  title: r.title,
  summary: r.summary,
  draft: (typeof r.draft === "string" ? JSON.parse(r.draft) : r.draft) as Record<string, unknown>,
  status: r.status,
  result: r.result,
  decidedBy: r.decided_by,
  createdAt: r.created_at,
  decidedAt: r.decided_at,
});

const COLS = ["id", "agent", "kind", "title", "summary", "draft", "status", "result", "decided_by", "created_at", "decided_at"] as const;

export async function listTasks(tx: Tx): Promise<{ open: Task[]; done: Task[] }> {
  const open = await tx.selectFrom("agent_tasks").select(COLS).where("status", "=", "open").orderBy("created_at", "desc").limit(200).execute();
  const done = await tx.selectFrom("agent_tasks").select(COLS).where("status", "<>", "open").orderBy("decided_at", "desc").limit(30).execute();
  return { open: open.map(toTask), done: done.map(toTask) };
}

export async function openCounts(tx: Tx): Promise<Record<AgentKey, number>> {
  const rows = await tx.selectFrom("agent_tasks").select(["agent", sql<string>`count(*)`.as("n")]).where("status", "=", "open").groupBy("agent").execute();
  const out: Record<AgentKey, number> = { frontdesk: 0, memberships: 0, marketing: 0, coach: 0 };
  for (const r of rows) out[r.agent] = Number(r.n);
  return out;
}

// ---- Deciding ----------------------------------------------------------------------

/** The task, locked, if it's still open. */
async function openTask(tx: Tx, id: string): Promise<Task> {
  if (!isUuid(id)) throw new AgentError("That isn't here anymore. Reload the page.");
  const r = await tx.selectFrom("agent_tasks").select(COLS).where("id", "=", id).forUpdate().executeTakeFirst();
  if (!r) throw new AgentError("That isn't here anymore. Reload the page.");
  if (r.status !== "open") throw new AgentError("Someone already handled this one.");
  return toTask(r);
}

async function finish(tx: Tx, id: string, status: AgentTaskStatus, result: string, actor: string) {
  await tx.updateTable("agent_tasks").set({ status, result: result.slice(0, 1000), decided_by: actor.slice(0, 120), decided_at: new Date() }).where("id", "=", id).execute();
}

export async function dismissTask(tx: Tx, id: string, actor: string): Promise<void> {
  await openTask(tx, id);
  await finish(tx, id, "dismissed", "Dismissed.", actor);
  await audit(tx, { action: "agent.dismissed", targetType: "agent_task", targetId: id });
}

export type Edits = { subject?: string; body?: string; name?: string };

/** Step one of approving an email: the checked draft and who it comes from. Sending happens outside any transaction. */
export async function prepareEmail(tx: Tx, id: string, edits: Edits): Promise<{ task: Task; email: EmailDraft; sender: Sender | null }> {
  const task = await openTask(tx, id);
  if (!KINDS[task.kind].email) throw new AgentError("That isn't an email.");
  // Claimed while it sends, so two people approving at once can't send it twice.
  const claim = await tx.updateTable("agent_tasks").set({ result: "Sending" }).where("id", "=", id).where((eb) => eb.or([eb("result", "<>", "Sending"), eb("updated_at", "<", new Date(Date.now() - 2 * 60_000))])).executeTakeFirst();
  if (!Number(claim.numUpdatedRows)) throw new AgentError("Someone is sending this one right now.");
  const d = task.draft as unknown as EmailDraft;
  const subject = (edits.subject ?? d.subject).replace(/\s+/g, " ").trim().slice(0, 150);
  const body = (edits.body ?? d.body).replace(/\r\n/g, "\n").trim().slice(0, 5000);
  if (!subject) throw new AgentError("Give the email a subject.");
  if (body.length < 10) throw new AgentError("The email is empty. Write a few words, or dismiss it.");
  if (/\[Add [^\]]*\]/.test(`${subject} ${body}`)) throw new AgentError("Fill in anything marked [Add ...] first.");
  return { task, email: { ...d, subject, body }, sender: await salesSender(tx) };
}

export async function sendEmailDraft(prepared: { task: Task; email: EmailDraft; sender: Sender | null }): Promise<Delivery> {
  const { task, email, sender } = prepared;
  if (!sender) return { to: [email.to], at: new Date().toISOString(), error: NO_SENDER };
  const out = plainEmail(sender, email.subject, email.body, email.button);
  return sendOne(sender, { to: email.to, subject: out.subject, html: out.html, text: out.text, replyTo: sender.brand.replyTo || undefined, kind: `agent-${task.kind}`, ref: task.id }, `agent-${task.id}`);
}

/** Step two: record what happened, and mark the lead as contacted when it went. */
export async function recordEmail(tx: Tx, task: Task, delivery: Delivery, actor: string, opts: { sentElsewhere?: boolean } = {}): Promise<{ ok: boolean; message: string }> {
  const contactId = (task.draft as { contactId?: string }).contactId;
  if (delivery.error && !opts.sentElsewhere) {
    await tx.updateTable("agent_tasks").set({ result: "" }).where("id", "=", task.id).where("status", "=", "open").execute();
    await audit(tx, { action: "agent.send_failed", targetType: "agent_task", targetId: task.id, detail: { error: delivery.error } });
    return { ok: false, message: delivery.error };
  }
  if (contactId && isUuid(contactId)) await tx.updateTable("contacts").set({ status: "contacted", is_new: false }).where("id", "=", contactId).where("status", "=", "new").execute();
  const to = (task.draft as { to?: string }).to ?? "";
  const result = opts.sentElsewhere ? `Sent from your own email to ${to}.` : `Sent to ${to}.`;
  await finish(tx, task.id, "done", result, actor);
  await audit(tx, { action: "agent.approved", targetType: "agent_task", targetId: task.id, detail: { kind: task.kind } });
  return { ok: true, message: result };
}

/** Approves anything that isn't an email: makes the draft or campaign, or just marks it read. */
export async function approveTask(tx: Tx, id: string, edits: Edits, actor: string, edition: EditionKey): Promise<{ message: string; href?: string }> {
  const task = await openTask(tx, id);
  if (KINDS[task.kind].email) throw new AgentError("Send emails with Send it.");
  let message = "Done.";
  let href: string | undefined;
  if (task.kind === "newsletter-draft") {
    const d = task.draft as unknown as NewsletterDraft;
    const t = emailTemplatesFor(edition).find((x) => x.key === d.template) ?? emailTemplatesFor(edition)[0];
    const info = await tenantInfo(tx);
    const site = info.domain ? `https://${info.domain}` : appUrl();
    const subject = (edits.subject ?? d.subject).trim().slice(0, 150) || t.subject;
    const row = await tx.insertInto("newsletters").values({ subject, preheader: t.preheader, doc: JSON.stringify(t.doc(site)), created_by: actor }).returning("id").executeTakeFirstOrThrow();
    href = `/marketing/newsletters/${row.id}`;
    message = "Newsletter draft made. Finish it and send it from Newsletters.";
  } else if (task.kind === "campaign-plan") {
    const d = task.draft as unknown as CampaignDraft;
    const name = (edits.name ?? d.name).trim();
    const cid = await createCampaign(tx, { name, notes: `${d.notes}\n\nTo do:\n${d.steps.map((s) => `- ${s}`).join("\n")}`, color: "orange", startsOn: d.startsOn, endsOn: d.endsOn }, actor);
    href = `/marketing/campaigns/${cid}`;
    message = `Campaign made: ${name}.`;
  } else if (task.kind === "fill-placeholders" || task.kind === "kiosk-quiet") {
    href = (task.draft as unknown as LinkDraft).href;
    message = "Got it.";
  } else {
    message = "Got it.";
  }
  await finish(tx, task.id, "done", message, actor);
  await audit(tx, { action: "agent.approved", targetType: "agent_task", targetId: task.id, detail: { kind: task.kind } });
  return { message, href };
}
