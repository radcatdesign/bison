import "server-only";
// A/B tests on landing pages, in the database. A test belongs to one page.
// A is the live page (copied when the test starts, so it holds still); B and C
// are copies the team edits. While a test runs, each visitor sees one version,
// picked from a keyed hash of their network address and browser, and the same
// one every time they come back from there. No cookie is set.
//
// Tests are content: they save with sample data on or off. Their results are
// data, so sample mode shows made-up results (src/lib/sample/page-tests.ts).
import { createHmac, randomBytes } from "node:crypto";
import { sql } from "kysely";
import { CATALOG } from "@/config/catalog";
import { audit } from "@/lib/audit";
import { type Database, db, isUuid, type TenantScope, type Tx, withTenant } from "@/lib/db";
import type { PageTestEndReason, PageTestGoal, PageTestStatus } from "@/lib/db/types";
import { parseKeyring } from "@/lib/crypto/secrets";
import { ipFrom } from "@/lib/rate-limit";
import { findPlaceholders, type PageDoc, pageDocSchema } from "./schema";
import { type Counts, earlierTotals, evenWeights, isBot, MIN_DAYS, pickVersion, results, verdict, type VersionKey } from "./test-stats";

export class PageTestError extends Error {}

export const MAX_VERSIONS = 3;
export const runningLimit = () => CATALOG["module:marketing"].limits.runningPageTests ?? 5;
/** Visit rows are cleared this long after a test ends. The totals stay. */
export const KEEP_VISITS_DAYS = 30;

export type TestVersion = { id: string; key: VersionKey; name: string; weight: number; doc: PageDoc | null; visitors: number; conversions: number; /** When B or C was copied from the live page. */ copiedAt?: Date };
export type PageTest = {
  id: string;
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  pageLive: boolean;
  /** When the page was last published. A version copied before then is missing those changes. */
  pagePublishedAt?: Date | null;
  name: string;
  hypothesis: string;
  goal: PageTestGoal;
  status: PageTestStatus;
  autoEnd: boolean;
  startedAt: Date | null;
  endedAt: Date | null;
  endReason: PageTestEndReason;
  keptVersionId: string | null;
  createdBy: string;
  createdAt: Date;
  versions: TestVersion[];
};
export type TestRow = Omit<PageTest, "versions" | "hypothesis" | "createdBy"> & { versions: Omit<TestVersion, "doc">[] };
export type DayCount = { day: string; key: VersionKey; visitors: number; conversions: number };

function readDoc(v: unknown): PageDoc | null {
  if (v === null || v === undefined) return null;
  const parsed = pageDocSchema.safeParse(typeof v === "string" ? JSON.parse(v) : v);
  return parsed.success ? parsed.data : null;
}

/** Which day of the test it is, counting today as one: day 1 is the day it started. */
export const daysRunning = (t: { startedAt: Date | null; endedAt: Date | null }, now = Date.now()) => (t.startedAt ? Math.max(1, Math.ceil(((t.endedAt?.getTime() ?? now) - t.startedAt.getTime()) / 86_400_000)) : 0);

/** Full days since it started (or until it ended). What the verdict counts, so six days and an hour isn't a week. */
export const fullDays = (t: { startedAt: Date | null; endedAt: Date | null }, now = Date.now()) => (t.startedAt ? Math.max(0, Math.floor(((t.endedAt?.getTime() ?? now) - t.startedAt.getTime()) / 86_400_000)) : 0);

// ---- Reading -----------------------------------------------------------------------

/** Live counts for running tests; the totals saved at the end for ended ones. */
async function counts(tx: Tx, testIds: string[]): Promise<Map<string, { visitors: number; conversions: number }>> {
  const out = new Map<string, { visitors: number; conversions: number }>();
  if (!testIds.length) return out;
  const rows = await tx
    .selectFrom("page_test_visits")
    .select(["version_id", sql<number>`count(*)::int`.as("visitors"), sql<number>`count(*) filter (where converted)::int`.as("conversions")])
    .where("test_id", "in", testIds)
    .groupBy("version_id")
    .execute();
  for (const r of rows) out.set(r.version_id, { visitors: r.visitors, conversions: r.conversions });
  return out;
}

