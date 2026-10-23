// Landing pages in the database, as the real app role: each company's pages stay
// its own, only published pages are public, and form sends land in the right inbox.
import { afterAll, describe, expect, it } from "vitest";
import { withTenant } from "@/lib/db";
import {
  agentRunsThisMonth,
  createPage,
  deletePage,
  getPage,
  getPublishedPage,
  listPages,
  PageInputError,
  publishPage,
  recordAgentRun,
  renamePage,
  saveDraft,
  unpublishPage,
} from "@/lib/pages/repo";
import { applyOp } from "@/lib/pages/ops";
import { seedPageFor } from "@/lib/pages/seeds";
import { submitPageForm } from "@/lib/pages/submit";
import { starterSection } from "@/lib/pages/templates";
import { A, app, B, rawAsApp } from "./helpers";

const doc = seedPageFor("pools").doc;
const slugOf = (tenantId: string) => withTenant({ tenantId }, (tx) => tx.selectFrom("tenants").select("slug").executeTakeFirstOrThrow(), app()).then((r) => r.slug);

afterAll(async () => {
  await app().destroy();
});

describe("pages stay with their company", () => {
  it("lists, opens and saves only the company's own pages", async () => {
    const { id } = await createPage({ tenantId: A }, { title: "Isolation check", doc, actor: "ada@brightwaterpools.com" }, app());
    expect((await listPages({ tenantId: A }, app())).map((p) => p.id)).toContain(id);
    expect((await listPages({ tenantId: B }, app())).map((p) => p.id)).not.toContain(id);
    expect(await getPage({ tenantId: B }, id, app())).toBeNull();
    await expect(saveDraft({ tenantId: B }, id, doc, app())).rejects.toBeInstanceOf(PageInputError);
    await expect(publishPage({ tenantId: B }, id, "x", app())).rejects.toBeInstanceOf(PageInputError);
    await deletePage({ tenantId: B }, id, app());
    expect(await getPage({ tenantId: A }, id, app())).not.toBeNull();
    const rows = await rawAsApp<{ id: string }>(`select id from pages where id = '${id}'`, B);
    expect(rows).toEqual([]);
  });

  it("gives each new page its own address", async () => {
    const one = await createPage({ tenantId: A }, { title: "Summer promo", doc, actor: "" }, app());
    const two = await createPage({ tenantId: A }, { title: "Summer promo", doc, actor: "" }, app());
    const other = await createPage({ tenantId: B }, { title: "Summer promo", doc, actor: "" }, app());
    expect(one.slug).toBe("summer-promo");
    expect(two.slug).toBe("summer-promo-2");
    expect(other.slug).toBe("summer-promo");
    await expect(renamePage({ tenantId: A }, two.id, { title: "Summer promo", slug: "summer-promo" }, app())).rejects.toThrow(/already uses \/summer-promo/);
    await expect(renamePage({ tenantId: A }, two.id, { title: "x", slug: "Not A Slug" }, app())).rejects.toThrow(/lowercase letters/);
  });
});

describe("publishing", () => {
  it("won't publish an empty page or one with placeholders left", async () => {
    const { id } = await createPage({ tenantId: A }, { title: "Placeholder check", doc: { ...doc, sections: [] }, actor: "" }, app());
    await expect(publishPage({ tenantId: A }, id, "x", app())).rejects.toThrow(/empty/);
    await saveDraft({ tenantId: A }, id, applyOp(doc, { op: "add_section", section: starterSection("quote", "x") }).doc, app());
    await expect(publishPage({ tenantId: A }, id, "x", app())).rejects.toThrow(/Fill in all 3 placeholders/);
  });

  it("shows the published version publicly, never the draft, and only at its own company's address", async () => {
    const { id, slug } = await createPage({ tenantId: A }, { title: "Public check", doc, actor: "" }, app());
    const aSlug = await slugOf(A);
    const bSlug = await slugOf(B);
    expect(await getPublishedPage(aSlug, slug, app())).toBeNull();

    await publishPage({ tenantId: A }, id, "ada@brightwaterpools.com", app());
    const live = await getPublishedPage(aSlug, slug, app());
    expect(live).toMatchObject({ tenantId: A, pageId: id, brand: "Brightwater Pools", slug });

    // A new draft doesn't change what visitors see until it's published again.
    const draft = applyOp(doc, { op: "update_section", id: "hero", changes: { headline: "Draft only" } }).doc;
    await saveDraft({ tenantId: A }, id, draft, app());
    const still = await getPublishedPage(aSlug, slug, app());
    expect(still?.doc.sections[0].type === "hero" && still.doc.sections[0].headline).toBe("Your pool, lit from within");
    expect((await getPage({ tenantId: A }, id, app()))?.status).toBe("changed");

    expect(await getPublishedPage(bSlug, slug, app())).toBeNull();
    expect(await getPublishedPage(aSlug, "../etc", app())).toBeNull();

    await unpublishPage({ tenantId: A }, id, app());
    expect(await getPublishedPage(aSlug, slug, app())).toBeNull();
  });
});

