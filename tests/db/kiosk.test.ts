// The front desk kiosk in the database, as the real app role: pairing a tablet
// with a code, what a paired tablet can do, the staff PIN, and that check-ins
// and signed waivers are records nobody can change.
import { afterAll, describe, expect, it } from "vitest";
import { DEV_TENANTS } from "@/lib/auth/dev-people";
import { withTenant } from "@/lib/db";
import { starterWaiver } from "@/lib/kiosk/settings";
import {
  bookTour,
  checkIn,
  claimPass,
  createPairCode,
  deviceFor,
  kioskView,
  leaveKiosk,
  listDevices,
  pairingAllowed,
  pairingFailed,
  pairWithCode,
  PIN_TRIES,
  readKiosk,
  saveKioskConfig,
  saveWaiver,
  setKioskPin,
  signWaiver,
  unpairDevice,
} from "@/lib/kiosk/store";
import { app, asOwner, pgCode, rawAsApp } from "./helpers";

const SUMMIT = DEV_TENANTS.summit.id;
const PULSE = DEV_TENANTS.pulse.id;
const staff = <T>(tenantId: string, fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ tenantId, userId: "dev_maya" }, fn, app());

const strokes = [
  [
    [20, 150],
    [80, 60],
    [140, 150],
    [200, 60],
    [260, 150],
    [320, 70],
  ],
];

async function pairedTablet(tenantId: string, name = "Front desk") {
  await staff(tenantId, (tx) => setKioskPin(tx, "482913"));
  const { code } = await staff(tenantId, (tx) => createPairCode(tx, name, "maya@summitstrength.club"));
  const paired = await pairWithCode(code, app());
  if (!paired) throw new Error("didn't pair");
  return paired;
}

afterAll(async () => {
  await app().destroy();
});

describe("pairing a tablet", () => {
  it("needs a staff PIN first, then a code pairs exactly one tablet, once", async () => {
    await expect(staff(PULSE, (tx) => createPairCode(tx, "Desk", "jo"))).rejects.toThrow(/Set a staff PIN first/);
    await staff(PULSE, (tx) => setKioskPin(tx, "2468"));
    const { code, expiresAt } = await staff(PULSE, (tx) => createPairCode(tx, "Front desk iPad", "jo@pulsecycle.studio"));
    expect(code).toMatch(/^\d{6}$/);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);

    const first = await pairWithCode(code, app());
    expect(first?.scope.tenantId).toBe(PULSE);
    expect(await pairWithCode(code, app())).toBeNull();
    expect(await deviceFor(first!.token, app())).toEqual(first!.scope);
    expect((await staff(PULSE, (tx) => listDevices(tx))).map((d) => d.name)).toContain("Front desk iPad");
  });

  it("stops an older code working once a new one is made, and never stores the code or token as typed", async () => {
    await staff(SUMMIT, (tx) => setKioskPin(tx, "482913"));
    const old = await staff(SUMMIT, (tx) => createPairCode(tx, "Old", "maya"));
    const fresh = await staff(SUMMIT, (tx) => createPairCode(tx, "New", "maya"));
    if (old.code !== fresh.code) expect(await pairWithCode(old.code, app())).toBeNull();
    const paired = await pairWithCode(fresh.code, app());
    expect(paired).not.toBeNull();
    const codes = await rawAsApp<{ code_hash: string }>("select code_hash from kiosk_pair_codes", SUMMIT);
    expect(codes.every((c) => c.code_hash.length === 64 && c.code_hash !== fresh.code)).toBe(true);
    const devices = await rawAsApp<{ token_hash: string }>("select token_hash from kiosk_devices", SUMMIT);
    expect(devices.some((d) => d.token_hash === paired!.token)).toBe(false);
    const pin = await rawAsApp<{ pin_hash: string }>("select pin_hash from kiosk_settings", SUMMIT);
    expect(pin[0].pin_hash).toMatch(/^scrypt\$/);
    expect(pin[0].pin_hash).not.toContain("482913");
  });

  it("doesn't take an expired code", async () => {
    await staff(SUMMIT, (tx) => setKioskPin(tx, "482913"));
    const { code } = await staff(SUMMIT, (tx) => createPairCode(tx, "Late", "maya"));
    await asOwner((c) => c.query("update kiosk_pair_codes set expires_at = now() - interval '1 second' where tenant_id = $1 and used_at is null", [SUMMIT]));
    expect(await pairWithCode(code, app())).toBeNull();
  });

  it("stops working the moment staff unpair it", async () => {
    const t = await pairedTablet(SUMMIT, "Unpair me");
    expect(await staff(SUMMIT, (tx) => unpairDevice(tx, t.scope.deviceId))).toBe(true);
    expect(await deviceFor(t.token, app())).toBeNull();
    expect(await kioskView(t.scope, app())).toBeNull();
  });
});