async function loadTests(tx: Tx, where: { id?: string; pageId?: string }): Promise<PageTest[]> {
  let q = tx
    .selectFrom("page_tests as t")
    .innerJoin("pages as p", (j) => j.onRef("p.id", "=", "t.page_id").onRef("p.tenant_id", "=", "t.tenant_id"))
    .select(["t.id", "t.page_id", "t.name", "t.hypothesis", "t.goal", "t.status", "t.auto_end", "t.started_at", "t.ended_at", "t.end_reason", "t.kept_variant_id", "t.created_by", "t.created_at", "p.title", "p.slug", "p.published_at", "p.published_doc"])
    .orderBy("t.created_at", "desc")
    .limit(200);
  if (where.id) q = q.where("t.id", "=", where.id);
  if (where.pageId) q = q.where("t.page_id", "=", where.pageId);
  const tests = await q.execute();
  if (!tests.length) return [];
  const ids = tests.map((t) => t.id);
  const versions = await tx.selectFrom("page_test_versions").selectAll().where("test_id", "in", ids).orderBy("key").execute();
  const live = await counts(
    tx,
    tests.filter((t) => t.status === "running").map((t) => t.id),
  );
  return tests.map((t) => ({
    id: t.id,
    pageId: t.page_id,
    pageTitle: t.title,
    pageSlug: t.slug,
    pageLive: Boolean(t.published_at),
    pagePublishedAt: t.published_at,
    name: t.name,
    hypothesis: t.hypothesis,
    goal: t.goal,
    status: t.status,
    autoEnd: t.auto_end,
    startedAt: t.started_at,
    endedAt: t.ended_at,
    endReason: t.end_reason,
    keptVersionId: t.kept_variant_id,
    createdBy: t.created_by,
    createdAt: t.created_at,
    versions: versions
      .filter((v) => v.test_id === t.id)
      .map((v) => {
        // Ended tests use the totals saved on the version when they ended, so they outlive the visit rows.
        const c = t.status === "ended" ? { visitors: v.visitors, conversions: v.conversions } : (live.get(v.id) ?? { visitors: 0, conversions: 0 });
        // Until a test starts, A is whatever's live now.
        const doc = v.key === "a" && t.status === "draft" ? readDoc(t.published_doc) : readDoc(v.doc);
        return { id: v.id, key: v.key, name: v.name, weight: v.weight, doc, copiedAt: v.created_at, ...c };
      }),
  }));
}

export async function listTests(scope: TenantScope, database?: Database): Promise<TestRow[]> {
  const all = await withTenant(scope, (tx) => loadTests(tx, {}), database);
  return all.map((t) => ({
    id: t.id,
    pageId: t.pageId,
    pageTitle: t.pageTitle,
    pageSlug: t.pageSlug,
    pageLive: t.pageLive,
    name: t.name,
    goal: t.goal,
    status: t.status,
    autoEnd: t.autoEnd,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
    endReason: t.endReason,
    keptVersionId: t.keptVersionId,
    createdAt: t.createdAt,
    versions: t.versions.map((v) => ({ id: v.id, key: v.key, name: v.name, weight: v.weight, visitors: v.visitors, conversions: v.conversions })),
  }));
}

export async function getTest(scope: TenantScope, id: string, database?: Database): Promise<PageTest | null> {
  if (!isUuid(id)) return null;
  return (await withTenant(scope, (tx) => loadTests(tx, { id }), database))[0] ?? null;
}

/** The test on a page that hasn't ended, if any. */
export async function openTestFor(scope: TenantScope, pageId: string, database?: Database): Promise<{ id: string; status: PageTestStatus; name: string } | null> {
  if (!isUuid(pageId)) return null;
  return (await withTenant(scope, (tx) => tx.selectFrom("page_tests").select(["id", "status", "name"]).where("page_id", "=", pageId).where("status", "in", ["draft", "running"]).executeTakeFirst(), database)) ?? null;
}

/** Daily counts for several tests at once, by test. */
export async function dailyCountsFor(scope: TenantScope, ids: string[], database?: Database): Promise<Map<string, DayCount[]>> {
  const out = new Map<string, DayCount[]>(ids.map((id) => [id, []]));
  const valid = ids.filter(isUuid);
  if (!valid.length) return out;
  const rows = await withTenant(
    scope,
    (tx) =>
      tx
        .selectFrom("page_test_visits as v")
        .innerJoin("page_test_versions as x", (j) => j.onRef("x.id", "=", "v.version_id").onRef("x.tenant_id", "=", "v.tenant_id"))
        .select(["v.test_id", "v.day", "x.key", sql<number>`count(*)::int`.as("visitors"), sql<number>`count(*) filter (where v.converted)::int`.as("conversions")])
        .where("v.test_id", "in", valid)
        .groupBy(["v.test_id", "v.day", "x.key"])
        .orderBy("v.day")
        .execute(),
    database,
  );
  for (const r of rows) out.get(r.test_id)?.push({ day: String(r.day), key: r.key, visitors: r.visitors, conversions: r.conversions });
  return out;
}

