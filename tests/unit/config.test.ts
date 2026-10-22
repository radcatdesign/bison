// The config files drive pricing, gating and navigation. These checks catch typos
// that TypeScript can't, like a feature pointing at an item nobody sells.
import { describe, expect, it } from "vitest";
import { CATALOG, PAID_ITEMS } from "@/config/catalog";
import { FEATURES } from "@/config/features";
import { MODES } from "@/config/modes";
import { ROLES } from "@/config/roles";
import { RELEASES } from "@/config/releases";

describe("catalog", () => {
  it("prices every item, and marks every price as a placeholder until pricing is decided", () => {
    for (const item of Object.values(CATALOG)) {
      expect(item.price.currency).toBe("usd");
      expect(item.price.placeholder, item.key).toBe(true);
    }
  });

  it("gives every paid item a pitch, a trial and a Stripe price variable", () => {
    for (const item of PAID_ITEMS) {
      expect(item.pitch.length, item.key).toBeGreaterThan(20);
      expect(item.trialDays, item.key).toBe(14);
      expect(item.stripePriceEnv, item.key).toMatch(/^STRIPE_PRICE_[A-Z_]+$/);
    }
    const envs = PAID_ITEMS.map((i) => i.stripePriceEnv);
    expect(new Set(envs).size).toBe(envs.length);
  });
});

describe("features", () => {
  it("are granted by items that exist", () => {
    for (const [feature, items] of Object.entries(FEATURES)) {
      expect(items.length, feature).toBeGreaterThan(0);
      for (const item of items) expect(CATALOG, `${feature} -> ${item}`).toHaveProperty([item]);
    }
  });

  it("cover every paid item", () => {
    const granting = new Set(Object.values(FEATURES).flat());
    for (const item of PAID_ITEMS) expect(granting.has(item.key), item.key).toBe(true);
  });
});

describe("modes", () => {
  it("come in the order Analyze, Marketing, Sales", () => {
    expect(MODES.map((m) => m.label)).toEqual(["Analyze", "Marketing", "Sales"]);
  });

  it("are unlocked by the module that grants their feature", () => {
    for (const m of MODES) {
      const grantedBy = FEATURES[m.feature] as readonly string[];
      if (m.item) expect(grantedBy).toContain(m.item);
      else expect(grantedBy).toContain("base");
      for (const p of m.pages) expect(p.href.startsWith(`/${m.key}`)).toBe(true);
    }
  });

  it("are visible to every role in Analyze", () => {
    for (const role of Object.values(ROLES)) expect(role.modes).toContain("analyze");
  });
});

describe("roles", () => {
  it("keep billing with the owner only", () => {
    const withBilling = Object.entries(ROLES).filter(([, r]) => r.actions.includes("billing.manage"));
    expect(withBilling.map(([k]) => k)).toEqual(["owner"]);
  });

  it("leave viewers read only", () => {
    expect(ROLES.viewer.actions).toEqual([]);
  });
});

describe("releases", () => {
  it("are newest first with plain dates", () => {
    for (const r of RELEASES) expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dates = RELEASES.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
