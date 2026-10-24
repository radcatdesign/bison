"use server";

// A/B test actions. Each one re-reads the session, then checks the plan and the
// person's role on the server. Setting up a test needs pages.edit; starting and
// ending one changes what visitors see, so it needs pages.publish. The demo
// shows made-up tests, so these refuse in demo mode.
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { type Action, may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { sayOf } from "@/lib/edition";
import { demoMode } from "@/lib/env";
import type { PageTestGoal } from "@/lib/db/types";
import { PageDocError, parsePageDoc } from "@/lib/pages/schema";
import { addVersion, createTest, deleteTest, endTest, PageTestError, removeVersion, saveVersionDoc, startTest, type TestChanges, updateTest } from "@/lib/pages/tests";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";

export type TestActionResult = { ok: boolean; message: string; id?: string };

async function testsContext(action: Action, { needsPlan = true } = {}): Promise<{ ctx: PortalContext; error: string | null }> {
  const ctx = await getPortalContext();
  if (needsPlan && !can(ctx.tenant, "marketing.tests")) return { ctx, error: "A/B tests are part of Marketing. Unlock Marketing to run them." };
  if (!may(ctx.member.role, action)) {
    return { ctx, error: action === "pages.publish" ? "Your role can't start or end tests. Someone who can publish pages can." : sayOf(ctx)("Your role can't change landing pages or their tests.", "Your role can't change funnel pages or their tests.") };
  }
  if (demoMode()) return { ctx, error: "This is a demo, so the tests here are examples and can't be changed. In your own account you set them up the same way." };
  return { ctx, error: null };
}

function failure(err: unknown, fallback: string): TestActionResult {
  if (err instanceof PageTestError || err instanceof PageDocError) return { ok: false, message: err.message };
  console.error(fallback, err);
  return { ok: false, message: fallback };
}

const goalOf = (v: unknown): PageTestGoal => (v === "click" ? "click" : "form");

export async function createTestAction(_prev: TestActionResult | null, formData: FormData): Promise<TestActionResult> {
  const { ctx, error } = await testsContext("pages.edit");
  if (error) return { ok: false, message: error };
  let id: string;
  try {
    id = await createTest(
      scopeOf(ctx),
      { pageId: String(formData.get("pageId") ?? ""), name: String(formData.get("name") ?? ""), goal: goalOf(formData.get("goal")), hypothesis: String(formData.get("hypothesis") ?? "") },
      ctx.member.email,
    );
  } catch (err) {
    return failure(err, "Couldn't create the test. Try again.");
  }
  redirect(`/marketing/tests/${id}`);
}

export async function updateTestAction(id: string, changes: TestChanges): Promise<TestActionResult> {
  // Ending on its own can publish a version, so turning it on or off takes the publish role.
  const { ctx, error } = await testsContext(typeof changes?.autoEnd === "boolean" ? "pages.publish" : "pages.edit");
  if (error) return { ok: false, message: error };
  try {
    const clean: TestChanges = {};
    if (typeof changes.name === "string") clean.name = changes.name;
    if (typeof changes.hypothesis === "string") clean.hypothesis = changes.hypothesis;
    if (changes.goal !== undefined) clean.goal = goalOf(changes.goal);
    if (typeof changes.autoEnd === "boolean") clean.autoEnd = changes.autoEnd;
    if (changes.weights && typeof changes.weights === "object") clean.weights = Object.fromEntries(Object.entries(changes.weights).map(([k, v]) => [k, Number(v)]));
    if (changes.versionNames && typeof changes.versionNames === "object") clean.versionNames = Object.fromEntries(Object.entries(changes.versionNames).map(([k, v]) => [k, String(v)]));
    await updateTest(scopeOf(ctx), id, clean);
  } catch (err) {
    return failure(err, "Couldn't save that. Try again.");
  }
  refresh();
  return { ok: true, message: "Saved" };
}

export async function addVersionAction(testId: string): Promise<TestActionResult> {
  const { ctx, error } = await testsContext("pages.edit");
  if (error) return { ok: false, message: error };
  try {
    const id = await addVersion(scopeOf(ctx), testId);
    refresh();
    return { ok: true, message: "Added C, a copy of the live page. Edit it to try a second idea.", id };
  } catch (err) {
    return failure(err, "Couldn't add a version. Try again.");
  }
}

export async function removeVersionAction(versionId: string): Promise<TestActionResult> {
  const { ctx, error } = await testsContext("pages.edit");
  if (error) return { ok: false, message: error };
  try {
    await removeVersion(scopeOf(ctx), versionId);
  } catch (err) {
    return failure(err, "Couldn't remove that version. Try again.");
  }
  refresh();
  return { ok: true, message: "Removed" };
}

/** Saves a version from the editor. */
export async function saveVersionAction(versionId: string, doc: unknown): Promise<TestActionResult> {
  const { ctx, error } = await testsContext("pages.edit");
  if (error) return { ok: false, message: error };
  try {
    await saveVersionDoc(scopeOf(ctx), versionId, parsePageDoc(doc));
    return { ok: true, message: "Saved" };
  } catch (err) {
    return failure(err, "Couldn't save. Check your connection; we'll keep trying.");
  }
}

export async function startTestAction(id: string): Promise<TestActionResult> {
  const { ctx, error } = await testsContext("pages.publish");
  if (error) return { ok: false, message: error };
  try {
    await startTest(scopeOf(ctx), id, ctx.member.email);
  } catch (err) {
    return failure(err, "Couldn't start the test. Try again.");
  }
  refresh();
  return { ok: true, message: "The test is running. Visitors to the page now see one of the versions." };
}

/** Ends a running test and keeps one version live. Works without the plan, so a lapsed trial can always stop a test. */
export async function endTestAction(id: string, keepVersionId: string): Promise<TestActionResult> {
  const { ctx, error } = await testsContext("pages.publish", { needsPlan: false });
  if (error) return { ok: false, message: error };
  try {
    const r = await endTest(scopeOf(ctx), id, keepVersionId, ctx.member.email, "team");
    refresh();
    const kept = r.kept.toUpperCase();
    if (r.kept === "a") return { ok: true, message: "Ended. The page stays as it was." };
    if (!r.published) return { ok: true, message: `Ended, keeping ${kept}, but it couldn't be published. Open the page and publish it from there.` };
    return { ok: true, message: r.draftKept ? `Ended. ${kept} is live now. Your draft has changes that aren't live, so it was left as it is.` : `Ended. ${kept} is live now, and it's what you'll see in the editor.` };
  } catch (err) {
    return failure(err, "Couldn't end the test. Try again.");
  }
}

export async function deleteTestAction(id: string): Promise<TestActionResult> {
  const { ctx, error } = await testsContext("pages.edit", { needsPlan: false });
  if (error) return { ok: false, message: error };
  try {
    await deleteTest(scopeOf(ctx), id);
  } catch (err) {
    return failure(err, "Couldn't delete the test. Try again.");
  }
  redirect("/marketing/tests");
}
