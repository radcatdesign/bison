import { describe, expect, it } from "vitest";
import { formatDelta, formatDuration, formatPercent } from "@/lib/format";
import { sampleAnalytics, sampleContacts } from "@/lib/sample/generate";
import { normalizeDomain, slugify, TenantInputError } from "@/lib/tenants";

const pools = { id: "11111111-1111-4111-8111-111111111111", name: "Brightwater Pools", industry: "pools" };
const coffee = { id: "22222222-2222-4222-8222-222222222222", name: "Ridgeline Roasters", industry: "coffee" };
const now = new Date("2026-10-21T17:30:00Z");

describe("sample data", () => {
  it("is the same every time for one tenant", () => {
    expect(sampleContacts(pools, now)).toEqual(sampleContacts(pools, now));
    expect(sampleAnalytics(pools, 30, now)).toEqual(sampleAnalytics(pools, 30, now));
  });

  it("is different for different tenants", () => {
    expect(sampleContacts(pools, now).map((c) => c.email)).not.toEqual(sampleContacts(coffee, now).map((c) => c.email));
    expect(sampleAnalytics(pools, 30, now).topPages.map((p) => p.path)).toContain("/glow-aggregate");
    expect(sampleAnalytics(coffee, 30, now).topPages.map((p) => p.path)).not.toContain("/glow-aggregate");
  });

  it("never shows a contact as having no name", () => {
    for (const c of sampleContacts(pools, now, 60)) {
      expect(c.displayName).toBeTruthy();
      expect(c.displayName).not.toMatch(/no name/i);
      if (!c.name) expect(c.displayName).toBe(c.email);
    }
  });

  it("has unique emails and the range asked for", () => {
    const emails = sampleContacts(pools, now, 60).map((c) => c.email);
    expect(new Set(emails).size).toBe(emails.length);
    expect(sampleAnalytics(pools, 7, now).daily).toHaveLength(7);
    expect(sampleAnalytics(pools, 90, now).daily).toHaveLength(90);
  });
});

describe("formatting", () => {
  it("says plainly when there's nothing yet", () => {
    expect(formatPercent(null)).toBe("None yet");
    expect(formatDuration(null)).toBe("None yet");
  });

  it("formats durations and changes", () => {
    expect(formatDuration(82)).toBe("1m 22s");
    expect(formatDuration(9)).toBe("9s");
    expect(formatDelta(110, 100, 30)).toBe("Up 10% on the previous 30 days");
    expect(formatDelta(0.6, 0.5, 7, true)).toBe("Up 20% on the previous 7 days (worse)");
    expect(formatDelta(5, 0, 7)).toBeNull();
  });
});

describe("tenant input", () => {
  it("cleans up website addresses", () => {
    expect(normalizeDomain("https://www.Example.com/path?x=1")).toBe("example.com");
    expect(normalizeDomain("shop.example.co.uk:8080")).toBe("shop.example.co.uk");
    expect(() => normalizeDomain("not a site")).toThrow(TenantInputError);
  });

  it("makes account names", () => {
    expect(slugify("Brightwater Pools & Spas")).toBe("brightwater-pools-spas");
    expect(slugify("Café Olé")).toBe("cafe-ole");
  });
});
