// Screens read through repositories. Live ones stay inside one tenant; sample ones never write.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { DEV_TENANTS } from "@/lib/auth/dev-people";
import { withTenant } from "@/lib/db";
import { getRepos, type RepoContext } from "@/lib/repo";
import { SampleModeError } from "@/lib/repo/types";
import { createTenant, TenantInputError } from "@/lib/tenants";
import { A, app, asOwner, B, pgCode } from "./helpers";

const ctxFor = (key: keyof typeof DEV_TENANTS, sampleData: boolean): RepoContext => {
  const t = DEV_TENANTS[key];
  return { scope: { tenantId: t.id }, tenant: { id: t.id, name: t.name, industry: t.industry }, sampleData, timezone: "America/Los_Angeles" };
};

afterAll(async () => {
  await app().destroy();
});

describe("live repositories", () => {
  it("list only the current tenant's contacts", async () => {
    const a = await getRepos(ctxFor("brightwater", false)).contacts.list();
    const b = await getRepos(ctxFor("ridgeline", false)).contacts.list();
    expect(a.map((c) => c.email)).toContain("mara@quinnbuilds.com");
    expect(a.map((c) => c.email)).not.toContain("owen@brooksdeli.com");
    expect(b.map((c) => c.email)).toContain("owen@brooksdeli.com");
    expect(b.map((c) => c.email)).not.toContain("mara@quinnbuilds.com");
  });

  it("can't open another tenant's contact by id", async () => {
    const theirs = (await getRepos(ctxFor("ridgeline", false)).contacts.list())[0];
    expect(await getRepos(ctxFor("brightwater", false)).contacts.get(theirs.id)).toBeNull();
    await expect(getRepos(ctxFor("brightwater", false)).contacts.setStatus(theirs.id, "won")).rejects.toThrow("doesn't exist");
  });

  it("show the email when a contact has no name", async () => {
    const list = await getRepos(ctxFor("ridgeline", false)).contacts.list();
    const nameless = list.find((c) => !c.name)!;
    expect(nameless.displayName).toBe(nameless.email);
  });

  it("count traffic from the tenant's own events only", async () => {
    const a = await getRepos(ctxFor("brightwater", false)).analytics.summary(30);
    const b = await getRepos(ctxFor("ridgeline", false)).analytics.summary(30);
    expect(a.current.visits).toBeGreaterThan(100);
    expect(b.current.visits).toBeGreaterThan(100);
    expect(a.topPages.map((p) => p.path)).toContain("/glow-aggregate");
    expect(b.topPages.map((p) => p.path)).not.toContain("/glow-aggregate");
    expect(a.current.bounceRate).toBeGreaterThan(0);
    expect(a.current.avgActiveSeconds).toBeGreaterThan(0);
  });
});

describe("live landing pages", () => {
  it("count each visit once, on the page it started on, for this tenant only", async () => {
    const pages = await getRepos(ctxFor("ridgeline", false)).analytics.landingPages(30);
    const summary = await getRepos(ctxFor("ridgeline", false)).analytics.summary(30);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.map((p) => p.path)).not.toContain("/glow-aggregate");
    expect(pages.reduce((s, p) => s + p.entries, 0)).toBe(summary.current.visits);
    expect(pages.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1, 5);
    for (const p of pages) {
      expect(p.bounceRate).toBeGreaterThanOrEqual(0);
      expect(p.bounceRate).toBeLessThanOrEqual(1);
    }
  });
});

