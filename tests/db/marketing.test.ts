// Marketing in the database, as the real app role: signups and the
// do-not-email list, newsletters through the send job (with the offline email
// stand-in), series, provider webhooks and the narrow public lookups.
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@/lib/db";
import { clearOutbox, readOutbox } from "@/lib/email/provider";
import { EMAIL_DOC_VERSION, type EmailDoc } from "@/lib/email/schema";
import { checkUnsubscribeToken } from "@/lib/email/tokens";
import { createNewsletter, getNewsletter, scheduleNewsletter } from "@/lib/marketing/newsletters";
import { emailsThisMonth, importPeople, issueOfferCode, signUp, unsubscribeEmail } from "@/lib/marketing/people";
import { writeSending, NO_SENDING } from "@/lib/marketing/sending";
import { ensureStarterSeries, saveStep, setSeriesStatus, getSeries } from "@/lib/marketing/series";
import { saveMarketingPart, getMarketingSettings, tenantInfo } from "@/lib/marketing/store";
import { unsubscribeByToken, viewUnsubscribe, resubscribeByToken } from "@/lib/marketing/unsubscribe";
import { handleResendEvent } from "@/lib/marketing/webhook";
import { runEmailWork } from "@/lib/marketing/worker";
import { offerSettingsSchema } from "@/lib/marketing/settings";
import { createTenant } from "@/lib/tenants";
import { A, app, B, rawAsApp } from "./helpers";

const T = randomUUID();
const scope = { tenantId: T, userId: "test_owner" };
const tx = <R>(fn: Parameters<typeof withTenant<R>>[1]) => withTenant(scope, fn, app());
const letter = (body: string): EmailDoc => ({ version: EMAIL_DOC_VERSION, signOff: true, fallbackName: "there", sections: [{ id: "t", type: "text" as const, body, align: "left" as const }] });

beforeAll(async () => {
  await createTenant({ id: T, name: "Larkspur Floral", domain: "larkspurfloral.com", sampleData: false, owner: { userId: "test_owner", email: "owner@larkspurfloral.com", name: "Lee Owner" } }, app());
  await tx(async (t) => {
    await t.insertInto("entitlements").values({ item_key: "module:marketing", source: "grant", stripe_subscription_item_id: null, ends_at: null, note: "test" }).execute();
    const settings = await getMarketingSettings(t, await tenantInfo(t));
    await saveMarketingPart(t, "brand", { ...settings.brand, address: "1 Petal Lane, Portland, OR" });
    await writeSending(t, { ...NO_SENDING, domain: "mail.larkspurfloral.com", domainId: "standin-domain-x", status: "verified", verifiedAt: new Date().toISOString() });
  });
  clearOutbox();
});

afterAll(async () => {
  await app().destroy();
});

