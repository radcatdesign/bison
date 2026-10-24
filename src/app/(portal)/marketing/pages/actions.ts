"use server";

// Landing page actions. Each one re-reads the session, then checks the plan and
// the person's role on the server. The demo keeps pages in the browser instead,
// so these refuse in demo mode.
import { redirect } from "next/navigation";
import { type Action, may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { sayOf } from "@/lib/edition";
import { demoMode } from "@/lib/env";
import { createPage, deletePage, PageInputError, publishPage, renamePage, saveDraft, unpublishPage } from "@/lib/pages/repo";
import { emptyPageDoc, PageDocError, parsePageDoc, titleFromBrief } from "@/lib/pages/schema";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";
import { buildFromTemplate, findTemplate } from "@/lib/pages/page-templates";
import { publicPageUrl } from "@/lib/pages/urls";

export type PageActionResult = { ok: boolean; message: string; url?: string; savedAt?: string };

/** Taking a page down or deleting it works without the plan, so a lapsed trial can always clean up. */
async function pagesContext(action: Action, { needsPlan = true } = {}): Promise<{ ctx: PortalContext; error: string | null }> {
  const ctx = await getPortalContext();
  const say = sayOf(ctx);
  if (needsPlan && !can(ctx.tenant, "marketing.pages")) return { ctx, error: say("Pages are part of Marketing. Unlock Marketing to build pages.", "Funnel pages are part of Marketing. Unlock Marketing to build them.") };
  if (!may(ctx.member.role, action)) {
    return { ctx, error: action === "pages.publish" ? say("Your role can't publish landing pages.", "Your role can't publish funnel pages.") : say("Your role can't change landing pages.", "Your role can't change funnel pages.") };
  }
  if (demoMode()) return { ctx, error: "This is a demo, so pages stay in your browser." };
  return { ctx, error: null };
}

function failure(err: unknown, fallback: string): PageActionResult {
  if (err instanceof PageInputError || err instanceof PageDocError) return { ok: false, message: err.message };
  console.error(fallback, err);
  return { ok: false, message: fallback };
}

export async function createPageAction(formData: FormData): Promise<void> {
  const { ctx, error } = await pagesContext("pages.edit");
  if (error) redirect(`/marketing/pages?error=${encodeURIComponent(error)}`);
  const template = findTemplate(formData.get("template"), ctx.tenant.edition);
  if (template) {
    const doc = parsePageDoc(buildFromTemplate(template, { brand: ctx.tenant.name, accent: ctx.settings.accent }, formData.get("brandColor") === "on"));
    const { id } = await createPage(scopeOf(ctx), { title: template.name, doc, actor: ctx.member.email });
    redirect(`/marketing/pages/${id}`);
  }
  const blank = formData.get("mode") === "blank";
  const prompt = blank ? "" : String(formData.get("prompt") ?? "").trim().slice(0, 2000);
  const title = String(formData.get("title") ?? "").trim() || (prompt ? titleFromBrief(prompt) : "Untitled page");
  const { id } = await createPage(scopeOf(ctx), { title, doc: emptyPageDoc(ctx.settings.accent), actor: ctx.member.email });
  redirect(`/marketing/pages/${id}${prompt ? `?build=${encodeURIComponent(prompt)}` : ""}`);
}

export async function savePageAction(id: string, doc: unknown): Promise<PageActionResult> {
  const { ctx, error } = await pagesContext("pages.edit");
  if (error) return { ok: false, message: error };
  try {
    const savedAt = await saveDraft(scopeOf(ctx), id, parsePageDoc(doc));
    return { ok: true, message: "Saved", savedAt: savedAt.toISOString() };
  } catch (err) {
    return failure(err, "Couldn't save. Check your connection; we'll keep trying.");
  }
}

export async function renamePageAction(id: string, title: string, slug: string): Promise<PageActionResult> {
  const { ctx, error } = await pagesContext("pages.edit");
  if (error) return { ok: false, message: error };
  try {
    await renamePage(scopeOf(ctx), id, { title: String(title), slug: String(slug) });
    return { ok: true, message: "Saved", url: publicPageUrl(ctx.tenant.slug, String(slug).trim().toLowerCase()) };
  } catch (err) {
    return failure(err, "Couldn't rename the page. Try again.");
  }
}

export async function publishPageAction(id: string, doc: unknown): Promise<PageActionResult> {
  const { ctx, error } = await pagesContext("pages.publish");
  if (error) return { ok: false, message: error };
  try {
    // Save what's on screen first, so what goes live is exactly what they see.
    await saveDraft(scopeOf(ctx), id, parsePageDoc(doc));
    const { slug } = await publishPage(scopeOf(ctx), id, ctx.member.email);
    return { ok: true, message: "Published", url: publicPageUrl(ctx.tenant.slug, slug) };
  } catch (err) {
    return failure(err, "Couldn't publish. Try again in a minute.");
  }
}

export async function unpublishPageAction(id: string): Promise<PageActionResult> {
  const { ctx, error } = await pagesContext("pages.publish", { needsPlan: false });
  if (error) return { ok: false, message: error };
  try {
    await unpublishPage(scopeOf(ctx), id);
    return { ok: true, message: "The page is offline. Its address now shows a not-found page." };
  } catch (err) {
    return failure(err, "Couldn't take the page offline. Try again.");
  }
}

export async function deletePageAction(id: string): Promise<PageActionResult> {
  const { ctx, error } = await pagesContext("pages.edit", { needsPlan: false });
  if (error) return { ok: false, message: error };
  try {
    await deletePage(scopeOf(ctx), id);
  } catch (err) {
    return failure(err, "Couldn't delete the page. Try again.");
  }
  redirect("/marketing/pages");
}