export async function dailyCounts(scope: TenantScope, id: string, database?: Database): Promise<DayCount[]> {
  if (!isUuid(id)) return [];
  const rows = await withTenant(
    scope,
    (tx) =>
      tx
        .selectFrom("page_test_visits as v")
        .innerJoin("page_test_versions as x", (j) => j.onRef("x.id", "=", "v.version_id").onRef("x.tenant_id", "=", "v.tenant_id"))
        .select(["v.day", "x.key", sql<number>`count(*)::int`.as("visitors"), sql<number>`count(*) filter (where v.converted)::int`.as("conversions")])
        .where("v.test_id", "=", id)
        .groupBy(["v.day", "x.key"])
        .orderBy("v.day")
        .execute(),
    database,
  );
  return rows.map((r) => ({ day: String(r.day), key: r.key, visitors: r.visitors, conversions: r.conversions }));
}

/** A version to edit, with its test and page. Only B and C of a test that hasn't started. */
export async function versionForEditing(scope: TenantScope, versionId: string, database?: Database) {
  if (!isUuid(versionId)) return null;
  return withTenant(
    scope,
    async (tx) => {
      const v = await tx
        .selectFrom("page_test_versions as v")
        .innerJoin("page_tests as t", (j) => j.onRef("t.id", "=", "v.test_id").onRef("t.tenant_id", "=", "v.tenant_id"))
        .innerJoin("pages as p", (j) => j.onRef("p.id", "=", "t.page_id").onRef("p.tenant_id", "=", "t.tenant_id"))
        .select(["v.id", "v.key", "v.doc", "v.updated_at", "t.id as test_id", "t.name as test_name", "t.status", "t.page_id", "p.title", "p.slug"])
        .where("v.id", "=", versionId)
        .executeTakeFirst();
      if (!v || v.key === "a") return null;
      const doc = readDoc(v.doc);
      if (!doc) return null;
      return { id: v.id, key: v.key, doc, testId: v.test_id, testName: v.test_name, status: v.status, pageId: v.page_id, pageTitle: v.title, pageSlug: v.slug };
    },
    database,
  );
}

// ---- Changing --------------------------------------------------------------------

/** Locks the page row. Everything that changes a page and its test locks the page first, then the test, so two of them can't deadlock. */
async function lockPage(tx: Tx, pageId: string) {
  await tx.selectFrom("pages").select("id").where("id", "=", pageId).forUpdate().executeTakeFirst();
}

async function lockedTest(tx: Tx, id: string) {
  const t = await tx.selectFrom("page_tests").selectAll().where("id", "=", id).forUpdate().executeTakeFirst();
  if (!t) throw new PageTestError("That test isn't here anymore.");
  return t;
}

async function liveDoc(tx: Tx, pageId: string): Promise<PageDoc> {
  const p = await tx.selectFrom("pages").select(["published_doc"]).where("id", "=", pageId).executeTakeFirst();
  const doc = readDoc(p?.published_doc);
  if (!doc) throw new PageTestError("Publish the page first. A test needs a live page to compare against.");
  return doc;
}

async function respread(tx: Tx, testId: string) {
  const vs = await tx.selectFrom("page_test_versions").select(["id"]).where("test_id", "=", testId).orderBy("key").execute();
  const w = evenWeights(vs.length);
  for (const [i, v] of vs.entries()) await tx.updateTable("page_test_versions").set({ weight: w[i] }).where("id", "=", v.id).execute();
}

export type NewTest = { pageId: string; name: string; goal: PageTestGoal; hypothesis: string };

/** A new test on a live page, with B as a copy of it to change. */
export async function createTest(scope: TenantScope, input: NewTest, actor: string, database?: Database): Promise<string> {
  if (!isUuid(input.pageId)) throw new PageTestError("Pick a page to test.");
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new PageTestError("Name the test, like \"Shorter headline\".");
  return withTenant(
    scope,
    async (tx) => {
      const page = await tx.selectFrom("pages").select(["id", "slug"]).where("id", "=", input.pageId).executeTakeFirst();
      if (!page) throw new PageTestError("That page isn't here anymore.");
      const doc = await liveDoc(tx, page.id);
      const open = await tx.selectFrom("page_tests").select("name").where("page_id", "=", page.id).where("status", "in", ["draft", "running"]).executeTakeFirst();
      if (open) throw new PageTestError(`This page already has a test, "${open.name}". End it or delete it first.`);
      const t = await tx
        .insertInto("page_tests")
        .values({ page_id: page.id, name, goal: input.goal === "click" ? "click" : "form", hypothesis: input.hypothesis.trim().slice(0, 1000), created_by: actor })
        .returning("id")
        .executeTakeFirstOrThrow();
      await tx.insertInto("page_test_versions").values({ test_id: t.id, key: "a", name: "The live page", weight: 50 }).execute();
      await tx.insertInto("page_test_versions").values({ test_id: t.id, key: "b", name: "", doc: JSON.stringify(doc), weight: 50 }).execute();
      await audit(tx, { action: "page_test.created", targetType: "page_test", targetId: t.id, detail: { page: page.slug } });
      return t.id;
    },
    database,
  );
}

