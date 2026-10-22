import { describe, expect, it } from "vitest";
import { DEV_PEOPLE, DEV_TENANTS } from "@/lib/auth/dev-people";
import { type DemoUnlock, demoContext, demoTeam, parseDemoUnlocks, serializeDemoUnlocks } from "@/lib/demo";

const now = new Date("2026-10-22T20:00:00Z");
const identity = (userId: string, tenantId: string) => ({ provider: "dev" as const, userId, orgId: null, orgRole: null, tenantId });

describe("demo context", () => {
  it("builds each made-up person's view with sample data always on", () => {
    for (const p of DEV_PEOPLE) {
      const ctx = demoContext(identity(p.userId, p.tenantId), now)!;
      expect(ctx.member.role).toBe(p.role);
      expect(ctx.tenant.id).toBe(p.tenantId);
      expect(ctx.settings.sampleData).toBe(true);
    }
  });

  it("refuses a person paired with the wrong company, or someone unknown", () => {
    expect(demoContext(identity("dev_ada", DEV_TENANTS.ridgeline.id), now)).toBeNull();
    expect(demoContext(identity("dev_nobody", DEV_TENANTS.ridgeline.id), now)).toBeNull();
  });

  it("shows Marketing on for Brightwater and everything locked for Ridgeline", () => {
    const bright = demoContext(identity("dev_ada", DEV_TENANTS.brightwater.id), now)!;
    const ridge = demoContext(identity("dev_cora", DEV_TENANTS.ridgeline.id), now)!;
    expect([...bright.tenant.access.items].sort()).toEqual(["addon:calculator", "base", "module:marketing"]);
    expect([...ridge.tenant.access.items]).toEqual(["base"]);
  });

  it("lists only that company's team", () => {
    const ctx = demoContext(identity("dev_cora", DEV_TENANTS.ridgeline.id), now)!;
    expect(demoTeam(ctx).map((m) => m.email)).toEqual(["cora@ridgelineroasters.com", "dana@ridgelineroasters.com"]);
  });
});

describe("demo unlocks", () => {
  const ridge = DEV_TENANTS.ridgeline.id;
  const bright = DEV_TENANTS.brightwater.id;
  const at = now.getTime() - 60_000;
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

  it("turn Sales on as a trial and Marketing on as a subscription", () => {
    const unlocks: DemoUnlock[] = [
      { item: "module:sales", source: "trial", at },
      { item: "module:marketing", source: "subscription", at },
    ];
    const ctx = demoContext(identity("dev_cora", ridge), now, unlocks)!;
    expect(ctx.tenant.access.states["module:sales"]).toMatchObject({ active: true, via: "trial", trialUsed: true });
    expect(ctx.tenant.access.states["module:marketing"]).toMatchObject({ active: true, via: "subscription" });
    // The trial runs the module's full length from when it started
    expect(ctx.tenant.access.states["module:sales"].trialEndsAt!.getTime()).toBe(at + 14 * 86_400_000);
  });

  it("end a trial when its days run out, and remember it was used", () => {
    const old = now.getTime() - 15 * 86_400_000;
    const ctx = demoContext(identity("dev_cora", ridge), now, [{ item: "module:sales", source: "trial", at: old }])!;
    expect(ctx.tenant.access.states["module:sales"]).toMatchObject({ active: false, trialUsed: true });
  });

  it("read back what was written, per company", () => {
    const written = { [ridge]: [{ item: "module:sales", source: "trial", at }], [bright]: [{ item: "module:sales", source: "subscription", at }] };
    expect(parseDemoUnlocks(serializeDemoUnlocks(written as never), now.getTime())).toEqual(written);
  });

  it("drop anything odd from the cookie", () => {
    const t = now.getTime();
    expect(parseDemoUnlocks(undefined, t)).toEqual({});
    expect(parseDemoUnlocks("not base64 json", t)).toEqual({});
    expect(parseDemoUnlocks(encode([1, 2]), t)).toEqual({});
    expect(parseDemoUnlocks("a".repeat(5000), t)).toEqual({});
    const messy = {
      "00000000-0000-4000-8000-000000000000": [{ item: "module:sales", source: "trial", at }],
      [ridge]: [
        { item: "module:sales", source: "trial", at },
        { item: "module:sales", source: "trial", at },
        { item: "base", source: "subscription", at },
        { item: "module:nope", source: "trial", at },
        { item: "module:marketing", source: "grant", at },
        { item: "module:marketing", source: "subscription", at: t + 86_400_000 },
        { item: "module:marketing", source: "subscription", at: t - 400 * 86_400_000 },
        { item: "module:marketing", source: "subscription", at: "yesterday" },
        null,
      ],
    };
    expect(parseDemoUnlocks(encode(messy), t)).toEqual({ [ridge]: [{ item: "module:sales", source: "trial", at }] });
  });
});
