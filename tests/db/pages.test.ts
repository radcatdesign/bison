// Landing pages in the database, as the real app role: each company's pages stay
// its own, only published pages are public, and form sends land in the right inbox.
import { afterAll, describe, expect, it } from "vitest";
import { withTenant } from "@/lib/db";
import {
  agentRunsThisMonth,
  createPage,
  startAgentRun,
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
import { formToken } from "@/lib/pages/form-token";
import { submitPageForm } from "@/lib/pages/submit";
import { starterSection } from "@/lib/pages/templates";
import { A, app, asOwner, B, pgCode, rawAsApp } from "./helpers";

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

  it("go offline when the company no longer has Marketing", async () => {
    const { id, slug } = await createPage({ tenantId: A }, { title: "Lapse check", doc, actor: "" }, app());
    await publishPage({ tenantId: A }, id, "x", app());
    const aSlug = await slugOf(A);
    expect(await getPublishedPage(aSlug, slug, app())).not.toBeNull();
    await asOwner((c) => c.query("update entitlements set ends_at = now() - interval '1 second' where tenant_id = $1 and item_key = 'module:marketing'", [A]));
    try {
      expect(await getPublishedPage(aSlug, slug, app())).toBeNull();
    } finally {
      await asOwner((c) => c.query("update entitlements set ends_at = null where tenant_id = $1 and item_key = 'module:marketing'", [A]));
    }
    expect(await getPublishedPage(aSlug, slug, app())).not.toBeNull();
  });
});

describe("agent runs", () => {
  it("are saved with the request on the page", async () => {
    const { id } = await createPage({ tenantId: B }, { title: "Agent check", doc, actor: "" }, app());
    await recordAgentRun({ tenantId: B }, id, { doc, instruction: "Make it dark", reply: "Done.", actor: "cora@ridgelineroasters.com" }, app());
    await expect(recordAgentRun({ tenantId: A }, id, { doc, instruction: "x", reply: "", actor: "" }, app())).rejects.toBeInstanceOf(PageInputError);
  });

  it("count toward the monthly limit when they start, per company, and deleting pages doesn't give them back", async () => {
    const { id } = await createPage({ tenantId: B }, { title: "Limit check", doc, actor: "" }, app());
    const used = await agentRunsThisMonth({ tenantId: B }, app());
    const usedA = await agentRunsThisMonth({ tenantId: A }, app());
    // Five at once against a limit of used + 3: exactly three get through.
    const results = await Promise.all(Array.from({ length: 5 }, () => startAgentRun({ tenantId: B }, { pageId: id, actor: "", limit: used + 3 }, app())));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(await agentRunsThisMonth({ tenantId: B }, app())).toBe(used + 3);
    expect(await agentRunsThisMonth({ tenantId: A }, app())).toBe(usedA);
    await deletePage({ tenantId: B }, id, app());
    expect(await agentRunsThisMonth({ tenantId: B }, app())).toBe(used + 3);
    // The app can't erase or edit usage.
    await expect(rawAsApp("delete from page_agent_runs", B)).rejects.toSatisfy((err) => pgCode(err) === "42501");
    await expect(rawAsApp("update page_agent_runs set created_at = now() - interval '2 months'", B)).rejects.toSatisfy((err) => pgCode(err) === "42501");
  });
});