export async function addVersion(scope: TenantScope, testId: string, database?: Database): Promise<string> {
  return withTenant(
    scope,
    async (tx) => {
      const t = await lockedTest(tx, testId);
      if (t.status !== "draft") throw new PageTestError("Versions can only be added before the test starts.");
      const have = await tx.selectFrom("page_test_versions").select(["key"]).where("test_id", "=", testId).execute();
      if (have.length >= MAX_VERSIONS) throw new PageTestError(`A test can have up to ${MAX_VERSIONS} versions. More splits the visitors too thin to learn anything.`);
      const key = (["b", "c"] as const).find((k) => !have.some((h) => h.key === k))!;
      const v = await tx.insertInto("page_test_versions").values({ test_id: testId, key, doc: JSON.stringify(await liveDoc(tx, t.page_id)), weight: 0 }).returning("id").executeTakeFirstOrThrow();
      await respread(tx, testId);
      return v.id;
    },
    database,
  );
}

export async function removeVersion(scope: TenantScope, versionId: string, database?: Database): Promise<void> {
  if (!isUuid(versionId)) throw new PageTestError("That version isn't here anymore.");
  await withTenant(
    scope,
    async (tx) => {
      const v = await tx.selectFrom("page_test_versions").select(["test_id", "key"]).where("id", "=", versionId).executeTakeFirst();
      if (!v) throw new PageTestError("That version isn't here anymore.");
      const t = await lockedTest(tx, v.test_id);
      if (t.status !== "draft") throw new PageTestError("Versions can only be removed before the test starts.");
      if (v.key === "a") throw new PageTestError("A is the live page. It stays in every test.");
      const n = await tx.selectFrom("page_test_versions").select(sql<number>`count(*)::int`.as("n")).where("test_id", "=", v.test_id).executeTakeFirstOrThrow();
      if (n.n <= 2) throw new PageTestError("A test needs at least one version to compare with A.");
      await tx.deleteFrom("page_test_versions").where("id", "=", versionId).execute();
      // Keep keys in order: if B goes, C becomes B.
      await tx.updateTable("page_test_versions").set({ key: "b" }).where("test_id", "=", v.test_id).where("key", "=", "c").execute();
      await respread(tx, v.test_id);
    },
    database,
  );
}

export type TestChanges = { name?: string; hypothesis?: string; goal?: PageTestGoal; autoEnd?: boolean; weights?: Record<string, number>; versionNames?: Record<string, string> };

export async function updateTest(scope: TenantScope, id: string, ch: TestChanges, database?: Database): Promise<void> {
  if (!isUuid(id)) throw new PageTestError("That test isn't here anymore.");
  await withTenant(
    scope,
    async (tx) => {
      const t = await lockedTest(tx, id);
      if (t.status === "ended") throw new PageTestError("This test has ended. Start a new one to test something else.");
      const draft = t.status === "draft";
      const set: { name?: string; hypothesis?: string; goal?: PageTestGoal; auto_end?: boolean } = {};
      if (ch.name !== undefined) {
        const name = ch.name.trim().slice(0, 120);
        if (!name) throw new PageTestError("Name the test.");
        set.name = name;
      }
      if (ch.hypothesis !== undefined) set.hypothesis = ch.hypothesis.trim().slice(0, 1000);
      if (ch.autoEnd !== undefined) set.auto_end = Boolean(ch.autoEnd);
      if (ch.goal !== undefined) {
        if (!draft && ch.goal !== t.goal) throw new PageTestError("What the test counts can't change once it's running. It would mix two kinds of results.");
        set.goal = ch.goal === "click" ? "click" : "form";
      }
      if (Object.keys(set).length) await tx.updateTable("page_tests").set(set).where("id", "=", id).execute();
      if (ch.weights) {
        if (!draft) throw new PageTestError("The split can't change once the test is running.");
        const vs = await tx.selectFrom("page_test_versions").select(["id"]).where("test_id", "=", id).execute();
        const w = vs.map((v) => Math.round(Number(ch.weights![v.id])));
        if (w.some((x) => !Number.isFinite(x) || x < 0 || x > 100) || w.reduce((a, b) => a + b, 0) !== 100) throw new PageTestError("The split has to add up to 100%.");
        if (w.some((x) => x < 10)) throw new PageTestError("Give every version at least 10% of visitors, or it'll take months to learn anything.");
        for (const [i, v] of vs.entries()) await tx.updateTable("page_test_versions").set({ weight: w[i] }).where("id", "=", v.id).execute();
      }
      if (ch.versionNames) {
        for (const [vid, raw] of Object.entries(ch.versionNames)) {
          if (!isUuid(vid)) continue;
          await tx.updateTable("page_test_versions").set({ name: String(raw).trim().slice(0, 60) }).where("id", "=", vid).where("test_id", "=", id).where("key", "!=", "a").execute();
        }
      }
    },
    database,
  );
}

