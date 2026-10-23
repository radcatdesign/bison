"use server";

// Every action re-reads the session through getPortalContext and checks role
// and entitlements on the server. Nothing from the form decides tenant or role.
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { CATALOG, isPaidItemKey } from "@/config/catalog";
import { type Action, may } from "@/config/roles";
import { audit } from "@/lib/audit";
import { startTrial, subscribe } from "@/lib/billing";
import { withTenant } from "@/lib/db";
import type { ContactStatus } from "@/lib/db/types";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";
import { getRepos } from "@/lib/repo";
import { NotFoundError, SampleModeError } from "@/lib/repo/types";
import { DEMO_MESSAGE } from "@/lib/demo";
import { demoReset, demoStartTrial, demoSubscribe } from "@/lib/demo-billing";
import { ConfigError, demoMode } from "@/lib/env";

export type ActionState = { ok: boolean; message: string } | null;

const NOT_ALLOWED: Record<Action, string> = {
  "billing.manage": "Only an owner can change the plan.",
  "members.manage": "Only owners and admins can manage the team.",
  "settings.manage": "Only owners and admins can change settings.",
  "contacts.edit": "Your role can view contacts but not change them.",
  "email.send": "Your role can't send email.",
  "refunds.issue": "Your role can't issue refunds.",
  "data.export": "Only owners and admins can export data.",
  "data.delete": "Only owners and admins can delete data.",
  "pages.edit": "Your role can't change landing pages.",
  "pages.publish": "Your role can't publish landing pages.",
};

/** Role check first. In the demo, only actions that opt in (turning things on) go ahead. */
async function contextFor(action: Action, { demoAllowed = false } = {}): Promise<{ ctx: PortalContext; error: null } | { ctx: PortalContext; error: string }> {
  const ctx = await getPortalContext();
  if (!may(ctx.member.role, action)) return { ctx, error: NOT_ALLOWED[action] };
  if (demoMode() && !demoAllowed) return { ctx, error: DEMO_MESSAGE };
  return { ctx, error: null };
}

export async function setSampleData(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx, error } = await contextFor("settings.manage");
  if (error) return { ok: false, message: error };
  const on = formData.get("sampleData") === "on";
  await withTenant(scopeOf(ctx), async (tx) => {
    await tx.updateTable("settings").set({ sample_data: on }).execute();
    await audit(tx, { action: "settings.sample_data", detail: { on } });
  });
  refresh();
  return { ok: true, message: on ? "Sample data is on. Nothing you change is saved until you turn it off." : "Sample data is off. You're looking at your own data." };
}

export async function setAccent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx, error } = await contextFor("settings.manage");
  if (error) return { ok: false, message: error };
  const accent = String(formData.get("accent") ?? "").toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(accent)) return { ok: false, message: "Pick a color, or type one like #3b5bff." };
  await withTenant(scopeOf(ctx), async (tx) => {
    await tx.updateTable("settings").set({ accent }).execute();
    await audit(tx, { action: "settings.accent", detail: { accent } });
  });
  refresh();
  return { ok: true, message: "Accent color saved." };
}

export async function startTrialAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx, error } = await contextFor("billing.manage", { demoAllowed: true });
  if (error) return { ok: false, message: error };
  const item = formData.get("item");
  if (!isPaidItemKey(item)) return { ok: false, message: "That isn't something you can turn on." };
  const result = demoMode() ? await demoStartTrial(ctx, item) : await startTrial(ctx, item);
  if (result.ok) refresh();
  return { ok: result.ok, message: result.message };
}

export async function subscribeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx, error } = await contextFor("billing.manage", { demoAllowed: true });
  if (error) return { ok: false, message: error };
  const item = formData.get("item");
  if (!isPaidItemKey(item)) return { ok: false, message: "That isn't something you can subscribe to." };
  if (demoMode()) {
    const demo = await demoSubscribe(ctx, item);
    if (demo.ok) refresh();
    return demo;
  }
  let result;
  try {
    result = await subscribe(ctx, item);
  } catch (err) {
    if (err instanceof ConfigError) return { ok: false, message: err.message };
    console.error("subscribe failed", err);
    return { ok: false, message: `Stripe didn't accept that request, so ${CATALOG[item].name} wasn't added. Try again in a minute.` };
  }
  if (result.ok && "redirectUrl" in result && result.redirectUrl) redirect(result.redirectUrl);
  if (result.ok) refresh();
  return { ok: result.ok, message: result.message };
}

/** Demo only: turns off everything this visitor turned on for their demo company. */
export async function resetDemoAction(): Promise<ActionState> {
  const { ctx, error } = await contextFor("billing.manage", { demoAllowed: true });
  if (error) return { ok: false, message: error };
  if (!demoMode()) return { ok: false, message: "Only the demo can be reset." };
  const result = await demoReset(ctx);
  refresh();
  return result;
}

const STATUSES: ContactStatus[] = ["new", "contacted", "qualified", "won", "lost", "spam"];

export async function setContactStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { ctx, error } = await contextFor("contacts.edit");
  if (error) return { ok: false, message: error };
  const id = String(formData.get("contactId") ?? "");
  const status = formData.get("status") as ContactStatus;
  if (!STATUSES.includes(status)) return { ok: false, message: "Pick a status from the list." };
  const repos = getRepos({ scope: scopeOf(ctx), tenant: ctx.tenant, sampleData: ctx.settings.sampleData, timezone: ctx.settings.timezone });
  try {
    await repos.contacts.setStatus(id, status);
  } catch (err) {
    if (err instanceof SampleModeError || err instanceof NotFoundError) return { ok: false, message: err.message };
    console.error("setContactStatus failed", err);
    return { ok: false, message: "Couldn't save that. Reload the page and try again." };
  }
  refresh();
  return { ok: true, message: "Status saved." };
}
