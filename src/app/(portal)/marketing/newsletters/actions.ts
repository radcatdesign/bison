"use server";

// Newsletter actions. Each one re-reads the session and checks the plan and
// role on the server. The demo keeps newsletters in the browser instead.
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { type Action, may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { isUuid, withTenant } from "@/lib/db";
import { DEMO_MESSAGE } from "@/lib/demo";
import { demoMode } from "@/lib/env";
import { emptyEmailDoc, parseEmailDoc } from "@/lib/email/schema";
import { findEmailTemplate } from "@/lib/email/templates";
import {
  cancelSchedule,
  checkContent,
  createNewsletter,
  deleteNewsletter,
  deleteTemplate,
  duplicateNewsletter,
  listTemplates,
  NewsletterInputError,
  saveNewsletter,
  saveTemplate,
  scheduleNewsletter,
} from "@/lib/marketing/newsletters";
import { sendTestEmail } from "@/lib/marketing/test-send";
import { runEmailWork } from "@/lib/marketing/worker";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";
import { formatWhen, zonedLocalToDate } from "@/lib/time";
import { earn } from "@/lib/progress/repo";
import { gainedLine } from "@/lib/progress/store";

export type NewsletterResult = { ok: boolean; message: string; savedAt?: string };

async function guard(action: Action): Promise<{ ctx: PortalContext; error: string | null }> {
  const ctx = await getPortalContext();
  if (!can(ctx.tenant, "marketing.newsletters")) return { ctx, error: "Newsletters are part of Marketing. Unlock Marketing to send them." };
  if (!may(ctx.member.role, action)) return { ctx, error: action === "email.send" ? "Your role can't send email." : "Your role can't change newsletters." };
  if (demoMode()) return { ctx, error: DEMO_MESSAGE };
  return { ctx, error: null };
}

function failed(err: unknown, fallback: string): NewsletterResult {
  if (err instanceof NewsletterInputError) return { ok: false, message: err.message };
  console.error(fallback, err);
  return { ok: false, message: fallback };
}

export async function createNewsletterAction(formData: FormData): Promise<void> {
  const { ctx, error } = await guard("marketing.edit");
  if (error) redirect(`/marketing/newsletters?error=${encodeURIComponent(error)}`);
  const site = ctx.sites[0]?.domain ? `https://${ctx.sites[0].domain}` : "https://example.com";
  const template = findEmailTemplate(formData.get("template"), ctx.tenant.edition);
  const savedId = formData.get("saved");
  let content = { subject: "", preheader: "", doc: emptyEmailDoc() };
  if (template) content = { subject: template.subject, preheader: template.preheader, doc: parseEmailDoc(template.doc(site)) };
  else if (typeof savedId === "string" && isUuid(savedId)) {
    const saved = (await listTemplates(scopeOf(ctx))).find((t) => t.id === savedId);
    if (saved) content = { subject: saved.subject, preheader: saved.preheader, doc: saved.doc };
  }
  const id = await createNewsletter(scopeOf(ctx), content, ctx.member.email);
  redirect(`/marketing/newsletters/${id}`);
}

export async function saveNewsletterAction(id: string, content: { subject: string; preheader: string; doc: unknown }): Promise<NewsletterResult> {
  const { ctx, error } = await guard("marketing.edit");
  if (error) return { ok: false, message: error };
  try {
    const savedAt = await saveNewsletter(scopeOf(ctx), id, content);
    return { ok: true, message: "Saved", savedAt: savedAt.toISOString() };
  } catch (err) {
    return failed(err, "Couldn't save. Check your connection; we'll keep trying.");
  }
}

export async function testNewsletterAction(id: string | null, content: { subject: string; preheader: string; doc: unknown }, to: string): Promise<NewsletterResult> {
  const { ctx, error } = await guard("marketing.edit");
  if (error) return { ok: false, message: error };
  try {
    const checked = await withTenant(scopeOf(ctx), (tx) => checkContent(tx, content));
    const r = await sendTestEmail(scopeOf(ctx), { ...checked, to, newsletterId: id && isUuid(id) ? id : null });
    if (r.ok) refresh();
    return r;
  } catch (err) {
    return failed(err, "Couldn't send the test. Try again.");
  }
}

export async function scheduleNewsletterAction(id: string, input: { when: string | null; audience: "all" | "list"; listId: string | null }): Promise<NewsletterResult> {
  const { ctx, error } = await guard("email.send");
  if (error) return { ok: false, message: error };
  if (!may(ctx.member.role, "marketing.edit")) return { ok: false, message: "Your role can't send newsletters." };
  let when: Date | null = null;
  if (input.when) {
    when = zonedLocalToDate(input.when, ctx.settings.timezone);
    if (!when) return { ok: false, message: "Pick a date and time." };
  }
  try {
    const r = await scheduleNewsletter(scopeOf(ctx), id, { when, audience: input.audience === "list" ? "list" : "all", listId: input.listId });
    if (!r.ok) return { ok: false, message: r.message };
    if (r.now) after(() => runEmailWork({ tenantId: ctx.tenant.id, budgetMs: 250_000 }).then(() => undefined));
    refresh();
    const people = `${r.recipients.toLocaleString("en-US")} ${r.recipients === 1 ? "person" : "people"}`;
    return { ok: true, message: r.now ? `Sending to ${people} now.${gainedLine(await earn(ctx))}` : `Scheduled for ${formatWhen(r.at, ctx.settings.timezone)}, to ${people}.` };
  } catch (err) {
    return failed(err, "Couldn't schedule it. Try again in a minute.");
  }
}

export async function cancelScheduleAction(id: string): Promise<NewsletterResult> {
  const { ctx, error } = await guard("email.send");
  if (error) return { ok: false, message: error };
  const ok = await cancelSchedule(scopeOf(ctx), id);
  refresh();
  return ok ? { ok: true, message: "Unscheduled. It's a draft again." } : { ok: false, message: "This isn't scheduled anymore. It may already be going out." };
}

export async function deleteNewsletterAction(id: string): Promise<NewsletterResult> {
  const { ctx, error } = await guard("marketing.edit");
  if (error) return { ok: false, message: error };
  try {
    await deleteNewsletter(scopeOf(ctx), id);
  } catch (err) {
    return failed(err, "Couldn't delete it. Try again.");
  }
  redirect("/marketing/newsletters");
}

export async function duplicateNewsletterAction(id: string): Promise<NewsletterResult> {
  const { ctx, error } = await guard("marketing.edit");
  if (error) return { ok: false, message: error };
  let copy: string;
  try {
    copy = await duplicateNewsletter(scopeOf(ctx), id, ctx.member.email);
  } catch (err) {
    return failed(err, "Couldn't duplicate it. Try again.");
  }
  redirect(`/marketing/newsletters/${copy}`);
}

export async function saveTemplateAction(name: string, content: { subject: string; preheader: string; doc: unknown }): Promise<NewsletterResult> {
  const { ctx, error } = await guard("marketing.edit");
  if (error) return { ok: false, message: error };
  try {
    await saveTemplate(scopeOf(ctx), String(name), content, ctx.member.email);
    refresh();
    return { ok: true, message: `Saved as a template. It's on the Newsletters page under Your templates.` };
  } catch (err) {
    return failed(err, "Couldn't save the template. Try again.");
  }
}

export async function deleteTemplateAction(id: string): Promise<NewsletterResult> {
  const { ctx, error } = await guard("marketing.edit");
  if (error) return { ok: false, message: error };
  await deleteTemplate(scopeOf(ctx), id);
  refresh();
  return { ok: true, message: "Template deleted." };
}