describe("agent runs", () => {
  it("are saved with the request and counted toward the monthly limit, per company", async () => {
    const { id } = await createPage({ tenantId: B }, { title: "Agent check", doc, actor: "" }, app());
    const before = await agentRunsThisMonth({ tenantId: B }, app());
    const beforeA = await agentRunsThisMonth({ tenantId: A }, app());
    await recordAgentRun({ tenantId: B }, id, { doc, instruction: "Make it dark", reply: "Done.", actor: "cora@ridgelineroasters.com" }, app());
    expect(await agentRunsThisMonth({ tenantId: B }, app())).toBe(before + 1);
    expect(await agentRunsThisMonth({ tenantId: A }, app())).toBe(beforeA);
    await expect(recordAgentRun({ tenantId: A }, id, { doc, instruction: "x", reply: "", actor: "" }, app())).rejects.toBeInstanceOf(PageInputError);
  });
});

describe("form sends from a published page", () => {
  it("land in that company's Contacts and nowhere else", async () => {
    const { id, slug } = await createPage({ tenantId: A }, { title: "Form check", doc, actor: "" }, app());
    await publishPage({ tenantId: A }, id, "x", app());
    const aSlug = await slugOf(A);
    const email = `visitor-${Date.now()}@example.com`;

    const ok = await submitPageForm(aSlug, slug, { formId: "form", fields: { name: "Vi Sitor", email: email.toUpperCase(), message: "Pricing for 600 sq ft?", company: "not on this form" }, elapsedMs: 5000 }, app());
    expect(ok).toEqual({ ok: true, message: "Thanks. We'll email your quote within one business day." });

    const mine = await withTenant({ tenantId: A }, (tx) => tx.selectFrom("contacts").selectAll().where("email", "=", email).executeTakeFirst(), app());
    expect(mine).toMatchObject({ name: "Vi Sitor", is_new: true });
    const sub = await withTenant({ tenantId: A }, (tx) => tx.selectFrom("submissions").selectAll().where("contact_id", "=", mine!.id).executeTakeFirstOrThrow(), app());
    expect(sub).toMatchObject({ form_key: `page:${slug}`, form_type: "landing-page", status: "received" });
    expect(sub.fields).toEqual({ name: "Vi Sitor", email, message: "Pricing for 600 sq ft?" });
    const theirs = await withTenant({ tenantId: B }, (tx) => tx.selectFrom("contacts").select("id").where("email", "=", email).execute(), app());
    expect(theirs).toEqual([]);
  });

  it("keep bot sends as spam without making a contact", async () => {
    const { id, slug } = await createPage({ tenantId: A }, { title: "Spam check", doc, actor: "" }, app());
    await publishPage({ tenantId: A }, id, "x", app());
    const aSlug = await slugOf(A);
    const email = `bot-${Date.now()}@example.com`;
    expect(await submitPageForm(aSlug, slug, { formId: "form", fields: { email }, trap: "http://spam", elapsedMs: 5000 }, app())).toMatchObject({ ok: true });
    expect(await submitPageForm(aSlug, slug, { formId: "form", fields: { email }, elapsedMs: 200 }, app())).toMatchObject({ ok: true });
    const contacts = await withTenant({ tenantId: A }, (tx) => tx.selectFrom("contacts").select("id").where("email", "=", email).execute(), app());
    expect(contacts).toEqual([]);
    const spam = await withTenant({ tenantId: A }, (tx) => tx.selectFrom("submissions").select(["spam_reason"]).where("form_key", "=", `page:${slug}`).execute(), app());
    expect(spam.map((s) => s.spam_reason).sort()).toEqual(["hidden field filled", "sent too fast"]);
  });

  it("refuse bad input and pages that aren't live", async () => {
    const { id, slug } = await createPage({ tenantId: A }, { title: "Refuse check", doc, actor: "" }, app());
    const aSlug = await slugOf(A);
    expect(await submitPageForm(aSlug, slug, { formId: "form", fields: { email: "a@b.co" } }, app())).toMatchObject({ ok: false, status: 404 });
    await publishPage({ tenantId: A }, id, "x", app());
    expect(await submitPageForm(aSlug, slug, { formId: "nope", fields: { email: "a@b.co" } }, app())).toMatchObject({ ok: false, status: 400 });
    expect(await submitPageForm(aSlug, slug, { formId: "form", fields: { email: "not an email" } }, app())).toMatchObject({ ok: false, status: 400 });
  });
});
