// A/B tests in the database, as the real app role: a test stays with its
// company, visitors see one version and keep seeing it, visits and goals count
// once a day, and ending a test puts the kept version live.
import { afterAll, describe, expect, it } from "vitest";
import { withTenant } from "@/lib/db";
import { applyOp } from "@/lib/pages/ops";
import { createPage, getPage, getPublishedPage, PageInputError, publishPage, saveDraft, unpublishPage } from "@/lib/pages/repo";
import { seedPageFor } from "@/lib/pages/seeds";
import { formToken } from "@/lib/pages/form-token";
import { submitPageForm } from "@/lib/pages/submit";
import {
  addVersion,
  createTest,
  dailyCounts,
  deleteTest,
  endTest,
  getTest,
  listTests,
  PageTestError,
  recordGoal,
  recordVisit,
  removeVersion,
  runPageTestWork,
  saveVersionDoc,
  serveVersion,
  startTest,
  updateTest,
  versionForEditing,
} from "@/lib/pages/tests";
import { A, app, asOwner, B, rawAsApp } from "./helpers";

const live = seedPageFor("pools").doc;
const headline = (text: string) => applyOp(live, { op: "update_section", id: "hero", changes: { headline: text } }).doc;
const browser = (n: number) => ({ ip: `203.0.113.${n}`, ua: `Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15 n${n}` });
const slugOf = (tenantId: string) => withTenant({ tenantId }, (tx) => tx.selectFrom("tenants").select("slug").executeTakeFirstOrThrow(), app()).then((r) => r.slug);

async function livePage(tenantId: string, title: string) {
  const page = await createPage({ tenantId }, { title, doc: live, actor: "" }, app());
  await publishPage({ tenantId }, page.id, "x", app());
  return page;
}

/** A test with B's headline changed, ready to start. */
async function readyTest(tenantId: string, title: string, goal: "form" | "click" = "form") {
  const page = await livePage(tenantId, title);
  const id = await createTest({ tenantId }, { pageId: page.id, name: `${title} test`, goal, hypothesis: "" }, "ada@brightwaterpools.com", app());
  const t = (await getTest({ tenantId }, id, app()))!;
  const b = t.versions.find((v) => v.key === "b")!;
  await saveVersionDoc({ tenantId }, b.id, headline("Glow that lasts all night, with no wiring"), app());
  return { page, id, aId: t.versions.find((v) => v.key === "a")!.id, bId: b.id };
}

afterAll(async () => {
  await app().destroy();
});