describe("signing up and stopping", () => {
  it("adds people once, fills in what's missing, and never overwrites", async () => {
    const r1 = await tx((t) => signUp(t, { email: "ivy@example.com", source: "page" }));
    const r2 = await tx((t) => signUp(t, { email: "ivy@example.com", name: "Ivy Lane", kind: "homeowner", source: "page" }));
    const r3 = await tx((t) => signUp(t, { email: "ivy@example.com", name: "Someone Else", source: "page" }));
    expect(r1).toMatchObject({ ok: true, created: true });
    expect(r2).toMatchObject({ ok: true, created: false });
    expect(r3).toMatchObject({ ok: true, created: false });
    const row = await tx((t) => t.selectFrom("subscribers").select(["name", "kind"]).where("email", "=", "ivy@example.com").executeTakeFirstOrThrow());
    expect(row).toEqual({ name: "Ivy Lane", kind: "homeowner" });
  });

  it("unsubscribing stops series and cancels anything queued", async () => {
    await tx(async (t) => {
      await signUp(t, { email: "rowan@example.com", source: "manual" });
      const seq = await t.insertInto("sequences").values({ name: "Test series", trigger: "manual", status: "on" }).returning("id").executeTakeFirstOrThrow();
      await t.insertInto("sequence_runs").values({ sequence_id: seq.id, email: "rowan@example.com", subscriber_id: null, next_at: new Date(Date.now() + 86_400_000) }).execute();
      await t.insertInto("email_sends").values({ kind: "series", sequence_id: seq.id, email: "rowan@example.com", subscriber_id: null }).execute();
      await unsubscribeEmail(t, "rowan@example.com", "link");
    });
    const after = await tx(async (t) => ({
      sub: await t.selectFrom("subscribers").select("status").where("email", "=", "rowan@example.com").executeTakeFirstOrThrow(),
      run: await t.selectFrom("sequence_runs").select("status").where("email", "=", "rowan@example.com").executeTakeFirstOrThrow(),
      send: await t.selectFrom("email_sends").select("status").where("email", "=", "rowan@example.com").executeTakeFirstOrThrow(),
    }));
    expect(after).toEqual({ sub: { status: "unsubscribed" }, run: { status: "stopped" }, send: { status: "canceled" } });
  });

  it("the team and imports can't put back someone who unsubscribed; signing up again themselves can", async () => {
    const manual = await tx((t) => signUp(t, { email: "rowan@example.com", source: "manual" }));
    expect(manual).toMatchObject({ ok: false, reason: "suppressed" });
    const imported = await tx((t) => importPeople(t, [{ email: "rowan@example.com", name: "Rowan", kind: "" }, { email: "new.person@example.com", name: "New", kind: "" }], {}));
    expect(imported).toMatchObject({ added: 1, skippedUnsubscribed: 1 });
    const self = await tx((t) => signUp(t, { email: "rowan@example.com", source: "page" }));
    expect(self).toMatchObject({ ok: true, resubscribed: true });
    expect(await tx((t) => t.selectFrom("unsubscribes").select("id").where("email", "=", "rowan@example.com").executeTakeFirst())).toBeUndefined();
  });

  it("gives one welcome code per person, ever", async () => {
    const offer = offerSettingsSchema.parse({ on: true, value: 15 });
    const a = await tx((t) => issueOfferCode(t, { email: "ivy@example.com", subscriberId: null }, offer));
    const b = await tx((t) => issueOfferCode(t, { email: "ivy@example.com", subscriberId: null }, { ...offer, prefix: "OTHER" }));
    expect(a).toMatch(/^WELCOME-[A-Z0-9]{6}$/);
    expect(b).toBe(a);
  });
});

