"use server";

// Campaign actions. Each re-reads the session and checks the plan and role on
// the server. Campaigns are content, like pages and emails, so they save with
// sample data on too. Filing never changes or deletes what's filed.
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import type { ActionState } from "@/app/(portal)/actions";
import { may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { CampaignError, createCampaign, deleteCampaign, deleteGraphic, fileItem, type ItemKind, moveGraphic, renameGraphic, setArchived, updateCampaign } from "@/lib/campaigns/store";
import { withTenant } from "@/lib/db";
import { DEMO_MESSAGE } from "@/lib/demo";
import { demoMode } from "@/lib/env";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";

async function guard(): Promise<{ ctx: PortalContext; error: null } | { ctx: PortalContext; error: string }> {
  const ctx = await getPortalContext();
  if (!can(ctx.tenant, "marketing.campaigns")) return { ctx, error: "Campaigns are part of Marketing. Unlock Marketing to use them." };
  if (!may(ctx.member.role, "marketing.edit")) return { ctx, error: "Your role can't change campaigns." };
  if (demoMode()) return { ctx, error: DEMO_MESSAGE };
  return { ctx, error: null };
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const input = (f: FormData) => ({ name: str(f, "name"), notes: str(f, "notes"), color: str(f, "color"), startsOn: str(f, "startsOn"), endsOn: str(f, "endsOn") });

async function run(fn: (ctx: PortalContext) => Promise<string>): Promise<ActionState> {
  const { ctx, error } = await guard();
  if (error) return { ok: false, message: error };
  try {
    const message = await fn(ctx);
    refresh();
    return { ok: true, message };
  } catch (err) {
    if (err instanceof CampaignError) return { ok: false, message: err.message };
    console.error("campaign action failed", err);
    return { ok: false, message: "Something went wrong on our side, so that wasn't saved. Try again in a minute." };
  }
}

export async function newCampaign(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx, error } = await guard();
  if (error) return { ok: false, message: error };
  let id: string;
  try {
    id = await withTenant(scopeOf(ctx), (tx) => createCampaign(tx, input(form), ctx.member.email || ctx.member.name));
  } catch (err) {
    if (err instanceof CampaignError) return { ok: false, message: err.message };
    console.error("campaign create failed", err);
    return { ok: false, message: "Something went wrong on our side, so that wasn't saved. Try again in a minute." };
  }
  redirect(`/marketing/campaigns/${id}`);
}

export async function saveCampaign(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async (ctx) => {
    await withTenant(scopeOf(ctx), (tx) => updateCampaign(tx, str(form, "id"), input(form)));
    return "Saved.";
  });
}

const KINDS = ["page", "newsletter", "series"] as const;

/** Adds a page, newsletter or series to this campaign. The picker's value is "<kind>:<id>". */
export async function addToCampaign(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async (ctx) => {
    const [kind, id] = str(form, "item").split(":");
    if (!(KINDS as readonly string[]).includes(kind) || !id) throw new CampaignError("Pick something to add.");
    await withTenant(scopeOf(ctx), (tx) => fileItem(tx, kind as Exclude<ItemKind, "graphic">, id, str(form, "campaignId")));
    return "Added.";
  });
}

export async function removeFromCampaign(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async (ctx) => {
    const kind = str(form, "kind");
    if (!(KINDS as readonly string[]).includes(kind)) throw new CampaignError("That isn't here anymore. Reload the page.");
    await withTenant(scopeOf(ctx), (tx) => fileItem(tx, kind as Exclude<ItemKind, "graphic">, str(form, "itemId"), null));
    return "Taken out of the campaign. It's still in its own list.";
  });
}

export async function editGraphic(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async (ctx) => {
    const fileId = str(form, "fileId");
    const to = str(form, "moveTo");
    await withTenant(scopeOf(ctx), async (tx) => {
      await renameGraphic(tx, fileId, str(form, "name"));
      if (to && to !== str(form, "campaignId")) await moveGraphic(tx, fileId, to);
    });
    return to && to !== str(form, "campaignId") ? "Moved." : "Saved.";
  });
}

export async function removeGraphic(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async (ctx) => {
    await withTenant(scopeOf(ctx), (tx) => deleteGraphic(tx, str(form, "fileId")));
    return "Graphic deleted.";
  });
}

export async function archiveCampaign(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(async (ctx) => {
    const archived = str(form, "archived") === "1";
    await withTenant(scopeOf(ctx), (tx) => setArchived(tx, str(form, "id"), archived));
    return archived ? "Archived. Everything in it stays filed here." : "Restored.";
  });
}

export async function removeCampaign(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx, error } = await guard();
  if (error) return { ok: false, message: error };
  try {
    await withTenant(scopeOf(ctx), (tx) => deleteCampaign(tx, str(form, "id")));
  } catch (err) {
    if (err instanceof CampaignError) return { ok: false, message: err.message };
    throw err;
  }
  redirect("/marketing/campaigns");
}