describe("form sends from a published page", () => {
  it("land in that company's Contacts and nowhere else", async () => {
    const { id, slug } = await createPage({ tenantId: A }, { title: "Form check", doc, actor: "" }, app());
    await publishPage({ tenantId: A }, id, "x", app());
    const aSlug = await slugOf(A);
    const email = `visitor-${Date.now()}@example.com`;

    const ok = await submitPageForm(aSlug, slug, { formId: "form", fields: { name: "Vi Sitor", email: email.toUpperCase(), message: "Pricing for 600 sq ft?", company: "not on this form" }, token: formToken(id, Date.now() - 5000) }, app());
    expect(ok).toEqual({ ok: true, message: "Thanks. We'll email your quote within one business day.", tenantId: A, queued: false });

    const mine = await withTenant({ tenantId: A }, (tx) => tx.selectFrom("contacts").selectAll().where("email", "=", email).executeTakeFirst(), app());
    expect(mine).toMatchObject({ name: "Vi Sitor", is_new: true });
    const sub = await withTenant({ tenantId: A }, (tx) => tx.selectFrom("submissions").selectAll().where("contact_id", "=", mine!.id).executeTakeFirstOrThrow(), app());
    expect(sub).toMatchObject({ form_key: `page:${slug}`, form_type: "landing-page", status: "received" });
    expect(sub.fields).toEqual({ name: "Vi Sitor", email, message: "Pricing for 600 sq ft?" });
    const theirs = await withTenant({ tenantId: B }, (tx) => tx.selectFrom("contacts").select("id").where("email", "=", email).execute(), app());
    expect(theirs).toEqual([]);

    // A second send with the same email can't rename the contact the team already has.
    await submitPageForm(aSlug, slug, { formId: "form", fields: { name: "Someone Else", email, phone: "541 555 0100" }, token: formToken(id, Date.now() - 5000) }, app());
    const after = await withTenant({ tenantId: A }, (tx) => tx.selectFrom("contacts").select(["name", "phone"]).where("email", "=", email).executeTakeFirstOrThrow(), app());
    expect(after).toEqual({ name: "Vi Sitor", phone: "541 555 0100" });
  });

  it("keep bot sends as spam without making a contact", async () => {
    const { id, slug } = await createPage({ tenantId: A }, { title: "Spam check", doc, actor: "" }, app());
    await publishPage({ tenantId: A }, id, "x", app());
    const aSlug = await slugOf(A);
    const email = `bot-${Date.now()}@example.com`;
    const old = formToken(id, Date.now() - 5000);
    expect(await submitPageForm(aSlug, slug, { formId: "form", fields: { email }, trap: "http://spam", token: old }, app())).toMatchObject({ ok: true });
    expect(await submitPageForm(aSlug, slug, { formId: "form", fields: { email }, token: formToken(id) }, app())).toMatchObject({ ok: true });
    expect(await submitPageForm(aSlug, slug, { formId: "form", fields: { email } }, app())).toMatchObject({ ok: true });
    expect(await submitPageForm(aSlug, slug, { formId: "form", fields: { email }, token: formToken("someone-elses-page", Date.now() - 5000) }, app())).toMatchObject({ ok: true });
    expect(await submitPageForm(aSlug, slug, { formId: "form", fields: { email }, token: formToken(id, Date.now() - 2 * 86_400_000) }, app())).toMatchObject({ ok: true });
    const contacts = await withTenant({ tenantId: A }, (tx) => tx.selectFrom("contacts").select("id").where("email", "=", email).execute(), app());
    expect(contacts).toEqual([]);
    const spam = await withTenant({ tenantId: A }, (tx) => tx.selectFrom("submissions").select(["spam_reason"]).where("form_key", "=", `page:${slug}`).execute(), app());
    expect(spam.map((s) => s.spam_reason).sort()).toEqual(["form token expired", "hidden field filled", "no form token", "no form token", "sent too fast"]);
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

describe("signup forms on published pages", () => {
  it("add people to the email list with their I am a answer, and ignore made-up answers", async () => {
    const signupDoc = { ...doc, sections: doc.sections.map((s) => (s.type === "form" ? { ...s, fields: ["name", "email", "kind"] as typeof s.fields, subscribe: true } : s)) };
    const { id, slug } = await createPage({ tenantId: A }, { title: "Signup check", doc: signupDoc, actor: "" }, app());
    await publishPage({ tenantId: A }, id, "x", app());
    const aSlug = await slugOf(A);
    const email = `signup-${Date.now()}@example.com`;
    await submitPageForm(aSlug, slug, { formId: "form", fields: { name: "Sam Signup", email, kind: "homeowner" }, token: formToken(id, Date.now() - 5000) }, app());
    const sub = await withTenant({ tenantId: A }, (tx) => tx.selectFrom("subscribers").select(["name", "kind", "source", "source_detail"]).where("email", "=", email).executeTakeFirstOrThrow(), app());
    expect(sub).toEqual({ name: "Sam Signup", kind: "homeowner", source: "page", source_detail: `page:${slug}` });

    const other = `signup-odd-${Date.now()}@example.com`;
    await submitPageForm(aSlug, slug, { formId: "form", fields: { name: "Odd", email: other, kind: "astronaut" }, token: formToken(id, Date.now() - 5000) }, app());
    const odd = await withTenant({ tenantId: A }, (tx) => tx.selectFrom("subscribers").select("kind").where("email", "=", other).executeTakeFirstOrThrow(), app());
    expect(odd.kind).toBe("");
  });
});