describe("a paired tablet", () => {
  it("shows the club's own kiosk, and joining only when the club can take payment", async () => {
    const t = await pairedTablet(SUMMIT);
    const view = await kioskView(t.scope, app());
    expect(view?.club).toBe("Summit Strength Club");
    expect(view?.pass?.label).toBe("Free trial pass");
    // Summit has no Sales and no Stripe in the seed.
    expect(view?.join).toBeNull();
    // No waiver until the club writes one with nothing left to fill in.
    await staff(SUMMIT, async (tx) => {
      const s = await readKiosk(tx);
      await saveKioskConfig(tx, { ...s.config, waiver: { on: true } });
      const starter = starterWaiver("Summit Strength Club");
      await saveWaiver(tx, starter.title, starter.body);
    });
    expect((await kioskView(t.scope, app()))?.waiver).toBeNull();
  });

  it("turns a free pass into a lead, and a tour into a booked visit", async () => {
    const t = await pairedTablet(SUMMIT);
    const email = `walkin-${Date.now()}@example.com`;
    expect(await claimPass(t.scope, { name: "Rae", email: "nope" }, app())).toMatchObject({ ok: false, status: 400 });
    const pass = await claimPass(t.scope, { name: "Rae Walker", email, phone: "(541) 555-0142", optIn: true }, app());
    expect(pass).toMatchObject({ ok: true, name: "Rae" });
    const tour = await bookTour(t.scope, { name: "Rae Walker", email, when: "Evening", note: "After work" }, app());
    expect(tour.ok).toBe(true);
    const rows = await staff(SUMMIT, async (tx) => ({
      contact: await tx.selectFrom("contacts").select(["id", "name", "phone", "status"]).where("email", "=", email).executeTakeFirstOrThrow(),
      subs: await tx.selectFrom("submissions as s").innerJoin("contacts as c", "c.id", "s.contact_id").select(["s.form_type", "s.fields"]).where("c.email", "=", email).orderBy("s.created_at").execute(),
      subscriber: await tx.selectFrom("subscribers").select(["source", "source_detail"]).where("email", "=", email).executeTakeFirst(),
    }));
    expect(rows.contact).toMatchObject({ name: "Rae Walker", phone: "(541) 555-0142", status: "qualified" });
    expect(rows.subs.map((s) => s.form_type)).toEqual(["kiosk-pass", "kiosk-tour"]);
    expect(rows.subs[1].fields).toMatchObject({ when: "Evening", message: "After work" });
    // Summit has Marketing, and Rae asked for email.
    expect(rows.subscriber).toEqual({ source: "form", source_detail: "kiosk:pass" });
  });

  it("checks people in by phone or email, once per visit, showing only a first name", async () => {
    const t = await pairedTablet(SUMMIT);
    const email = `member-${Date.now()}@example.com`;
    const phone = `541-555-${String(Date.now()).slice(-4)}`;
    await claimPass(t.scope, { name: "Mo Ellis Grant", email, phone }, app());
    expect(await checkIn(t.scope, { lookup: "nobody@example.com" }, app())).toMatchObject({ ok: false, status: 404 });
    const first = await checkIn(t.scope, { lookup: `+1 ${phone}` }, app());
    expect(first).toMatchObject({ ok: true, name: "Mo", visits: 1, message: "You're checked in." });
    const again = await checkIn(t.scope, { lookup: email.toUpperCase() }, app());
    expect(again).toMatchObject({ ok: true, visits: 1, message: "You're already checked in." });
    // Two people on one phone number: ask for an email instead of guessing.
    await claimPass(t.scope, { name: "Kit Grant", email: `kit-${email}`, phone }, app());
    expect(await checkIn(t.scope, { lookup: phone }, app())).toMatchObject({ ok: false, status: 409 });
  });

  it("only checks in people who joined or have been to the desk, and the same answer for everyone else", async () => {
    const t = await pairedTablet(SUMMIT);
    const lead = `web-lead-${Date.now()}@example.com`;
    const member = `member-won-${Date.now()}@example.com`;
    await staff(SUMMIT, (tx) => tx.insertInto("contacts").values([{ email: lead, name: "Web Lead" }, { email: member, name: "Joined Person", status: "won" }]).execute());
    expect(await checkIn(t.scope, { lookup: lead }, app())).toEqual(await checkIn(t.scope, { lookup: "nobody-at-all@example.com" }, app()));
    expect(await checkIn(t.scope, { lookup: lead }, app())).toMatchObject({ ok: false, status: 404 });
    expect(await checkIn(t.scope, { lookup: member }, app())).toMatchObject({ ok: true, name: "Joined" });
    const rows = await staff(SUMMIT, (tx) => tx.selectFrom("kiosk_check_ins as k").innerJoin("contacts as c", "c.id", "k.contact_id").select("c.email").where("c.email", "in", [lead, member]).execute());
    expect(rows.map((r) => r.email)).toEqual([member]);
  });

  it("counts a double tap as one visit", async () => {
    const t = await pairedTablet(SUMMIT);
    const email = `double-${Date.now()}@example.com`;
    await claimPass(t.scope, { name: "Dee Tap", email }, app());
    const both = await Promise.all([checkIn(t.scope, { lookup: email }, app()), checkIn(t.scope, { lookup: email }, app()), checkIn(t.scope, { lookup: email }, app())]);
    expect(both.every((r) => r.ok)).toBe(true);
    const rows = await staff(SUMMIT, (tx) => tx.selectFrom("kiosk_check_ins as k").innerJoin("contacts as c", "c.id", "k.contact_id").select("k.id").where("c.email", "=", email).execute());
    expect(rows).toHaveLength(1);
  });

  it("doesn't sign anyone up for email once staff turn the box off", async () => {
    const t = await pairedTablet(SUMMIT);
    const email = `no-email-${Date.now()}@example.com`;
    await staff(SUMMIT, async (tx) => {
      const s = await readKiosk(tx);
      await saveKioskConfig(tx, { ...s.config, emailOptIn: false });
    });
    expect((await claimPass(t.scope, { name: "No Mail", email, optIn: true }, app())).ok).toBe(true);
    expect(await staff(SUMMIT, (tx) => tx.selectFrom("subscribers").select("id").where("email", "=", email).executeTakeFirst())).toBeUndefined();
    await staff(SUMMIT, async (tx) => {
      const s = await readKiosk(tx);
      await saveKioskConfig(tx, { ...s.config, emailOptIn: true });
    });
  });

  it("signs the waiver it showed, keeps the words that were signed, and asks again when they change", async () => {
    const t = await pairedTablet(SUMMIT);
    const email = `signer-${Date.now()}@example.com`;
    await staff(SUMMIT, async (tx) => {
      const s = await readKiosk(tx);
      await saveKioskConfig(tx, { ...s.config, waiver: { on: true }, checkIn: { on: true } });
      await saveWaiver(tx, "Release and waiver", "I know exercise has risks and I take part at my own risk. Summit Strength Club LLC.");
    });
    const view = await kioskView(t.scope, app());
    expect(view?.waiver?.title).toBe("Release and waiver");
    const v = view!.waiver!.version;
    const base = { name: "Sam Signer", email, version: v };
    expect(await signWaiver(t.scope, { ...base, agree: false, signature: strokes }, app())).toMatchObject({ ok: false });
    expect(await signWaiver(t.scope, { ...base, agree: true, signature: [[[1, 1]]] }, app())).toMatchObject({ ok: false });
    expect(await signWaiver(t.scope, { ...base, version: v - 1, agree: true, signature: strokes }, app())).toMatchObject({ ok: false, status: 409 });
    expect(await signWaiver(t.scope, { ...base, agree: true, signature: strokes }, app())).toMatchObject({ ok: true });
    expect(await checkIn(t.scope, { lookup: email }, app())).toMatchObject({ ok: true, needsWaiver: false });

    await staff(SUMMIT, (tx) => saveWaiver(tx, "Release and waiver", "New words: exercise has risks, and I take part at my own risk. Summit Strength Club LLC."));
    await asOwner((c) => c.query("update kiosk_check_ins set checked_in_at = now() - interval '2 hours' where tenant_id = $1", [SUMMIT]));
    expect(await checkIn(t.scope, { lookup: email }, app())).toMatchObject({ ok: true, needsWaiver: true });
    const signed = await staff(SUMMIT, (tx) => tx.selectFrom("kiosk_waivers as w").innerJoin("contacts as c", "c.id", "w.contact_id").select(["w.body", "w.signature", "w.waiver_version"]).where("c.email", "=", email).execute());
    expect(signed).toHaveLength(1);
    expect(signed[0].body).toContain("I know exercise has risks");
    expect(signed[0].signature).toMatch(/^M20 150 L80 60/);
  });

  it("can't change or delete check-ins or signed waivers", async () => {
    for (const q of ["update kiosk_waivers set signed_name = 'x'", "delete from kiosk_waivers", "update kiosk_check_ins set checked_in_at = now()", "delete from kiosk_check_ins"]) {
      const err = await rawAsApp(q, SUMMIT).catch((e) => e);
      expect(pgCode(err), q).toBe("42501");
    }
  });

  it("can't see another club's people", async () => {
    const t = await pairedTablet(PULSE, "Pulse desk");
    const email = `summit-only-${Date.now()}@example.com`;
    const summit = await pairedTablet(SUMMIT);
    await claimPass(summit.scope, { name: "Only Summit", email }, app());
    expect(await checkIn(t.scope, { lookup: email }, app())).toMatchObject({ ok: false, status: 404 });
    // A tablet scope pointing at the wrong club finds no tablet there.
    expect(await kioskView({ tenantId: SUMMIT, deviceId: t.scope.deviceId }, app())).toBeNull();
  });
});

