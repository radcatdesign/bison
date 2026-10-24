// Editions in the database: a company is Bison Ops or Fit Funnels from the day
// it's made, starts in that edition's color, and the seed has two of each.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { EDITIONS } from "@/config/editions";
import { DEV_TENANTS } from "@/lib/auth/dev-people";
import { withTenant } from "@/lib/db";
import { createTenant } from "@/lib/tenants";
import { app, asOwner, pgCode, rawAsApp } from "./helpers";

afterAll(async () => {
  await app().destroy();
});

const read = (tenantId: string) =>
  withTenant(
    { tenantId },
    async (tx) => ({
      tenant: await tx.selectFrom("tenants").select(["edition", "industry"]).executeTakeFirstOrThrow(),
      settings: await tx.selectFrom("settings").select(["accent"]).executeTakeFirstOrThrow(),
    }),
    app(),
  );

describe("editions", () => {
  it("seeds two companies in each edition", async () => {
    for (const t of Object.values(DEV_TENANTS)) {
      const row = await read(t.id);
      expect(row.tenant).toEqual({ edition: t.edition, industry: t.industry });
    }
  });

  it("makes a Fit Funnels club in its own color, and follows the kind of business when the edition isn't given", async () => {
    const owner = () => ({ userId: `u_${randomUUID().slice(0, 8)}`, email: "owner@club.example", name: "Owner" });
    const club = await createTenant({ name: "Northside Fitness", domain: `northside-${randomUUID().slice(0, 6)}.example`, industry: "gym", edition: "fit", owner: owner() }, app());
    expect(await read(club.tenantId)).toEqual({ tenant: { edition: "fit", industry: "gym" }, settings: { accent: EDITIONS.fit.defaultAccent } });

    const studio = await createTenant({ name: "Hot Room Yoga", domain: `hotroom-${randomUUID().slice(0, 6)}.example`, industry: "studio", owner: owner() }, app());
    expect((await read(studio.tenantId)).tenant.edition).toBe("fit");

    const shop = await createTenant({ name: "Corner Bakery", domain: `bakery-${randomUUID().slice(0, 6)}.example`, owner: owner() }, app());
    expect(await read(shop.tenantId)).toEqual({ tenant: { edition: "bison", industry: "general" }, settings: { accent: EDITIONS.bison.defaultAccent } });
  });

  it("can't be changed by the app, and only takes the two editions", async () => {
    const denied = await rawAsApp(`update tenants set edition = 'bison' where id = '${DEV_TENANTS.summit.id}'`, DEV_TENANTS.summit.id).catch((e) => e);
    expect(pgCode(denied)).toBe("42501");
    const bad = await asOwner((c) => c.query("update tenants set edition = 'other' where id = $1", [DEV_TENANTS.summit.id])).catch((e) => e);
    expect(pgCode(bad)).toBe("23514");
  });
});
