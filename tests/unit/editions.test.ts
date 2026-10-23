// The two editions: Bison Ops and Fit Funnels. Same tools, their own name,
// mark, color and words; each made-up company belongs to one.
import { describe, expect, it } from "vitest";
import { CATALOG } from "@/config/catalog";
import { EDITIONS, editionFor, editionOfIndustry, isEditionKey, itemOf, sayFor } from "@/config/editions";
import { MODES } from "@/config/modes";
import { DEV_PEOPLE, DEV_TENANTS, devPeopleIn, devTenantsIn } from "@/lib/auth/dev-people";
import { demoContext } from "@/lib/demo";

describe("editions", () => {
  it("has Bison Ops and Fit Funnels, and anything else is Bison Ops", () => {
    expect(editionFor("bison").productName).toBe("Bison Ops");
    expect(editionFor("fit").productName).toBe("Fit Funnels");
    expect(editionFor("nope").key).toBe("bison");
    expect(editionFor(undefined).key).toBe("bison");
    expect(isEditionKey("fit")).toBe(true);
    expect(isEditionKey("FIT")).toBe(false);
  });

  it("picks the words for the edition", () => {
    expect(sayFor("bison")("Products", "Memberships")).toBe("Products");
    expect(sayFor("fit")("Products", "Memberships")).toBe("Memberships");
    expect(sayFor(EDITIONS.fit)("a", "b")).toBe("b");
  });

  it("renames only pages that exist, and keeps the rest", () => {
    const hrefs = new Set(MODES.flatMap((m) => m.pages.map((p) => p.href)));
    for (const href of Object.keys(EDITIONS.fit.pageLabels)) expect(hrefs.has(href)).toBe(true);
    expect(EDITIONS.bison.pageLabels).toEqual({});
  });

  it("names modules and add-ons in each edition", () => {
    expect(itemOf("bison", "module:sales")).toEqual({ name: CATALOG["module:sales"].name, pitch: CATALOG["module:sales"].pitch });
    expect(itemOf("fit", "module:sales").name).toBe("Membership sales");
    expect(itemOf("fit", "module:marketing").name).toBe("Marketing");
    expect(itemOf("fit", "addon:translation")).toEqual({ name: CATALOG["addon:translation"].name, pitch: CATALOG["addon:translation"].pitch });
  });

  it("keeps every edition's words clean", () => {
    const text = JSON.stringify(EDITIONS);
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/seamless|leverage|unlock the power/i);
  });

  it("places each kind of business in an edition", () => {
    expect(editionOfIndustry("gym")).toBe("fit");
    expect(editionOfIndustry("studio")).toBe("fit");
    expect(editionOfIndustry("pools")).toBe("bison");
    expect(editionOfIndustry("general")).toBe("bison");
  });
});

describe("made-up companies", () => {
  it("has two companies and four people in each edition", () => {
    expect(devTenantsIn("bison").map((t) => t.name)).toEqual(["Brightwater Pools", "Ridgeline Roasters"]);
    expect(devTenantsIn("fit").map((t) => t.name)).toEqual(["Summit Strength Club", "Pulse Cycle Studio"]);
    expect(devPeopleIn("fit").map((p) => p.userId)).toEqual(["dev_maya", "dev_theo", "dev_jo", "dev_sam"]);
    expect(devPeopleIn("bison")).toHaveLength(4);
    expect(new Set(DEV_PEOPLE.map((p) => p.userId)).size).toBe(DEV_PEOPLE.length);
  });

  it("opens the demo in the company's edition, with its color", () => {
    const now = new Date("2026-10-23T12:00:00Z");
    const summit = demoContext({ provider: "dev", userId: "dev_maya", orgId: null, orgRole: null, tenantId: DEV_TENANTS.summit.id }, now)!;
    expect(summit.tenant).toMatchObject({ edition: "fit", industry: "gym", name: "Summit Strength Club" });
    expect(summit.settings.accent).toBe(EDITIONS.fit.defaultAccent);
    expect(summit.tenant.access.states["module:marketing"].active).toBe(true);
    const pulse = demoContext({ provider: "dev", userId: "dev_jo", orgId: null, orgRole: null, tenantId: DEV_TENANTS.pulse.id }, now)!;
    expect(pulse.tenant.access.states["module:marketing"].active).toBe(false);
    const ada = demoContext({ provider: "dev", userId: "dev_ada", orgId: null, orgRole: null, tenantId: DEV_TENANTS.brightwater.id }, now)!;
    expect(ada.tenant.edition).toBe("bison");
    expect(ada.settings.accent).toBe(EDITIONS.bison.defaultAccent);
  });
});