/** Saves a version's page from the editor. Only B and C, before the test starts. */
export async function saveVersionDoc(scope: TenantScope, versionId: string, doc: PageDoc, database?: Database): Promise<void> {
  if (!isUuid(versionId)) throw new PageTestError("That version isn't here anymore.");
  await withTenant(
    scope,
    async (tx) => {
      const v = await tx.selectFrom("page_test_versions").select(["key", "test_id"]).where("id", "=", versionId).executeTakeFirst();
      if (!v) throw new PageTestError("That version isn't here anymore.");
      if (v.key === "a") throw new PageTestError("A is the live page. Change it in the page itself.");
      // Locked, so a save can't land between the start checks and the start.
      const t = await lockedTest(tx, v.test_id);
      if (t.status !== "draft") throw new PageTestError("This test is running, so its versions are locked. Changing one now would mix up the results.");
      // Every version shares the page's search details, so search engines see one page.
      const p = await tx.selectFrom("pages").select("published_doc").where("id", "=", t.page_id).executeTakeFirst();
      const seo = readDoc(p?.published_doc)?.seo ?? doc.seo;
      await tx.updateTable("page_test_versions").set({ doc: JSON.stringify({ ...doc, seo }) }).where("id", "=", versionId).execute();
    },
    database,
  );
}

/** What has to be true before a test can start, in plain words. Empty when it's ready. */
export function startProblems(t: PageTest, live: PageDoc | null): string[] {
  const out: string[] = [];
  if (!t.pageLive || !live) out.push("Publish the page first.");
  const others = t.versions.filter((v) => v.key !== "a");
  if (!others.length) out.push("Add a version to test against A.");
  for (const v of others) {
    if (!v.doc || !v.doc.sections.length) out.push(`${v.key.toUpperCase()} is empty.`);
    else if (findPlaceholders(v.doc).length) out.push(`Fill in the yellow spots on ${v.key.toUpperCase()}.`);
    else if (live && JSON.stringify(v.doc) === JSON.stringify(live)) out.push(`${v.key.toUpperCase()} is the same as the live page. Change something to test.`);
  }
  if (t.versions.reduce((n, v) => n + v.weight, 0) !== 100) out.push("The split has to add up to 100%.");
  return out;
}

/** Things worth a look before starting that don't stop it, like a version copied before the page's latest changes went live. */
export function startNotes(t: PageTest): string[] {
  if (t.status !== "draft" || !t.pagePublishedAt) return [];
  return t.versions
    .filter((v) => v.key !== "a" && v.copiedAt && v.copiedAt < t.pagePublishedAt!)
    .map((v) => `The page was published after ${v.key.toUpperCase()} was made, so ${v.key.toUpperCase()} doesn't have those changes. Check it before you start.`);
}

export async function startTest(scope: TenantScope, id: string, actor: string, database?: Database): Promise<void> {
  if (!isUuid(id)) throw new PageTestError("That test isn't here anymore.");
  await withTenant(
    scope,
    async (tx) => {
      const pageOf = await tx.selectFrom("page_tests").select("page_id").where("id", "=", id).executeTakeFirst();
      if (!pageOf) throw new PageTestError("That test isn't here anymore.");
      await lockPage(tx, pageOf.page_id);
      const row = await lockedTest(tx, id);
      if (row.status !== "draft") throw new PageTestError(row.status === "running" ? "It's already running." : "This test has ended.");
      const [t] = await loadTests(tx, { id });
      const p = await tx.selectFrom("pages").select(["published_doc"]).where("id", "=", row.page_id).executeTakeFirst();
      const live = readDoc(p?.published_doc);
      const problems = startProblems(t, live);
      if (problems.length) throw new PageTestError(problems.join(" "));
      // One company-wide advisory lock, so two starts can't both slip under the limit.
      await sql`select pg_advisory_xact_lock(hashtextextended('page-tests:' || ${scope.tenantId}, 0))`.execute(tx);
      const running = await tx.selectFrom("page_tests").select(sql<number>`count(*)::int`.as("n")).where("status", "=", "running").executeTakeFirstOrThrow();
      if (running.n >= runningLimit()) throw new PageTestError(`You can run ${runningLimit()} tests at once. End one to start this.`);
      await tx.updateTable("page_test_versions").set({ doc: JSON.stringify(live) }).where("test_id", "=", id).where("key", "=", "a").execute();
      await tx.updateTable("page_tests").set({ status: "running", started_at: new Date() }).where("id", "=", id).execute();
      await audit(tx, { action: "page_test.started", targetType: "page_test", targetId: id });
    },
    database,
  );
}

export type EndResult = { kept: VersionKey; published: boolean; draftKept: boolean };

/**
 * Ends a test and keeps one version live. Keeping B or C publishes it as the
 * page. The page's draft takes it too, unless someone has unpublished changes
 * in the draft, which are kept.
 */
