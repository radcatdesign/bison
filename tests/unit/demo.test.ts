import { describe, expect, it } from "vitest";
import { DEV_PEOPLE, DEV_TENANTS } from "@/lib/auth/dev-people";
import { demoContext, demoTeam } from "@/lib/demo";

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
