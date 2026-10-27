// Boosts in the database, as the real app role: switching them on, what the
// kiosk does with them, and the drafts they make the agents write.
import { afterAll, describe, expect, it } from "vitest";
import { listTasks, runAgents } from "@/lib/agents/store";
import { DEV_TENANTS } from "@/lib/auth/dev-people";
import { BoostError, readBoosts, setBoost } from "@/lib/boosts/store";
import { withTenant } from "@/lib/db";
import { bringFriend, checkIn, claimPass, createPairCode, kioskView, pairWithCode, setKioskPin, unpairDevice } from "@/lib/kiosk/store";
import { syncProgress } from "@/lib/progress/store";
import { app, rawAsApp } from "./helpers";

const SUMMIT = DEV_TENANTS.summit.id;
const RIDGE = DEV_TENANTS.ridgeline.id;
const staff = <T>(tenantId: string, fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ tenantId, userId: "dev_maya" }, fn, app());
const DAY = 86_400_000;
const ALL = ["miss-you", "pass-follow-up", "milestones", "streaks", "review-ask", "bring-a-friend", "waiver-first", "lead-alerts"] as const;

let paired: Awaited<ReturnType<typeof pairWithCode>> = null;

/** One tablet for the whole file, unpaired at the end, so the club stays under its tablet limit. */
async function tablet() {
  if (paired) return paired;
  await staff(SUMMIT, (tx) => setKioskPin(tx, "482913"));
  const { code } = await staff(SUMMIT, (tx) => createPairCode(tx, "Boost desk", "maya"));
  paired = await pairWithCode(code, app());
  if (!paired) throw new Error("didn't pair");
  return paired;
}