export async function endTest(scope: TenantScope, id: string, keepVersionId: string | null, actor: string, reason: Exclude<PageTestEndReason, "">, database?: Database): Promise<EndResult> {
  if (!isUuid(id)) throw new PageTestError("That test isn't here anymore.");
  return withTenant(scope, (tx) => endIn(tx, id, keepVersionId, actor, reason), database);
}

async function endIn(tx: Tx, id: string, keepVersionId: string | null, actor: string, reason: Exclude<PageTestEndReason, "">): Promise<EndResult> {
  const pageOf = await tx.selectFrom("page_tests").select("page_id").where("id", "=", id).executeTakeFirst();
  if (!pageOf) throw new PageTestError("That test isn't here anymore.");
  await lockPage(tx, pageOf.page_id);
  const t = await lockedTest(tx, id);
  if (t.status !== "running") throw new PageTestError(t.status === "draft" ? "This test hasn't started. Delete it instead." : "This test has already ended.");
  const versions = await tx.selectFrom("page_test_versions").selectAll().where("test_id", "=", id).execute();
  const keep = versions.find((v) => v.id === keepVersionId) ?? versions.find((v) => v.key === "a")!;
  const live = await counts(tx, [id]);
  for (const v of versions) {
    const c = live.get(v.id) ?? { visitors: 0, conversions: 0 };
    await tx.updateTable("page_test_versions").set({ visitors: c.visitors, conversions: c.conversions }).where("id", "=", v.id).execute();
  }
  await tx.updateTable("page_tests").set({ status: "ended", ended_at: new Date(), end_reason: reason, kept_variant_id: keep.id }).where("id", "=", id).execute();
  let published = false;
  let draftKept = false;
  if (keep.key !== "a" && reason !== "unpublished") {
    const kept = readDoc(keep.doc);
    const page = await tx.selectFrom("pages").select(["doc", "published_doc", "slug"]).where("id", "=", t.page_id).executeTakeFirst();
    if (kept && findPlaceholders(kept).length) throw new PageTestError(`${keep.key.toUpperCase()} still has yellow placeholders, so it can't go live. Keep A, or end the test after fixing it.`);
    // It goes live with the page's own search details, the ones search engines have seen all along.
    const doc = kept ? { ...kept, seo: readDoc(page?.published_doc)?.seo ?? kept.seo } : null;
    if (doc && page) {
      // Draft edits made during the test are kept; otherwise the draft becomes the winner too.
      draftKept = JSON.stringify(page.doc) !== JSON.stringify(page.published_doc);
      await tx
        .updateTable("pages")
        .set({ published_doc: JSON.stringify(doc), published_at: new Date(), ...(draftKept ? {} : { doc: JSON.stringify(doc) }) })
        .where("id", "=", t.page_id)
        .execute();
      await tx.insertInto("page_revisions").values({ page_id: t.page_id, source: "publish", doc: JSON.stringify(doc), instruction: `Kept version ${keep.key.toUpperCase()} of the A/B test "${t.name}"`, actor }).execute();
      published = true;
    }
  }
  await audit(tx, { action: "page_test.ended", targetType: "page_test", targetId: id, detail: { kept: keep.key, reason } });
  return { kept: keep.key, published, draftKept };
}

export async function deleteTest(scope: TenantScope, id: string, database?: Database): Promise<void> {
  if (!isUuid(id)) return;
  await withTenant(
    scope,
    async (tx) => {
      const t = await tx.selectFrom("page_tests").select(["status"]).where("id", "=", id).forUpdate().executeTakeFirst();
      if (!t) return;
      if (t.status === "running") throw new PageTestError("End the test before deleting it.");
      await tx.deleteFrom("page_tests").where("id", "=", id).execute();
      await audit(tx, { action: "page_test.deleted", targetType: "page_test", targetId: id });
    },
    database,
  );
}

/** Called when a page is published: refused while a test runs, since A has to hold still. */
export async function assertNoRunningTest(tx: Tx, pageId: string): Promise<void> {
  const running = await tx.selectFrom("page_tests").select("name").where("page_id", "=", pageId).where("status", "=", "running").executeTakeFirst();
  if (running) throw new PageTestError(`This page is in the A/B test "${running.name}". End the test first, then publish your changes.`);
}

/** Called when a page is taken offline: its running test ends, keeping A. */
export async function endTestsForUnpublished(tx: Tx, pageId: string, actor: string): Promise<void> {
  const running = await tx.selectFrom("page_tests").select("id").where("page_id", "=", pageId).where("status", "=", "running").execute();
  for (const r of running) await endIn(tx, r.id, null, actor, "unpublished");
}

// ---- Visitors ---------------------------------------------------------------------

function key(): Buffer {
  const ring = parseKeyring();
  return ring.keys.get(ring.active)!;
}