describe("sample repositories", () => {
  it("give each tenant its own stable data", async () => {
    const a1 = await getRepos(ctxFor("brightwater", true)).contacts.list();
    const a2 = await getRepos(ctxFor("brightwater", true)).contacts.list();
    const b = await getRepos(ctxFor("ridgeline", true)).contacts.list();
    expect(a1.map((c) => c.email)).toEqual(a2.map((c) => c.email));
    expect(a1.map((c) => c.email)).not.toEqual(b.map((c) => c.email));
  });

  it("refuse to save anything, and the database stays as it was", async () => {
    const before = await withTenant({ tenantId: A }, (tx) => tx.selectFrom("contacts").select(["id", "status"]).orderBy("id").execute(), app());
    const sample = getRepos(ctxFor("brightwater", true));
    const first = (await sample.contacts.list())[0];
    await expect(sample.contacts.setStatus(first.id, "won")).rejects.toBeInstanceOf(SampleModeError);
    await expect(sample.contacts.setStatus(before[0].id, "won")).rejects.toBeInstanceOf(SampleModeError);
    const after = await withTenant({ tenantId: A }, (tx) => tx.selectFrom("contacts").select(["id", "status"]).orderBy("id").execute(), app());
    expect(after).toEqual(before);
  });
});

describe("creating a tenant", () => {
  it("sets up the tenant, its site, settings and owner under its own context", async () => {
    const domain = `new-${randomUUID().slice(0, 6)}.example.com`;
    const { tenantId, siteKey } = await createTenant({ name: "New Co", domain: `https://www.${domain}/about`, owner: { userId: "u_new", email: "Owner@NewCo.com", name: "New Owner" } }, app());
    const rows = await withTenant(
      { tenantId },
      async (tx) => ({
        site: await tx.selectFrom("sites").select(["domain", "site_key"]).executeTakeFirstOrThrow(),
        member: await tx.selectFrom("members").select(["email", "role"]).executeTakeFirstOrThrow(),
        settings: await tx.selectFrom("settings").select(["sample_data"]).executeTakeFirstOrThrow(),
      }),
      app(),
    );
    expect(rows).toEqual({ site: { domain, site_key: siteKey }, member: { email: "owner@newco.com", role: "owner" }, settings: { sample_data: true } });
  });

  it("lets anyone add a domain without locking out its real owner or revealing who's a customer", async () => {
    // ridgelineroasters.com is verified by Ridgeline. Someone else adding it gets an unverified site.
    const { tenantId } = await createTenant({ name: "Copycat", domain: "ridgelineroasters.com", owner: { userId: "u_x", email: "x@x.com", name: "" } }, app());
    const site = await withTenant({ tenantId }, (tx) => tx.selectFrom("sites").select(["domain", "verified_at"]).executeTakeFirstOrThrow(), app());
    expect(site).toEqual({ domain: "ridgelineroasters.com", verified_at: null });
  });

  it("allows only one tenant to verify a domain", async () => {
    const domain = `shared-${randomUUID().slice(0, 6)}.example.com`;
    const one = await createTenant({ name: "One", domain, owner: { userId: "u_1", email: "1@one.com", name: "" } }, app());
    const two = await createTenant({ name: "Two", domain, owner: { userId: "u_2", email: "2@two.com", name: "" } }, app());
    await asOwner((c) => c.query("update sites set verified_at = now() where tenant_id = $1", [one.tenantId]));
    await expect(asOwner((c) => c.query("update sites set verified_at = now() where tenant_id = $1", [two.tenantId]))).rejects.toSatisfy((err) => pgCode(err) === "23505");
  });

  it("rejects an address that isn't a website", async () => {
    await expect(createTenant({ name: "Bad", domain: "not a site", owner: { userId: "u_b", email: "b@b.com", name: "" } }, app())).rejects.toBeInstanceOf(TenantInputError);
  });

  it("picks a different account name when the first is taken", async () => {
    const { slug } = await createTenant({ name: "Ridgeline Roasters", domain: `ridge-${randomUUID().slice(0, 6)}.example.com`, owner: { userId: "u_y", email: "y@y.com", name: "" } }, app());
    expect(slug).toMatch(/^ridgeline-roasters-[0-9a-f]{4}$/);
  });

  it("leaves the other tenants alone", async () => {
    const n = await withTenant({ tenantId: B }, (tx) => tx.selectFrom("members").select("id").execute(), app());
    expect(n).toHaveLength(2);
  });
});
