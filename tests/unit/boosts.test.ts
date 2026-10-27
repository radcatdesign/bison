// Boosts: what each one is, its settings, streaks and milestones, the alert
// and the drafts they make. Pure.
import { describe, expect, it } from "vitest";
import { leadReply, milestoneNote, missYou, passFollowUp, reviewAsk } from "@/lib/agents/drafts";
import { BOOSTS, CATEGORIES, isBoostKey, leadAlertText, milestoneAt, readBoostSettings, streakWeeks } from "@/lib/boosts/catalog";
import { sampleBoosts } from "@/lib/boosts/demo";
import { achievementsFor, xpRules } from "@/lib/progress/rules";
import { sampleTasks } from "@/lib/sample/agents";

describe("the catalog", () => {
  it("has eight boosts, each in a category, with what it does step by step", () => {
    expect(BOOSTS).toHaveLength(8);
    expect(new Set(BOOSTS.map((b) => b.key)).size).toBe(8);
    for (const b of BOOSTS) {
      expect(Object.keys(CATEGORIES)).toContain(b.category);
      expect(b.how.length).toBeGreaterThanOrEqual(2);
      expect(isBoostKey(b.key)).toBe(true);
    }
    expect(isBoostKey("free-money")).toBe(false);
  });

  it("cleans settings, falling back to the default for anything odd", () => {
    expect(readBoostSettings("miss-you", { days: 21 })).toEqual({ days: 21 });
    expect(readBoostSettings("miss-you", { days: 3 })).toEqual({ days: 14 });
    expect(readBoostSettings("pass-follow-up", { days: 7 })).toEqual({ days: 7 });
    expect(readBoostSettings("pass-follow-up", { days: 30 })).toEqual({ days: 3 });
    expect(readBoostSettings("review-ask", { visits: 10, link: " https://g.page/r/abc123/review " })).toEqual({ visits: 10, link: "https://g.page/r/abc123/review" });
    expect(readBoostSettings("review-ask", { visits: 2, link: "javascript:alert(1)" })).toEqual({ visits: 5, link: "" });
    expect(readBoostSettings("review-ask", { link: "http://example.com/review" }).link).toBe("");
    expect(readBoostSettings("streaks", { days: 30, junk: true })).toEqual({});
    expect(readBoostSettings("milestones", null)).toEqual({});
  });
});

describe("streaks and milestones", () => {
  it("counts weeks in a row back from this week, and stops at a gap", () => {
    expect(streakWeeks(["2026-10-19", "2026-10-12", "2026-10-05", "2026-09-21"], "2026-10-19")).toBe(3);
    expect(streakWeeks(["2026-10-12", "2026-10-05"], "2026-10-19")).toBe(0);
    expect(streakWeeks([], "2026-10-19")).toBe(0);
    // Across a year end.
    expect(streakWeeks(["2026-01-05", "2025-12-29", "2025-12-22"], "2026-01-05")).toBe(3);
  });

  it("celebrates only the milestone visits", () => {
    expect([9, 10, 11, 25, 50, 99, 100, 1000].map(milestoneAt)).toEqual([null, 10, null, 25, 50, null, 100, 1000]);
  });
});

describe("lead alerts", () => {
  it("says who, how to reach them and what they asked for", () => {
    const t = leadAlertText({ kind: "friend", name: "Sam Lee", email: "sam@example.com", phone: "555 0100", detail: "Sent by Dana Ortiz" });
    expect(t.subject).toBe("New lead: Sam Lee was sent by a friend at the kiosk");
    expect(t.lines).toEqual(["Sam Lee was sent by a friend at the kiosk.", "Email: sam@example.com\nPhone: 555 0100", "Sent by Dana Ortiz"]);
    expect(leadAlertText({ kind: "page", name: "", email: "x@example.com", phone: "", detail: "" }).lines).toEqual(["x@example.com filled in a form on a funnel page.", "Email: x@example.com"]);
  });
});

describe("drafts from boosts", () => {
  it("writes short notes in club words, using only what's known", () => {
    const club = "Summit Strength Club";
    expect(missYou(club, { email: "d@example.com", name: "Dana Ortiz", days: 16 }).body).toMatch(/^Hi Dana,/);
    expect(passFollowUp(club, { email: "p@example.com", name: "" }).body).toMatch(/^Hi there,/);
    expect(milestoneNote(club, { email: "l@example.com", name: "Leo Park", visits: 50 }).subject).toMatch(/50/);
    const ask = reviewAsk(club, { email: "r@example.com", name: "Rae", link: "https://g.page/r/abc/review" });
    expect(ask.button).toEqual({ label: "Leave a review", href: "https://g.page/r/abc/review" });
    const friend = leadReply("fit", club, { name: "Sam Lee", email: "s@example.com", formType: "kiosk-referral", fields: { referredBy: "Dana Ortiz" } });
    expect(friend.subject).toBe("Dana thinks you'd like Summit Strength Club");
    expect(friend.body).not.toMatch(/free|on us/i);
    for (const d of [friend, ask]) expect(d.body).not.toMatch(/\[Add/);
  });
});

describe("samples and progress", () => {
  it("has a sample club with a few boosts on, and its drafts in Agents", () => {
    const on = Object.entries(sampleBoosts()).filter(([, v]) => v.on).map(([k]) => k);
    expect(on.length).toBeGreaterThanOrEqual(3);
    const kinds = sampleTasks({ id: "11111111-1111-4111-8111-111111111111", name: "Summit", edition: "fit", slug: "summit" }).map((t) => t.kind);
    expect(kinds).toEqual(expect.arrayContaining(["miss-you", "milestone"]));
    expect(sampleTasks({ id: "11111111-1111-4111-8111-111111111111", name: "Acme", edition: "bison", slug: "acme" }).map((t) => t.kind)).not.toContain("miss-you");
  });

  it("gives XP for turning a boost on and an achievement for 3 at once, in Fit Funnels only", () => {
    expect(xpRules("fit").find((r) => r.kind === "boost-on")?.points).toBe(2);
    expect(xpRules("bison").some((r) => r.kind === "boost-on")).toBe(false);
    expect(achievementsFor("fit").some((a) => a.key === "power-up")).toBe(true);
    expect(achievementsFor("bison").some((a) => a.key === "power-up")).toBe(false);
  });
});