const DAY_MS = 86_400_000;
const dayOf = (now: Date) => now.toISOString().slice(0, 10);

/** Today's and yesterday's salts, per company, for this server instance. */
const salts = new Map<string, Buffer>();

/**
 * The company's random salt for one day, made the first time it's needed.
 * Salts older than yesterday are deleted, here and by the job, so a visitor
 * hash can't be matched to anyone once its day has passed.
 */
async function saltFor(tx: Tx, tenantId: string, day: string, create: boolean): Promise<Buffer | null> {
  const cacheKey = `${tenantId}:${day}`;
  const cached = salts.get(cacheKey);
  if (cached) return cached;
  let row = await tx.selectFrom("page_test_salts").select("salt").where("day", "=", day).executeTakeFirst();
  if (!row && create) {
    await tx.insertInto("page_test_salts").values({ day, salt: randomBytes(32) }).onConflict((oc) => oc.columns(["tenant_id", "day"]).doNothing()).execute();
    await tx.deleteFrom("page_test_salts").where("day", "<", sql<string>`${day}::date - 1`).execute();
    row = await tx.selectFrom("page_test_salts").select("salt").where("day", "=", day).executeTakeFirst();
  }
  if (!row) return null;
  if (salts.size > 2000) salts.clear();
  salts.set(cacheKey, row.salt);
  return row.salt;
}

/** Who someone is on one test on one day, as a hash that means nothing once that day's salt is deleted. */
export function visitorHash(salt: Buffer, testId: string, who: { ip: string; ua: string }): string {
  return createHmac("sha256", salt).update(`${testId}|${who.ip}|${who.ua}`).digest("base64url").slice(0, 32);
}

/** 0 to 9,999, the same for this test and this visitor every time. Never stored. */
export function bucketFor(testId: string, who: { ip: string; ua: string }): number {
  return createHmac("sha256", key()).update(`page-test:${testId}|${who.ip}|${who.ua}`).digest().readUInt32BE(0) % 10_000;
}

export type Visitor = { ip: string; ua: string; team: boolean };

/**
 * Who's looking at a public page. `team` is true when the browser is signed in
 * to Bison Ops (it sends our session cookie), so the company's own visits
 * aren't counted. Pages on the company's own domain never see that cookie.
 */
export function visitorFrom(headers: Headers): Visitor {
  const cookie = headers.get("cookie") ?? "";
  return { ip: ipFrom(headers), ua: (headers.get("user-agent") ?? "").slice(0, 400), team: /(?:^|;\s*)(?:__session|bo_dev_session)=/.test(cookie) };
}

/**
 * A person opening the page: a top-level navigation, not a prefetch, a
 * prerender, or the page loaded as an image or frame from somewhere else.
 * Browsers too old to say count.
 */
export function isPageView(headers: Headers): boolean {
  if (/prefetch|prerender/i.test(`${headers.get("sec-purpose") ?? ""} ${headers.get("purpose") ?? ""} ${headers.get("next-router-prefetch") ?? ""}`)) return false;
  const mode = headers.get("sec-fetch-mode");
  const dest = headers.get("sec-fetch-dest");
  return (!mode || mode === "navigate") && (!dest || dest === "document");
}

