import { describe, expect, it } from "vitest";
import { can, type EntitlementRow, resolveAccess, unlockItemFor } from "@/lib/access/entitlements";

const now = new Date("2026-10-21T12:00:00Z");
const day = 86_400_000;
const row = (over: Partial<EntitlementRow>): EntitlementRow => ({
  item_key: "module:sales",
  source: "subscription",
  status: "active",
  starts_at: new Date(now.getTime() - day),
  ends_at: null,
  ...over,
});
const tenant = (rows: EntitlementRow[]) => ({ access: resolveAccess(rows, now) });

describe("can(tenant, feature)", () => {
  it("always allows the base plan", () => {
    expect(can(tenant([]), "analytics")).toBe(true);
    expect(can(tenant([]), "contacts")).toBe(true);
  });

  it("locks modules the tenant doesn't have", () => {
    expect(can(tenant([]), "sales.estimates")).toBe(false);
    expect(can(tenant([]), "marketing.newsletters")).toBe(false);
  });

  it("opens a module's features when it's active", () => {
    const t = tenant([row({})]);
    expect(can(t, "sales.estimates")).toBe(true);
    expect(can(t, "marketing.newsletters")).toBe(false);
  });

  it("counts a trial until it ends, and not after", () => {
    expect(can(tenant([row({ source: "trial", ends_at: new Date(now.getTime() + day) })]), "sales.orders")).toBe(true);
    expect(can(tenant([row({ source: "trial", ends_at: new Date(now.getTime() - 1) })]), "sales.orders")).toBe(false);
  });

  it("keeps access while Stripe retries a failed card", () => {
    const t = tenant([row({ status: "past_due" })]);
    expect(can(t, "sales.checkout")).toBe(true);
    expect(t.access.states["module:sales"].pastDue).toBe(true);
  });

  it("turns off canceled and expired items", () => {
    expect(can(tenant([row({ status: "canceled" })]), "sales.checkout")).toBe(false);
    expect(can(tenant([row({ status: "expired" })]), "sales.checkout")).toBe(false);
  });

  it("ignores items that haven't started", () => {
    expect(can(tenant([row({ starts_at: new Date(now.getTime() + day) })]), "sales.checkout")).toBe(false);
  });

  it("grants contact sharing with Sales or with the add-on", () => {
    expect(can(tenant([row({})]), "contacts.share")).toBe(true);
    expect(can(tenant([row({ item_key: "addon:contact-sharing" })]), "contacts.share")).toBe(true);
    expect(can(tenant([]), "contacts.share")).toBe(false);
  });

  it("prefers a paid subscription over a trial when both exist", () => {
    const t = tenant([row({ source: "trial", ends_at: new Date(now.getTime() + day) }), row({})]);
    expect(t.access.states["module:sales"].via).toBe("subscription");
    expect(t.access.states["module:sales"].trialUsed).toBe(true);
  });

  it("ignores items it doesn't know", () => {
    const t = tenant([row({ item_key: "module:time-travel" })]);
    expect([...t.access.items]).toEqual(["base"]);
  });
});

describe("unlockItemFor", () => {
  it("names the module to unlock", () => {
    expect(unlockItemFor("marketing.sequences")).toBe("module:marketing");
    expect(unlockItemFor("contacts.share")).toBe("module:sales");
    expect(unlockItemFor("analytics")).toBeNull();
  });
});
