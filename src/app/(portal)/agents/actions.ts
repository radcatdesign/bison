"use server";

// Approving and dismissing the agents' work. Each action re-reads the session,
// checks the plan and the person's role for that kind of work, and never takes
// the company from the form. Emails send outside any transaction.
import { refresh } from "next/cache";
import { may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { rerunSoon } from "@/lib/agents/repo";
import { isTaskKind, KINDS } from "@/lib/agents/roster";
import { AgentError, approveTask, dismissTask, prepareEmail, recordEmail, sendEmailDraft } from "@/lib/agents/store";
import { CampaignError } from "@/lib/campaigns/store";
import { withTenant } from "@/lib/db";
import { DEMO_MESSAGE } from "@/lib/demo";
import { demoMode } from "@/lib/env";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { earn } from "@/lib/progress/repo";
import { gainedLine } from "@/lib/progress/store";
import { SampleModeError } from "@/lib/repo/types";

export type AgentResult = { ok: boolean; message: string; href?: string } | null;

const str = (f: FormData, k: string) => (f.has(k) ? String(f.get(k) ?? "") : undefined);

async function guard(form: FormData) {
  const ctx = await getPortalContext();
  const kind = String(form.get("kind") ?? "");
  if (!isTaskKind(kind)) return { ctx, error: "That isn't here anymore. Reload the page." } as const;
  const spec = KINDS[kind];
  if (!can(ctx.tenant, spec.feature)) return { ctx, error: "This is part of a module you don't have right now." } as const;
  if (spec.action && !may(ctx.member.role, spec.action)) return { ctx, error: "Your role can't approve this kind of work. Ask an owner or admin." } as const;
  if (demoMode()) return { ctx, error: DEMO_MESSAGE } as const;
  if (ctx.settings.sampleData) return { ctx, error: new SampleModeError().message } as const;
  return { ctx, error: null, kind } as const;
}

const fail = (err: unknown): AgentResult => {
  if (err instanceof AgentError || err instanceof CampaignError) return { ok: false, message: err.message };
  console.error("agent action failed", err);
  return { ok: false, message: "Something went wrong on our side, so nothing was sent. Try again in a minute." };
};

export async function approveAgentTask(_prev: AgentResult, form: FormData): Promise<AgentResult> {
  const g = await guard(form);
  if (g.error !== null) return { ok: false, message: g.error };
  const { ctx, kind } = g;
  const id = String(form.get("id") ?? "");
  const actor = ctx.member.name || ctx.member.email;
  const edits = { subject: str(form, "subject"), body: str(form, "body"), name: str(form, "name") };
  try {
    if (KINDS[kind].email) {
      const elsewhere = form.get("mode") === "elsewhere";
      const prepared = await withTenant(scopeOf(ctx), (tx) => prepareEmail(tx, id, edits));
      const delivery = elsewhere ? { to: [prepared.email.to], at: new Date().toISOString() } : await sendEmailDraft(prepared);
      const r = await withTenant(scopeOf(ctx), (tx) => recordEmail(tx, prepared.task, delivery, actor, { sentElsewhere: elsewhere }));
      if (!r.ok) return r;
      rerunSoon(ctx.tenant.id);
      const line = gainedLine(await earn(ctx));
      refresh();
      return { ok: true, message: r.message + line };
    }
    const r = await withTenant(scopeOf(ctx), (tx) => approveTask(tx, id, edits, actor, ctx.tenant.edition));
    rerunSoon(ctx.tenant.id);
    const line = gainedLine(await earn(ctx));
    refresh();
    return { ok: true, message: r.message + line, href: r.href };
  } catch (err) {
    return fail(err);
  }
}

export async function dismissAgentTask(_prev: AgentResult, form: FormData): Promise<AgentResult> {
  const g = await guard(form);
  if (g.error !== null) return { ok: false, message: g.error };
  try {
    await withTenant(scopeOf(g.ctx), (tx) => dismissTask(tx, String(form.get("id") ?? ""), g.ctx.member.name || g.ctx.member.email));
    refresh();
    return { ok: true, message: "Dismissed." };
  } catch (err) {
    return fail(err);
  }
}