describe("guessing pairing codes", () => {
  it("stops an address after 10 wrong codes in 10 minutes, counted in the database", async () => {
    const address = `198.51.100.${Math.floor(Math.random() * 200)}`;
    for (let i = 0; i < 10; i++) {
      expect(await pairingAllowed(address, app())).toBe(true);
      await pairingFailed(address, app());
    }
    expect(await pairingAllowed(address, app())).toBe(false);
    expect(await pairingAllowed("198.51.100.254", app())).toBe(true);
    // Nobody can read the attempts directly, and they hold no address as typed.
    expect(pgCode(await rawAsApp("select * from kiosk_pair_attempts").catch((e) => e))).toBe("42501");
    const stored = await asOwner((c) => c.query("select address from kiosk_pair_attempts"));
    expect(stored.rows.every((r: { address: string }) => /^[0-9a-f]{64}$/.test(r.address) && !r.address.includes(address))).toBe(true);
  });
});

describe("leaving the kiosk", () => {
  it("takes the staff PIN, waits after too many wrong ones, and unpairs the tablet", async () => {
    const t = await pairedTablet(SUMMIT, "PIN test");
    for (let i = 1; i < PIN_TRIES; i++) expect(await leaveKiosk(t.scope, "000000", app())).toEqual({ ok: false, message: "That PIN isn't right." });
    expect((await leaveKiosk(t.scope, "000000", app())) as { message: string }).toMatchObject({ ok: false, message: expect.stringMatching(/waits 15 minutes/) });
    // Even the right PIN waits now.
    expect(await leaveKiosk(t.scope, "482913", app())).toMatchObject({ ok: false, message: expect.stringMatching(/Try again in/) });
    await asOwner((c) => c.query("update kiosk_devices set pin_locked_until = null where id = $1", [t.scope.deviceId]));
    expect(await leaveKiosk(t.scope, "482913", app())).toEqual({ ok: true });
    expect(await deviceFor(t.token, app())).toBeNull();
  });
});