/** Sent by a page on this same site, so another site can't make its visitors' browsers count clicks. */
export function fromSameSite(headers: Headers, host: string): boolean {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export type Served = { doc: PageDoc; test: { id: string; versionId: string; key: VersionKey; goal: PageTestGoal } | null };

type RunningTest = { id: string; goal: PageTestGoal; versions: { id: string; key: VersionKey; weight: number; doc: unknown }[] };

async function runningTest(tx: Tx, pageId: string): Promise<RunningTest | null> {
  const t = await tx.selectFrom("page_tests").select(["id", "goal"]).where("page_id", "=", pageId).where("status", "=", "running").executeTakeFirst();
  if (!t) return null;
  const versions = await tx.selectFrom("page_test_versions").select(["id", "key", "weight", "doc"]).where("test_id", "=", t.id).orderBy("key").execute();
  return { ...t, versions };
}

/** The version this visitor sees of a published page, and whether to count them. */
export async function serveVersion(tenantId: string, pageId: string, published: PageDoc, who: { ip: string; ua: string }, database: Database = db()): Promise<Served> {
  const test = await withTenant({ tenantId, userId: "public:page" }, (tx) => runningTest(tx, pageId), database);
  if (!test) return { doc: published, test: null };
  const v = pickVersion(bucketFor(test.id, who), test.versions);
  const doc = v ? readDoc(v.doc) : null;
  if (!v || !doc) return { doc: published, test: null };
  return { doc, test: { id: test.id, versionId: v.id, key: v.key, goal: test.goal } };
}

/** Counts a visit once per visitor per day, while the test is still running. Bots aren't counted; the caller skips the team's own visits. */
export async function recordVisit(tenantId: string, served: NonNullable<Served["test"]>, who: { ip: string; ua: string }, database: Database = db(), now = new Date()): Promise<void> {
  if (isBot(who.ua)) return;
  await withTenant(
    { tenantId, userId: "public:page" },
    async (tx) => {
      // Sent after the page, so the test may have ended in between.
      const running = await tx.selectFrom("page_tests").select("id").where("id", "=", served.id).where("status", "=", "running").executeTakeFirst();
      if (!running) return;
      const day = dayOf(now);
      const salt = (await saltFor(tx, tenantId, day, true))!;
      await tx
        .insertInto("page_test_visits")
        .values({ test_id: served.id, version_id: served.versionId, day, visitor: visitorHash(salt, served.id, who) })
        .onConflict((oc) => oc.columns(["tenant_id", "test_id", "day", "visitor"]).doNothing())
        .execute();
    },
    database,
  );
}

/**
 * Counts the test's goal for this visitor, once a day. It only marks a visit
 * already counted today (or late last night) for the version this visitor is
 * placed in, so a request can't add visitors or pick which version gets the
 * credit. `versionId` is the version the page showed; it has to match.
 */
export async function recordGoal(tenantId: string, pageId: string, kind: PageTestGoal, versionId: unknown, who: { ip: string; ua: string }, database: Database = db(), now = new Date()): Promise<boolean> {
  if (isBot(who.ua) || typeof versionId !== "string" || !isUuid(versionId)) return false;
  return withTenant(
    { tenantId, userId: "public:page" },
    async (tx) => {
      const t = await runningTest(tx, pageId);
      if (!t || t.goal !== kind) return false;
      const placed = pickVersion(bucketFor(t.id, who), t.versions);
      if (!placed || placed.id !== versionId) return false;
      for (const day of [dayOf(now), dayOf(new Date(now.getTime() - DAY_MS))]) {
        const salt = await saltFor(tx, tenantId, day, false);
        if (!salt) continue;
        const r = await tx
          .updateTable("page_test_visits")
          .set({ converted: true })
          .where("test_id", "=", t.id)
          .where("day", "=", day)
          .where("visitor", "=", visitorHash(salt, t.id, who))
          .where("version_id", "=", placed.id)
          .executeTakeFirst();
        if (Number(r.numUpdatedRows) > 0) return true;
      }
      return false;
    },
    database,
  );
}

// ---- The job ------------------------------------------------------------------------

/**
 * Clears visit rows 30 days after a test ends and salts older than yesterday.
 * With `autoEnd` (the daily job only, so results aren't checked every few
 * minutes), also ends tests set to end on their own once a winner has held.
 */
export async function runPageTestWork(opts: { budgetMs?: number; now?: Date; autoEnd?: boolean } = {}, database: Database = db()): Promise<{ ended: number; cleared: number }> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const { rows } = await sql<{ id: string }>`select due_page_test_tenants() as id`.execute(database);
  let ended = 0;
  let cleared = 0;
  for (const { id: tenantId } of rows) {
    if (Date.now() - started > (opts.budgetMs ?? 30_000)) break;
    const scope = { tenantId, userId: "system:page-tests" };
    if (opts.autoEnd) {
      const due = await withTenant(scope, (tx) => tx.selectFrom("page_tests").select("id").where("status", "=", "running").where("auto_end", "=", true).execute(), database);
      for (const { id } of due) {
        const t = await getTest(scope, id, database);
        if (!t || t.status !== "running") continue;
        const days = fullDays(t, now.getTime());
        if (days < MIN_DAYS) continue;
        const earlier = earlierTotals(await dailyCounts(scope, id, database), t.versions.map((x) => x.key), dayOf(now));
        const v = verdict(results(t.versions.map((x): Counts => ({ key: x.key, visitors: x.visitors, conversions: x.conversions }))), { days, goal: "", running: true, earlier });
        if (v.kind !== "winner" || !v.leader) continue;
        const keep = t.versions.find((x) => x.key === v.leader);
        try {
          await endTest(scope, t.id, keep?.id ?? null, "system:page-tests", "winner", database);
          ended++;
        } catch (err) {
          console.error("auto-ending a page test failed", err);
        }
      }
    }
    const old = new Date(now.getTime() - KEEP_VISITS_DAYS * DAY_MS);
    const r = await withTenant(
      scope,
      async (tx) => {
        await tx.deleteFrom("page_test_salts").where("day", "<", dayOf(new Date(now.getTime() - DAY_MS))).execute();
        return tx
          .deleteFrom("page_test_visits")
          .where("test_id", "in", (eb) => eb.selectFrom("page_tests").select("id").where("status", "=", "ended").where("ended_at", "<", old))
          .executeTakeFirst();
      },
      database,
    );
    cleared += Number(r.numDeletedRows);
  }
  return { ended, cleared };
}
