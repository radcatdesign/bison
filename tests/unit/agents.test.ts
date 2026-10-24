// The agents' roster, what they write, and how busy the gym looks. Pure.
import { describe, expect, it } from "vitest";
import { campaignPlan, cartNudge, estimateNudge, leadReply, weeklyRead } from "@/lib/agents/drafts";
import { agentsFor, crowdFor, KINDS } from "@/lib/agents/roster";
import { weekRef } from "@/lib/agents/store";
import { sampleTasks } from "@/lib/sample/agents";

const zero = { visitors: 0, leads: 0, checkIns: 0, joins: 0 };

describe("the team", () => {
  it("has club roles in Fit Funnels and general roles in Bison Ops", () => {
    expect(agentsFor("fit").map((a) => a.name)).toEqual(["Front desk", "Memberships", "Marketing", "Coach"]);
    expect(agentsFor("bison").map((a) => a.name)).toEqual(["Customer care", "Sales", "Marketing", "Strategy"]);
    for (const k of Object.values(KINDS)) expect(["frontdesk", "memberships", "marketing", "coach"]).toContain(k.agent);
  });
});

describe("the gym's crowd", () => {
  it("is quiet with nothing going on and fills up with a busy week, up to 30", () => {
    expect(crowdFor(zero, zero)).toMatchObject({ guests: 0, mood: "quiet" });
    expect(crowdFor({ visitors: 420, leads: 7, checkIns: 380, joins: 2 }, zero)).toMatchObject({ guests: 18, mood: "busy" });
    expect(crowdFor({ visitors: 100, leads: 4, checkIns: 100, joins: 1 }, zero)).toMatchObject({ guests: 6, mood: "steady" });
    expect(crowdFor({ visitors: 100000, leads: 900, checkIns: 0, joins: 0 }, zero)).toMatchObject({ guests: 30, mood: "packed" });
  });
});

describe("drafts", () => {
  it("writes back to a free pass, a tour and a website form in plain words, with nothing made up", () => {
    const pass = leadReply("fit", "Summit Strength Club", { name: "Priya Shah", email: "p@example.com", formType: "kiosk-pass", fields: {} });
    expect(pass.subject).toBe("Your free pass at Summit Strength Club");
    expect(pass.body).toMatch(/^Hi Priya,/);
    const tour = leadReply("fit", "Summit", { name: "Marcus", email: "m@example.com", formType: "kiosk-tour", fields: { when: "Evening" } });
    expect(tour.body).toContain("You said evening works best.");
    const web = leadReply("bison", "Brightwater Pools", { name: "", email: "e@example.com", formType: "landing-page", fields: { message: "Do you ship to Phoenix?" } });
    expect(web.body).toMatch(/^Hi there,/);
    expect(web.body).toContain('You asked: "Do you ship to Phoenix?"');
    for (const d of [pass, tour, web]) expect(`${d.subject} ${d.body}`).not.toMatch(/\[Add|—/);
  });

  it("nudges carts and quotes with a link back", () => {
    const c = cartNudge("fit", "Summit", { email: "g@example.com", name: "Grace", item: "Unlimited monthly", shopUrl: "https://x/p/summit/shop" });
    expect(c.subject).toBe("Still thinking about joining Summit?");
    expect(c.button?.label).toBe("Finish joining");
    const e = estimateNudge("fit", "Summit", { email: "a@example.com", name: "Al", number: 104, title: "Team wellness", url: "https://x/e/t" });
    expect(e.subject).toBe("Following up on quote #104, Team wellness");
  });

  it("plans this month's campaign early in the month and next month's late in it", () => {
    expect(campaignPlan("fit", new Date("2026-10-05T12:00:00Z"))).toMatchObject({ startsOn: "2026-10-05", endsOn: "2026-10-31" });
    expect(campaignPlan("fit", new Date("2026-10-24T12:00:00Z"))).toMatchObject({ name: "Holiday membership drive 2026", startsOn: "2026-11-01", endsOn: "2026-11-30" });
    expect(campaignPlan("bison", new Date("2026-12-28T12:00:00Z"))).toMatchObject({ name: "New year launch 2027", startsOn: "2027-01-01", endsOn: "2027-01-31" });
  });

  it("reads the week and points at what's waiting", () => {
    const r = weeklyRead("fit", { visitors: 200, leads: 4, checkIns: 90, joins: 1 }, { visitors: 100, leads: 8, checkIns: 90, joins: 0 }, [{ kind: "lead-reply", count: 2 }]);
    expect(r.lines[0]).toBe("200 website visitors, up 100% on the week before.");
    expect(r.lines[1]).toBe("4 new leads, down 50%.");
    expect(r.next[0]).toContain("Answer the 2 new leads");
  });

  it("starts weeks on Monday", () => {
    expect(weekRef(new Date("2026-10-24T12:00:00Z"))).toBe("2026-10-19");
    expect(weekRef(new Date("2026-10-19T00:30:00Z"))).toBe("2026-10-19");
  });

  it("has made-up work for the demo in both editions", () => {
    for (const edition of ["bison", "fit"] as const) {
      const t = sampleTasks({ id: "11111111-1111-4111-8111-111111111111", name: "Co", edition, slug: "co" });
      expect(new Set(t.map((x) => x.agent))).toEqual(new Set(["frontdesk", "memberships", "marketing", "coach"]));
      expect(JSON.stringify(t)).not.toMatch(/—/);
    }
  });
});