describe("setting up a test", () => {
  it("needs a live page, one open test per page, and B starts as a copy of the page", async () => {
    const draft = await createPage({ tenantId: A }, { title: "Not live yet", doc: live, actor: "" }, app());
    await expect(createTest({ tenantId: A }, { pageId: draft.id, name: "x", goal: "form", hypothesis: "" }, "", app())).rejects.toThrow(/Publish the page first/);

    const page = await livePage(A, "Setup check");
    const id = await createTest({ tenantId: A }, { pageId: page.id, name: "Shorter headline", goal: "form", hypothesis: "Price up front" }, "", app());
    await expect(createTest({ tenantId: A }, { pageId: page.id, name: "Again", goal: "form", hypothesis: "" }, "", app())).rejects.toThrow(/already has a test/);
    const t = (await getTest({ tenantId: A }, id, app()))!;
    expect(t.versions.map((v) => [v.key, v.weight])).toEqual([
      ["a", 50],
      ["b", 50],
    ]);
    expect(t.versions[1].doc).toEqual(live);
    // Until it starts, A is whatever's live.
    expect(t.versions[0].doc).toEqual(live);
  });

  it("adds and removes C, keeping the split even and the keys in order", async () => {
    const { id, bId } = await readyTest(A, "Versions check");
    const cId = await addVersion({ tenantId: A }, id, app());
    expect((await getTest({ tenantId: A }, id, app()))!.versions.map((v) => [v.key, v.weight])).toEqual([
      ["a", 34],
      ["b", 33],
      ["c", 33],
    ]);
    await expect(addVersion({ tenantId: A }, id, app())).rejects.toThrow(/up to 3 versions/);
    await removeVersion({ tenantId: A }, bId, app());
    const t = (await getTest({ tenantId: A }, id, app()))!;
    expect(t.versions.map((v) => [v.id, v.key, v.weight])).toEqual([
      [t.versions[0].id, "a", 50],
      [cId, "b", 50],
    ]);
    await expect(removeVersion({ tenantId: A }, cId, app())).rejects.toThrow(/at least one version/);
    await expect(removeVersion({ tenantId: A }, t.versions[0].id, app())).rejects.toBeInstanceOf(PageTestError);
  });

  it("checks the split adds up and gives every version at least 10%", async () => {
    const { id, aId, bId } = await readyTest(A, "Split check");
    await expect(updateTest({ tenantId: A }, id, { weights: { [aId]: 60, [bId]: 30 } }, app())).rejects.toThrow(/add up to 100/);
    await expect(updateTest({ tenantId: A }, id, { weights: { [aId]: 95, [bId]: 5 } }, app())).rejects.toThrow(/at least 10%/);
    await updateTest({ tenantId: A }, id, { weights: { [aId]: 70, [bId]: 30 }, versionNames: { [bId]: "Says what you get", [aId]: "ignored" }, goal: "click" }, app());
    const t = (await getTest({ tenantId: A }, id, app()))!;
    expect(t.versions.map((v) => [v.key, v.weight, v.name])).toEqual([
      ["a", 70, "The live page"],
      ["b", 30, "Says what you get"],
    ]);
    expect(t.goal).toBe("click");
  });

  it("won't start while B is the same as the page or has placeholders", async () => {
    const page = await livePage(A, "Start check");
    const id = await createTest({ tenantId: A }, { pageId: page.id, name: "Same", goal: "form", hypothesis: "" }, "", app());
    await expect(startTest({ tenantId: A }, id, "", app())).rejects.toThrow(/B is the same as the live page/);
    const b = (await getTest({ tenantId: A }, id, app()))!.versions[1];
    await saveVersionDoc({ tenantId: A }, b.id, headline("[Add a headline]"), app());
    await expect(startTest({ tenantId: A }, id, "", app())).rejects.toThrow(/Fill in the yellow spots on B/);
  });

  it("stays with its company", async () => {
    const { id, bId, page } = await readyTest(A, "Isolation check");
    expect(await getTest({ tenantId: B }, id, app())).toBeNull();
    expect((await listTests({ tenantId: B }, app())).map((t) => t.id)).not.toContain(id);
    expect(await versionForEditing({ tenantId: B }, bId, app())).toBeNull();
    await expect(saveVersionDoc({ tenantId: B }, bId, live, app())).rejects.toBeInstanceOf(PageTestError);
    await expect(createTest({ tenantId: B }, { pageId: page.id, name: "x", goal: "form", hypothesis: "" }, "", app())).rejects.toThrow(/isn't here anymore/);
    await deleteTest({ tenantId: B }, id, app());
    expect(await getTest({ tenantId: A }, id, app())).not.toBeNull();
    expect(await rawAsApp(`select id from page_test_versions where test_id = '${id}'`, B)).toEqual([]);
  });
});

describe("a running test", () => {
  it("shows each visitor one version, the same one every time, and counts them once a day", async () => {
    const { id, page } = await readyTest(A, "Serving check");
    // Before it starts, everyone sees the page.
    expect((await serveVersion(A, page.id, live, browser(1), app())).test).toBeNull();
    await startTest({ tenantId: A }, id, "ada@brightwaterpools.com", app());

    const seen = new Map<string, number>();
    for (let n = 1; n <= 40; n++) {
      const who = browser(n);
      const first = await serveVersion(A, page.id, live, who, app());
      const again = await serveVersion(A, page.id, live, who, app());
      expect(again.test?.versionId).toBe(first.test?.versionId);
      seen.set(first.test!.key, (seen.get(first.test!.key) ?? 0) + 1);
      await recordVisit(A, first.test!, who, app());
      await recordVisit(A, first.test!, who, app());
      if (first.test!.key === "b") expect(first.doc.sections[0].type === "hero" && first.doc.sections[0].headline).toBe("Glow that lasts all night, with no wiring");
    }
    expect(seen.get("a")).toBeGreaterThan(5);
    expect(seen.get("b")).toBeGreaterThan(5);
    const t = (await getTest({ tenantId: A }, id, app()))!;
    expect(t.versions.reduce((n, v) => n + v.visitors, 0)).toBe(40);

    // Bots see a version but aren't counted.
    const bot = { ip: "198.51.100.7", ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" };
    const served = await serveVersion(A, page.id, live, bot, app());
    await recordVisit(A, served.test!, bot, app());
    expect((await getTest({ tenantId: A }, id, app()))!.versions.reduce((n, v) => n + v.visitors, 0)).toBe(40);
    expect((await dailyCounts({ tenantId: A }, id, app())).reduce((n, d) => n + d.visitors, 0)).toBe(40);

    // Visitors are a daily hash; nothing about them is kept as typed.
    const rows = await rawAsApp<{ visitor: string }>(`select visitor from page_test_visits where test_id = '${id}'`, A);
    expect(rows.every((r) => !r.visitor.includes("203.0.113") && r.visitor.length === 32)).toBe(true);
  });

  it("counts a form send for the version they saw, once a day, and checks the form against that version", async () => {
    const { id, page, bId } = await readyTest(A, "Form goal check");
    // B asks for a company too, so its form differs from the live page's.
    const t0 = (await getTest({ tenantId: A }, id, app()))!;
    const bDoc = applyOp(t0.versions[1].doc!, { op: "update_section", id: "form", changes: { fields: ["name", "email", "company"] } }).doc;
    await saveVersionDoc({ tenantId: A }, bId, bDoc, app());
    await startTest({ tenantId: A }, id, "", app());

    let who = browser(100);
    let served = await serveVersion(A, page.id, live, who, app());
    for (let n = 101; served.test?.key !== "b"; n++) {
      who = browser(n);
      served = await serveVersion(A, page.id, live, who, app());
    }
    await recordVisit(A, served.test!, who, app());
    const aSlug = await slugOf(A);
    const sent = await submitPageForm(aSlug, page.slug, { formId: "form", fields: { email: "pat@example.com", company: "Pat's Pools" }, token: formToken(page.id, Date.now() - 5000), version: bId }, app());
    expect(sent).toMatchObject({ ok: true, spam: false, pageId: page.id });
    const rows = await rawAsApp<{ fields: { company?: string } }>(`select fields from submissions where fields->>'email' = 'pat@example.com' order by created_at desc limit 1`, A);
    expect(rows[0].fields.company).toBe("Pat's Pools");

    expect(await recordGoal(A, page.id, "form", bId, who, app())).toBe(true);
    expect(await recordGoal(A, page.id, "form", bId, who, app())).toBe(true);
    // Wrong kind, or a version from somewhere else, doesn't count.
    expect(await recordGoal(A, page.id, "click", bId, who, app())).toBe(false);
    expect(await recordGoal(A, page.id, "form", "00000000-0000-4000-8000-000000000000", who, app())).toBe(false);
    const b = (await getTest({ tenantId: A }, id, app()))!.versions.find((v) => v.key === "b")!;
    expect([b.visitors, b.conversions]).toEqual([1, 1]);
    // The goal is stored as a yes for the day, never a time that could be matched to the form send.
    const cols = await rawAsApp<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'page_test_visits'`);
    expect(cols.map((c) => c.column_name).sort()).toEqual(["converted", "day", "tenant_id", "test_id", "version_id", "visitor"]);
  });

  it("can't be given goals from outside: no visit, the wrong version, or a test that ended", async () => {
    const { id, page, aId, bId } = await readyTest(A, "Forged goal check");
    await startTest({ tenantId: A }, id, "", app());
    // Someone who never opened the page can't add a conversion.
    expect(await recordGoal(A, page.id, "form", bId, browser(150), app())).toBe(false);
    expect(await recordGoal(A, page.id, "form", aId, browser(150), app())).toBe(false);
    // Someone who did can't credit the version they weren't shown.
    const who = browser(151);
    const served = await serveVersion(A, page.id, live, who, app());
    await recordVisit(A, served.test!, who, app());
    const other = served.test!.versionId === aId ? bId : aId;
    expect(await recordGoal(A, page.id, "form", other, who, app())).toBe(false);
    expect(await recordGoal(A, page.id, "form", served.test!.versionId, who, app())).toBe(true);
    // A visit sent after the test ended isn't added to it.
    await endTest({ tenantId: A }, id, null, "", "team", app());
    await recordVisit(A, served.test!, browser(152), app());
    const t = (await getTest({ tenantId: A }, id, app()))!;
    expect(t.versions.reduce((n, v) => n + v.visitors, 0)).toBe(1);
    expect(t.versions.reduce((n, v) => n + v.conversions, 0)).toBe(1);
  });

  it("counts a button click on a test that counts clicks", async () => {
    const { id, page } = await readyTest(A, "Click goal check", "click");
    await startTest({ tenantId: A }, id, "", app());
    const who = browser(170);
    const served = await serveVersion(A, page.id, live, who, app());
    await recordVisit(A, served.test!, who, app());
    expect(await recordGoal(A, page.id, "form", served.test!.versionId, who, app())).toBe(false);
    expect(await recordGoal(A, page.id, "click", served.test!.versionId, who, app())).toBe(true);
    expect((await getTest({ tenantId: A }, id, app()))!.versions.reduce((n, v) => n + v.conversions, 0)).toBe(1);
  });

  it("keeps each company's daily salts for two days at most", async () => {
    const { id, page } = await readyTest(B, "Salt check");
    await startTest({ tenantId: B }, id, "", app());
    const who = browser(160);
    const served = await serveVersion(B, page.id, live, who, app());
    await recordVisit(B, served.test!, who, app());
    await asOwner((c) => c.query("insert into page_test_salts (tenant_id, day, salt) values ($1, current_date - 5, decode(repeat('ab', 32), 'hex'))", [B]));
    await runPageTestWork({}, app());
    const days = await rawAsApp<{ age: number }>(`select current_date - day as age from page_test_salts`, B);
    expect(days.length).toBeGreaterThan(0);
    expect(days.every((d) => d.age <= 1)).toBe(true);
    expect(await rawAsApp(`select 1 from page_test_salts`, A).then((r) => r.length)).toBeLessThanOrEqual(2);
    await endTest({ tenantId: B }, id, null, "", "team", app());
  });

  it("locks the versions and the page while it runs", async () => {
    const { id, page, bId, aId } = await readyTest(A, "Lock check");
    await startTest({ tenantId: A }, id, "", app());
    await expect(saveVersionDoc({ tenantId: A }, bId, live, app())).rejects.toThrow(/locked/);
    await expect(updateTest({ tenantId: A }, id, { weights: { [aId]: 60, [bId]: 40 } }, app())).rejects.toThrow(/split can't change/);
    await expect(updateTest({ tenantId: A }, id, { goal: "click" }, app())).rejects.toThrow(/can't change once it's running/);
    await updateTest({ tenantId: A }, id, { autoEnd: true, name: "Renamed while running" }, app());
    await saveDraft({ tenantId: A }, page.id, headline("Edited during the test"), app());
    await expect(publishPage({ tenantId: A }, page.id, "x", app())).rejects.toThrow(/End the test first/);
    await expect(publishPage({ tenantId: A }, page.id, "x", app())).rejects.toBeInstanceOf(PageInputError);
    await expect(deleteTest({ tenantId: A }, id, app())).rejects.toThrow(/End the test/);
  });

  it("can only run five at once per company", async () => {
    const tests = await Promise.all(Array.from({ length: 6 }, (_, i) => readyTest(B, `Limit check ${i}`)));
    const running = Number((await rawAsApp<{ n: string }>(`select count(*) as n from page_tests where status = 'running'`, B))[0].n);
    const results = await Promise.allSettled(tests.map((t) => startTest({ tenantId: B }, t.id, "", app())));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(Math.max(0, 5 - running));
    for (const r of results) if (r.status === "rejected") expect(String(r.reason)).toMatch(/run 5 tests at once/);
    for (const t of tests) {
      const got = (await getTest({ tenantId: B }, t.id, app()))!;
      if (got.status === "running") await endTest({ tenantId: B }, t.id, null, "", "team", app());
    }
  });
});

describe("ending a test", () => {
  it("keeping B publishes it, and the draft takes it too when it has nothing new", async () => {
    const { id, page, bId } = await readyTest(A, "Keep B check");
    await startTest({ tenantId: A }, id, "", app());
    const r = await endTest({ tenantId: A }, id, bId, "ada@brightwaterpools.com", "team", app());
    expect(r).toEqual({ kept: "b", published: true, draftKept: false });
    const shown = await getPublishedPage(await slugOf(A), page.slug, app());
    expect(shown?.doc.sections[0].type === "hero" && shown.doc.sections[0].headline).toBe("Glow that lasts all night, with no wiring");
    expect((await getPage({ tenantId: A }, page.id, app()))?.status).toBe("published");
    const t = (await getTest({ tenantId: A }, id, app()))!;
    expect(t).toMatchObject({ status: "ended", endReason: "team", keptVersionId: bId });
    // Everyone sees the page now.
    expect((await serveVersion(A, page.id, shown!.doc, browser(9), app())).test).toBeNull();
  });

  it("leaves a draft with unpublished changes alone", async () => {
    const { id, page, bId } = await readyTest(A, "Draft kept check");
    await startTest({ tenantId: A }, id, "", app());
    await saveDraft({ tenantId: A }, page.id, headline("Something new in the draft"), app());
    expect(await endTest({ tenantId: A }, id, bId, "", "team", app())).toMatchObject({ kept: "b", published: true, draftKept: true });
    const p = (await getPage({ tenantId: A }, page.id, app()))!;
    expect(p.doc.sections[0].type === "hero" && p.doc.sections[0].headline).toBe("Something new in the draft");
    expect(p.status).toBe("changed");
  });

  it("keeps the counts after the visit rows are cleared", async () => {
    const { id, page } = await readyTest(A, "Totals check");
    await startTest({ tenantId: A }, id, "", app());
    for (let n = 1; n <= 6; n++) {
      const who = browser(200 + n);
      const s = await serveVersion(A, page.id, live, who, app());
      await recordVisit(A, s.test!, who, app());
    }
    await endTest({ tenantId: A }, id, null, "", "team", app());
    await asOwner((c) => c.query("update page_tests set ended_at = now() - interval '31 days' where id = $1", [id]));
    await runPageTestWork({}, app());
    expect(await rawAsApp(`select 1 from page_test_visits where test_id = '${id}'`, A)).toEqual([]);
    const t = (await getTest({ tenantId: A }, id, app()))!;
    expect(t.versions.reduce((n, v) => n + v.visitors, 0)).toBe(6);
  });

  it("ends on its own, keeping A, when the page goes offline", async () => {
    const { id, page } = await readyTest(A, "Offline check");
    await startTest({ tenantId: A }, id, "", app());
    await unpublishPage({ tenantId: A }, page.id, app());
    const t = (await getTest({ tenantId: A }, id, app()))!;
    expect(t).toMatchObject({ status: "ended", endReason: "unpublished" });
    expect(t.versions.find((v) => v.id === t.keptVersionId)?.key).toBe("a");
  });

  it("ends on its own with a clear winner when it's set to, after a week", async () => {
    const { id, page, bId, aId } = await readyTest(A, "Auto end check");
    await updateTest({ tenantId: A }, id, { autoEnd: true }, app());
    await startTest({ tenantId: A }, id, "", app());
    // 300 visitors on each version: 6 sends on A, 45 on B, across the last 8 days.
    await asOwner(async (c) => {
      await c.query("update page_tests set started_at = now() - interval '8 days' where id = $1", [id]);
      for (const [vid, sends] of [
        [aId, 6],
        [bId, 45],
      ] as const) {
        await c.query(
          `insert into page_test_visits (tenant_id, test_id, version_id, day, visitor, converted)
           select $1, $2, $3::uuid, current_date - (g % 8), md5($3::text || g::text), g <= $4
           from generate_series(1, 300) g`,
          [A, id, vid, sends],
        );
      }
    });
    // The every-few-minutes job never ends a test on its own; the daily one does.
    expect((await runPageTestWork({}, app())).ended).toBe(0);
    expect((await getTest({ tenantId: A }, id, app()))!.status).toBe("running");
    const r = await runPageTestWork({ autoEnd: true }, app());
    expect(r.ended).toBeGreaterThanOrEqual(1);
    const t = (await getTest({ tenantId: A }, id, app()))!;
    expect(t).toMatchObject({ status: "ended", endReason: "winner", keptVersionId: bId });
    const shown = await getPublishedPage(await slugOf(A), page.slug, app());
    expect(shown?.doc.sections[0].type === "hero" && shown.doc.sections[0].headline).toBe("Glow that lasts all night, with no wiring");
  });
});
