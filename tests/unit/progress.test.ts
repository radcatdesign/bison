// XP rules, achievements and the level math, in both editions.
import { describe, expect, it } from "vitest";
import { achievementsFor, levelFor, xpRules } from "@/lib/progress/rules";
import { gainedLine } from "@/lib/progress/store";
import { sampleProgress } from "@/lib/sample/progress";

describe("levels", () => {
  it("starts at level 1 and goes up every 10 XP", () => {
    expect(levelFor(0)).toEqual({ level: 1, xp: 0, into: 0, toNext: 10 });
    expect(levelFor(9)).toMatchObject({ level: 1, into: 9, toNext: 1 });
    expect(levelFor(10)).toMatchObject({ level: 2, into: 0, toNext: 10 });
    expect(levelFor(37)).toMatchObject({ level: 4, into: 7, toNext: 3 });
    expect(levelFor(-5).level).toBe(1);
  });
});

describe("rules", () => {
  it("gives clubs the front desk and words of their own", () => {
    expect(xpRules("bison").some((r) => r.kind === "kiosk-paired")).toBe(false);
    expect(xpRules("fit").some((r) => r.kind === "kiosk-paired")).toBe(true);
    expect(achievementsFor("fit").some((a) => a.key === "front-desk")).toBe(true);
    expect(achievementsFor("bison").some((a) => a.key === "front-desk")).toBe(false);
    expect(xpRules("fit").find((r) => r.kind === "page-published")?.title).toBe("Publish a funnel page");
  });

  it("keeps the words clean", () => {
    const text = JSON.stringify([xpRules("bison"), xpRules("fit"), achievementsFor("bison"), achievementsFor("fit")]);
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/seamless|leverage|unlock the power/i);
  });

  it("says what was earned in a few words", () => {
    expect(gainedLine({ xp: 0, achievements: [], levelUp: null })).toBe("");
    expect(gainedLine({ xp: 3, achievements: [], levelUp: null })).toBe(" +3 XP.");
    expect(gainedLine({ xp: 2, achievements: ["first-campaign"], levelUp: 2 })).toBe(" +2 XP. You reached level 2. New achievement.");
  });

  it("has made-up progress for the demo that adds up", () => {
    for (const e of ["bison", "fit"] as const) {
      const p = sampleProgress(e);
      expect(p.xp).toBe(p.recent.reduce((n, r) => n + r.points, 0));
      expect([...p.byKind.values()].reduce((n, k) => n + k.points, 0)).toBe(p.xp);
      const allowed = new Set(achievementsFor(e).map((a) => a.key));
      for (const k of p.earned.keys()) expect(allowed.has(k)).toBe(true);
    }
  });
});