/** A member who's been to the desk, with check-ins at the given days ago. */
async function member(daysAgo: number[]) {
  const email = `boost-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const id = await staff(SUMMIT, async (tx) => {
    const c = await tx.insertInto("contacts").values({ email, name: "Dana Ortiz", status: "won" }).returning("id").executeTakeFirstOrThrow();
    if (daysAgo.length) await tx.insertInto("kiosk_check_ins").values(daysAgo.map((d) => ({ contact_id: c.id, checked_in_at: new Date(Date.now() - d * DAY) }))).execute();
    return c.id;
  });
  return { id, email };
}

const allOff = () => staff(SUMMIT, async (tx) => {
  for (const k of ALL) await setBoost(tx, k, false, {}, "test");
});

afterAll(async () => {
  await allOff();
  if (paired) await staff(SUMMIT, (tx) => unpairDevice(tx, paired!.scope.deviceId));
  await app().destroy();
});

describe("switching boosts", () => {
  it("starts off, saves settings, and keeps the first time it went on", async () => {
    await allOff();
    expect((await staff(SUMMIT, (tx) => readBoosts(tx)))["miss-you"]).toMatchObject({ on: false, settings: { days: 14 } });
    const first = await staff(SUMMIT, (tx) => setBoost(tx, "miss-you", true, { days: 21 }, "Maya"));
    expect(first).toMatchObject({ on: true, settings: { days: 21 } });
    await staff(SUMMIT, (tx) => setBoost(tx, "miss-you", false, { days: 21 }, "Maya"));
    const again = await staff(SUMMIT, (tx) => setBoost(tx, "miss-you", true, { days: 30 }, "Maya"));
    expect(again.firstOnAt?.getTime()).toBe(first.firstOnAt?.getTime());
    const audit = await rawAsApp<{ action: string }>("select action from audit_log where target_type = 'boost' order by created_at desc limit 3", SUMMIT);
    expect(audit.map((a) => a.action)).toEqual(["boost.on", "boost.off", "boost.on"]);
  });

  it("won't ask for reviews without a real review link", async () => {
    await expect(staff(SUMMIT, (tx) => setBoost(tx, "review-ask", true, { link: "not a link" }, "Maya"))).rejects.toBeInstanceOf(BoostError);
    expect(await staff(SUMMIT, (tx) => setBoost(tx, "review-ask", true, { link: "https://g.page/r/summit/review", visits: 3 }, "Maya"))).toMatchObject({ on: true, settings: { visits: 3 } });
  });

  it("belongs to one club only", async () => {
    await staff(SUMMIT, (tx) => setBoost(tx, "streaks", true, {}, "Maya"));
    expect((await withTenant({ tenantId: RIDGE, userId: "dev_ada" }, (tx) => readBoosts(tx), app())).streaks.on).toBe(false);
  });

  it("gives 2 XP the first time each one goes on, and Powered up at 3", async () => {
    await staff(SUMMIT, (tx) => setBoost(tx, "milestones", true, {}, "Maya"));
    await staff(SUMMIT, (tx) => syncProgress(tx, "fit"));
    const xp = await rawAsApp<{ ref: string; points: number; label: string }>("select ref, points, label from xp_awards where kind = 'boost-on' order by ref", SUMMIT);
    expect(xp).toEqual(expect.arrayContaining([{ ref: "milestones", points: 2, label: "Milestone shout-outs" }, { ref: "miss-you", points: 2, label: "We miss you" }]));
    expect((await rawAsApp<{ key: string }>("select key from achievements where key = 'power-up'", SUMMIT)).length).toBe(1);
  });
});

describe("at the kiosk", () => {
  it("adds a friend only for someone who's been in, with the same answer for strangers", async () => {
    const t = await tablet();
    await staff(SUMMIT, (tx) => setBoost(tx, "bring-a-friend", false, {}, "Maya"));
    expect((await kioskView(t.scope, app()))?.friend).toBe(false);
    const m = await member([3]);
    const friend = { friendName: "Sam Lee", friendEmail: `sam-${Date.now()}@example.com`, friendPhone: "" };
    expect(await bringFriend(t.scope, { lookup: m.email, ...friend }, app())).toMatchObject({ ok: false, status: 409 });

    await staff(SUMMIT, (tx) => setBoost(tx, "bring-a-friend", true, {}, "Maya"));
    expect((await kioskView(t.scope, app()))?.friend).toBe(true);
    const stranger = await bringFriend(t.scope, { lookup: "nobody-here@example.com", ...friend }, app());
    expect(stranger).toMatchObject({ ok: false, status: 404 });
    expect(await bringFriend(t.scope, { lookup: m.email, friendName: "Me", friendEmail: m.email }, app())).toMatchObject({ ok: false, status: 400 });
    const ok = await bringFriend(t.scope, { lookup: m.email, ...friend }, app());
    expect(ok).toMatchObject({ ok: true, name: "Dana", lead: { kind: "friend", name: "Sam Lee", detail: "Sent by Dana Ortiz" } });
    const sub = await staff(SUMMIT, (tx) => tx.selectFrom("submissions as s").innerJoin("contacts as c", "c.id", "s.contact_id").select(["s.form_type", "s.fields", "c.status"]).where("c.email", "=", friend.friendEmail).executeTakeFirstOrThrow());
    expect(sub).toMatchObject({ form_type: "kiosk-referral", fields: { name: "Sam Lee", referredBy: "Dana Ortiz" }, status: "new" });

    // The friend's welcome mentions who sent them.
    await staff(SUMMIT, (tx) => runAgents(tx, "fit"));
    const welcome = (await staff(SUMMIT, (tx) => listTasks(tx))).open.find((x) => x.kind === "lead-reply" && (x.draft as { to?: string }).to === friend.friendEmail);
    expect(welcome).toMatchObject({ summary: "Sent by Dana Ortiz at the front desk." });
    expect((welcome!.draft as { subject: string }).subject).toBe("Dana thinks you'd like Summit Strength Club");
  });

  it("calls out a milestone visit and weeks in a row, only when those boosts are on", async () => {
    const t = await tablet();
    // 9 visits before today, in each of the last 3 weeks.
    const m = await member([1, 2, 7, 8, 9, 14, 15, 16, 17]);
    await staff(SUMMIT, (tx) => setBoost(tx, "milestones", true, {}, "Maya"));
    await staff(SUMMIT, (tx) => setBoost(tx, "streaks", true, {}, "Maya"));
    const r = await checkIn(t.scope, { lookup: m.email }, app());
    expect(r).toMatchObject({ ok: true, milestone: 10 });
    expect(r.ok && r.streak).toBeGreaterThanOrEqual(3);

    await staff(SUMMIT, (tx) => setBoost(tx, "streaks", false, {}, "Maya"));
    const quiet = await member([1, 8, 15]);
    expect(await checkIn(t.scope, { lookup: quiet.email }, app())).toMatchObject({ ok: true, milestone: null, streak: null });
  });

  it("says when a free pass or tour comes in, for the team's alert", async () => {
    const t = await tablet();
    const r = await claimPass(t.scope, { name: "Alex Kim", email: `alert-${Date.now()}@example.com`, phone: "541 555 0199" }, app());
    expect(r).toMatchObject({ ok: true, lead: { kind: "pass", name: "Alex Kim", phone: "541 555 0199" } });
  });
});

describe("agent work from boosts", () => {
  it("writes a we miss you note once per absence, and closes it when they come back", async () => {
    await staff(SUMMIT, (tx) => setBoost(tx, "miss-you", true, { days: 14 }, "Maya"));
    const m = await member([20, 25, 30]);
    await staff(SUMMIT, (tx) => runAgents(tx, "fit"));
    await staff(SUMMIT, (tx) => runAgents(tx, "fit"));
    const mine = (await staff(SUMMIT, (tx) => listTasks(tx))).open.filter((x) => x.kind === "miss-you" && (x.draft as { contactId?: string }).contactId === m.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ agent: "frontdesk", summary: "Hasn't been in for 20 days." });

    await staff(SUMMIT, (tx) => tx.insertInto("kiosk_check_ins").values({ contact_id: m.id }).execute());
    await staff(SUMMIT, (tx) => runAgents(tx, "fit"));
    const closed = (await staff(SUMMIT, (tx) => listTasks(tx))).done.find((x) => x.id === mine[0].id);
    expect(closed).toMatchObject({ status: "dismissed", result: "They came back in." });
  });

  it("asks for a review once, with the club's link, after enough visits", async () => {
    await staff(SUMMIT, (tx) => setBoost(tx, "review-ask", true, { link: "https://g.page/r/summit/review", visits: 3 }, "Maya"));
    const m = await member([1, 3, 5]);
    await staff(SUMMIT, (tx) => runAgents(tx, "fit"));
    const ask = (await staff(SUMMIT, (tx) => listTasks(tx))).open.find((x) => x.kind === "review-ask" && (x.draft as { contactId?: string }).contactId === m.id);
    expect((ask?.draft as { button?: { href: string } }).button?.href).toBe("https://g.page/r/summit/review");
  });

  it("drops waiting drafts when the boost goes off", async () => {
    await staff(SUMMIT, (tx) => setBoost(tx, "miss-you", true, { days: 14 }, "Maya"));
    const m = await member([40, 45]);
    await staff(SUMMIT, (tx) => runAgents(tx, "fit"));
    const t = (await staff(SUMMIT, (tx) => listTasks(tx))).open.find((x) => x.kind === "miss-you" && (x.draft as { contactId?: string }).contactId === m.id)!;
    await staff(SUMMIT, (tx) => setBoost(tx, "miss-you", false, { days: 14 }, "Maya"));
    await staff(SUMMIT, (tx) => runAgents(tx, "fit"));
    expect((await staff(SUMMIT, (tx) => listTasks(tx))).done.find((x) => x.id === t.id)).toMatchObject({ status: "dismissed", result: "The boost was turned off." });
  });
});