describe("a newsletter through the send job", () => {
  it("goes to everyone subscribed exactly once, with their own unsubscribe link", async () => {
    const id = await createNewsletter(scope, { subject: "Hello {first name}", preheader: "", doc: letter("Hi {first name}, spring flowers are in.") }, "test");
    const r = await scheduleNewsletter(scope, id, { when: null, audience: "all", listId: null });
    expect(r).toMatchObject({ ok: true, now: true });
    const subscribed = await tx((t) => t.selectFrom("subscribers").select(sql<number>`count(*)::int`.as("n")).where("status", "=", "subscribed").executeTakeFirstOrThrow());
    await runEmailWork({ tenantId: T, database: app(), budgetMs: 20_000 });
    await runEmailWork({ tenantId: T, database: app(), budgetMs: 20_000 });
    const sent = readOutbox().filter((m) => m.subject.startsWith("Hello"));
    expect(sent).toHaveLength(subscribed.n);
    expect(new Set(sent.map((m) => m.to)).size).toBe(subscribed.n);
    const ivy = sent.find((m) => m.to === "ivy@example.com")!;
    expect(ivy.subject).toBe("Hello Ivy");
    expect(ivy.from).toBe('"Larkspur Floral" <hello@mail.larkspurfloral.com>');
    expect(ivy.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(ivy.html).toContain("1 Petal Lane, Portland, OR");
    const n = await getNewsletter(scope, id);
    expect(n?.status).toBe("sent");
    expect(n?.stats.sent).toBe(subscribed.n);

    // The unsubscribe link in that email works, and the page never shows the whole address.
    const token = /\/u\/([^"/]+)\/one-click/.exec(ivy.headers["List-Unsubscribe"])![1];
    expect(checkUnsubscribeToken(token)).not.toBeNull();
    expect((await viewUnsubscribe(token, app()))?.maskedEmail).toBe("iv••@example.com");
    expect(await unsubscribeByToken(token, "one-click", app())).toBe(true);
    expect((await viewUnsubscribe(token, app()))?.unsubscribed).toBe(true);
    expect(await resubscribeByToken(token, app())).toBe(true);
    expect((await viewUnsubscribe(token, app()))?.unsubscribed).toBe(false);
  });

  it("refuses to go out when something's missing, and says what", async () => {
    const id = await createNewsletter(scope, { subject: "[Add a subject]", preheader: "", doc: letter("Hi") }, "test");
    expect(await scheduleNewsletter(scope, id, { when: null, audience: "all", listId: null })).toEqual({ ok: false, message: "Fill in [Add a subject] in the subject." });
    const later = await createNewsletter(scope, { subject: "Later", preheader: "", doc: letter("Hi") }, "test");
    expect(await scheduleNewsletter(scope, later, { when: new Date(Date.now() + 40 * 86_400_000), audience: "all", listId: null })).toEqual({ ok: false, message: "Schedule up to 30 days ahead." });
  });

  it("counts every email toward the month, and the app can't delete them", async () => {
    expect(await tx((t) => emailsThisMonth(t))).toBeGreaterThan(0);
    await expect(rawAsApp("delete from email_sends", T)).rejects.toThrow(/permission denied/);
  });
});

describe("the welcome series", () => {
  it("can't go on until its emails are filled in, then sends day 0 to new signups", async () => {
    await tx((t) => ensureStarterSeries(t, "larkspurfloral.com"));
    const starter = (await tx((t) => t.selectFrom("sequences").select("id").where("starter", "=", true).executeTakeFirstOrThrow())).id;
    expect(await setSeriesStatus(scope, starter, true)).toMatchObject({ ok: false });
    const series = await getSeries(scope, starter);
    for (const st of series!.steps) {
      const filled = JSON.parse(JSON.stringify(st.doc).replace(/\[Add [^\]]+\]/g, "We grow everything ourselves"));
      await saveStep(scope, st.id, { subject: st.subject, preheader: st.preheader, doc: filled });
    }
    expect(await setSeriesStatus(scope, starter, true)).toEqual({ ok: true });

    clearOutbox();
    await tx((t) => signUp(t, { email: "fern@example.com", name: "Fern Gully", source: "page" }));
    await runEmailWork({ tenantId: T, database: app(), budgetMs: 20_000 });
    expect(readOutbox().map((m) => [m.to, m.subject])).toEqual([["fern@example.com", "Welcome to Larkspur Floral"]]);

    // People already in it are skipped: signing up again doesn't start it twice.
    await tx((t) => unsubscribeEmail(t, "fern@example.com", "link"));
    await tx((t) => signUp(t, { email: "fern@example.com", source: "page" }));
    const runs = await tx((t) => t.selectFrom("sequence_runs").select("status").where("email", "=", "fern@example.com").where("sequence_id", "=", starter).execute());
    expect(runs).toEqual([{ status: "stopped" }]);
  });
});

describe("provider webhooks", () => {
  it("a spam complaint puts the address on the do-not-email list", async () => {
    const send = await tx((t) => t.selectFrom("email_sends").select(["id", "provider_id", "email"]).where("email", "=", "new.person@example.com").where("provider_id", "is not", null).executeTakeFirstOrThrow());
    expect(await handleResendEvent(`evt_${randomUUID()}`, { type: "email.complained", data: { email_id: send.provider_id! } }, app())).toBe("Complaint: address unsubscribed.");
    const row = await tx((t) => t.selectFrom("unsubscribes").select("reason").where("email", "=", send.email).executeTakeFirstOrThrow());
    expect(row.reason).toBe("complaint");
    expect(await handleResendEvent(`evt_${randomUUID()}`, { type: "email.delivered", data: { email_id: "not-ours" } }, app())).toBe("Not one of ours.");
  });
});

describe("narrow public lookups", () => {
  it("only ever return ids, and only for companies with something due", async () => {
    const { rows } = await sql<{ id: string }>`select due_marketing_tenants(10) as id`.execute(app());
    for (const r of rows) expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    const { rows: sends } = await sql<{ t: string }>`select resolve_email_send(${randomUUID()}) as t`.execute(app());
    expect(sends[0].t).toBeNull();
  });

  it("keep each company's marketing data its own", async () => {
    for (const table of ["subscribers", "email_sends", "newsletters", "sequences", "offer_codes", "unsubscribes"]) {
      const theirs = await rawAsApp<{ n: string }>(`select count(*) as n from ${table} where tenant_id = '${T}'`, A);
      expect(Number(theirs[0].n), table).toBe(0);
      const others = await rawAsApp<{ n: string }>(`select count(*) as n from ${table} where tenant_id = '${T}'`, B);
      expect(Number(others[0].n), table).toBe(0);
    }
  });
});
