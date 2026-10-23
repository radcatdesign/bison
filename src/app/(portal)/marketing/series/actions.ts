"use server";

// Email series actions. Each one re-reads the session and checks plan and
// role on the server. The demo keeps series in the browser instead.
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { withTenant } from "@/lib/db";
import { DEMO_MESSAGE } from "@/lib/demo";
import { demoMode } from "@/lib/env";
import { checkContent } from "@/lib/marketing/newsletters";
import { addStep, createSeries, deleteSeries, deleteStep, isTrigger, saveStep, SeriesInputError, setSeriesStatus, startSeriesForList, updateSeries } from "@/lib/marketing/series";
import { sendTestEmail } from "@/lib/marketing/test-send";
import { runEmailWork } from "@/lib/marketing/worker";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";

export type SeriesResult = { ok: boolean; message: string; savedAt?: string };

async function guard(): Promise<{ ctx: PortalContext; error: string | null }> {
  const ctx = await getPortalContext();
  if (!can(ctx.tenant, "marketing.sequences")) return { ctx, error: "Email series are part of Marketing. Unlock Marketing to use them." };
  if (!may(ctx.member.role, "marketing.edit")) return { ctx, error: "Your role can't change email series." };
  if (demoMode()) return { ctx, error: DEMO_MESSAGE };
  return { ctx, error: null };
}

function failed(err: unknown, fallback: string): SeriesResult {
  if (err instanceof SeriesInputError) return { ok: false, message: err.message };
  console.error(fallback, err);
  return { ok: false, message: fallback };
}

export async function createSeriesAction(formData: FormData): Promise<void> {
  const { ctx, error } = await guard();
  if (error) redirect(`/marketing/series?error=${encodeURIComponent(error)}`);
  const trigger = formData.get("trigger");
  let id: string;
  try {
    id = await createSeries(scopeOf(ctx), { name: String(formData.get("name") ?? ""), trigger: isTrigger(trigger) ? trigger : "joined", detail: String(formData.get("detail") ?? "") });
  } catch (err) {
    redirect(`/marketing/series?error=${encodeURIComponent(err instanceof SeriesInputError ? err.message : "Couldn't make the series. Try again.")}`);
  }
  redirect(`/marketing/series/${id}`);
}

export async function updateSeriesAction(id: string, input: { name: string; trigger: string; detail: string }): Promise<SeriesResult> {
  const { ctx, error } = await guard();
  if (error) return { ok: false, message: error };
  if (!isTrigger(input.trigger)) return { ok: false, message: "Pick what starts the series." };
  try {
    await updateSeries(scopeOf(ctx), id, { name: input.name, trigger: input.trigger, detail: input.detail });
  } catch (err) {
    return failed(err, "Couldn't save the series. Try again.");
  }
  refresh();
  return { ok: true, message: "Saved." };
}

export async function setSeriesStatusAction(id: string, on: boolean): Promise<SeriesResult> {
  const { ctx, error } = await guard();
  if (error) return { ok: false, message: error };
  const r = await setSeriesStatus(scopeOf(ctx), id, on);
  if (!r.ok) return { ok: false, message: r.message };
  refresh();
  return { ok: true, message: on ? "On. People start it from now; anyone already in it picks up where they left off." : "Off. Nobody new starts it, and nobody in it gets more email until it's back on." };
}

export async function deleteSeriesAction(id: string): Promise<SeriesResult> {
  const { ctx, error } = await guard();
  if (error) return { ok: false, message: error };
  try {
    await deleteSeries(scopeOf(ctx), id);
  } catch (err) {
    return failed(err, "Couldn't delete the series. Try again.");
  }
  redirect("/marketing/series");
}

export async function addStepAction(seriesId: string, day: number): Promise<SeriesResult> {
  const { ctx, error } = await guard();
  if (error) return { ok: false, message: error };
  let stepId: string;
  try {
    stepId = await addStep(scopeOf(ctx), seriesId, day);
  } catch (err) {
    return failed(err, "Couldn't add the email. Try again.");
  }
  redirect(`/marketing/series/${seriesId}/steps/${stepId}`);
}

export async function saveStepAction(stepId: string, input: { subject: string; preheader: string; doc: unknown; delayDays?: number }): Promise<SeriesResult> {
  const { ctx, error } = await guard();
  if (error) return { ok: false, message: error };
  try {
    const savedAt = await saveStep(scopeOf(ctx), stepId, input);
    return { ok: true, message: "Saved", savedAt: savedAt.toISOString() };
  } catch (err) {
    return failed(err, "Couldn't save. Check your connection; we'll keep trying.");
  }
}

export async function deleteStepAction(stepId: string): Promise<SeriesResult> {
  const { ctx, error } = await guard();
  if (error) return { ok: false, message: error };
  let seriesId: string | null;
  try {
    seriesId = await deleteStep(scopeOf(ctx), stepId);
  } catch (err) {
    return failed(err, "Couldn't remove the email. Try again.");
  }
  redirect(seriesId ? `/marketing/series/${seriesId}` : "/marketing/series");
}

export async function testStepAction(stepId: string, content: { subject: string; preheader: string; doc: unknown }, to: string): Promise<SeriesResult> {
  const { ctx, error } = await guard();
  if (error) return { ok: false, message: error };
  try {
    const checked = await withTenant(scopeOf(ctx), (tx) => checkContent(tx, content));
    const r = await sendTestEmail(scopeOf(ctx), { ...checked, to, stepId });
    if (r.ok) refresh();
    return r;
  } catch (err) {
    return failed(err, "Couldn't send the test. Try again.");
  }
}

export async function startSeriesForListAction(seriesId: string, listId: string | null): Promise<SeriesResult> {
  const { ctx, error } = await guard();
  if (error) return { ok: false, message: error };
  if (!may(ctx.member.role, "email.send")) return { ok: false, message: "Your role can't send email." };
  if (ctx.settings.sampleData) return { ok: false, message: "Sample data is on, so your list on screen is made up. Turn it off in Settings to start this for your real list." };
  try {
    const started = await startSeriesForList(scopeOf(ctx), seriesId, listId);
    if (started) after(() => runEmailWork({ tenantId: ctx.tenant.id, budgetMs: 250_000 }).then(() => undefined));
    refresh();
    return { ok: true, message: started ? `Started for ${started.toLocaleString("en-US")} ${started === 1 ? "person" : "people"}. People who were in it before were skipped.` : "Everyone there has been in this series already, so nobody new started." };
  } catch (err) {
    return failed(err, "Couldn't start the series. Try again.");
  }
}
