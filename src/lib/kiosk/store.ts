import "server-only";
// The front desk kiosk: what staff set up in Settings, and what a paired
// tablet can do. Staff functions take a transaction already inside withTenant
// (from the portal). Tablet functions start from the tablet's cookie, find the
// club with a SECURITY DEFINER resolver that returns ids only, then work under
// that club's RLS like everything else.
import { createHash } from "node:crypto";
import { sql } from "kysely";
import { can, loadAccess } from "@/lib/access/entitlements";
import { audit } from "@/lib/audit";
import { type Database, db, isUuid, type Tx, withTenant } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { normalizeEmail, signUp, startSeries } from "@/lib/marketing/people";
import { getMarketingSettings, tenantInfo } from "@/lib/marketing/store";
import { formatMoney } from "@/lib/sales/money";
import { publicProducts } from "@/lib/sales/products";
import { getSalesSettings, readPayments } from "@/lib/sales/store";
import { qrFor } from "./qr";
import { checkPin, codeHash, hashPin, newDeviceToken, newPairCode, tokenHash } from "./secrets";
import { firstName, type KioskConfig, lookupFrom, PAIR_CODE_MINUTES, PIN_PATTERN, readKioskConfig, signaturePath, signatureTooLong, TOUR_TIMES, waiverReady, type WaiverText, welcomeLine } from "./settings";

export class KioskError extends Error {}

// ---- What staff set up -----------------------------------------------------------

export type KioskSetup = { config: KioskConfig; pinSet: boolean; pinSetAt: Date | null; waiver: WaiverText };

export async function readKiosk(tx: Tx): Promise<KioskSetup> {
  const row = await tx.selectFrom("kiosk_settings").select(["config", "pin_hash", "pin_set_at", "waiver_title", "waiver_body", "waiver_version"]).executeTakeFirst();
  return {
    config: readKioskConfig(row?.config),
    pinSet: Boolean(row?.pin_hash),
    pinSetAt: row?.pin_set_at ?? null,
    waiver: { title: row?.waiver_title ?? "", body: row?.waiver_body ?? "", version: row?.waiver_version ?? 0 },
  };
}

export async function saveKioskConfig(tx: Tx, config: KioskConfig): Promise<void> {
  const json = JSON.stringify(readKioskConfig(config));
  await tx.insertInto("kiosk_settings").values({ config: json }).onConflict((oc) => oc.column("tenant_id").doUpdateSet({ config: json })).execute();
  await audit(tx, { action: "kiosk.settings", detail: { config: JSON.parse(json) } });
}

export async function setKioskPin(tx: Tx, pin: string): Promise<void> {
  if (!PIN_PATTERN.test(pin)) throw new KioskError("A PIN is 4 to 8 digits.");
  const hash = await hashPin(pin);
  const now = new Date();
  await tx.insertInto("kiosk_settings").values({ pin_hash: hash, pin_set_at: now }).onConflict((oc) => oc.column("tenant_id").doUpdateSet({ pin_hash: hash, pin_set_at: now })).execute();
  await audit(tx, { action: "kiosk.pin" });
}

/** Saves the waiver's words. A real change makes a new version, so people sign the new words. */
export async function saveWaiver(tx: Tx, title: string, body: string): Promise<{ version: number; changed: boolean }> {
  const t = title.replace(/\s+/g, " ").trim().slice(0, 120);
  const b = body.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000);
  if (!t) throw new KioskError("Give the waiver a title, like Release and waiver.");
  if (b.length < 40) throw new KioskError("The waiver is too short to sign. Write it out in full, or start from ours.");
  const now = await readKiosk(tx);
  if (now.waiver.title === t && now.waiver.body === b) return { version: now.waiver.version, changed: false };
  const row = await tx
    .insertInto("kiosk_settings")
    .values({ waiver_title: t, waiver_body: b, waiver_version: 1 })
    .onConflict((oc) => oc.column("tenant_id").doUpdateSet({ waiver_title: t, waiver_body: b, waiver_version: sql`kiosk_settings.waiver_version + 1` }))
    .returning("waiver_version")
    .executeTakeFirstOrThrow();
  await audit(tx, { action: "kiosk.waiver", detail: { version: row.waiver_version } });
  return { version: row.waiver_version, changed: true };
}

export type KioskDevice = { id: string; name: string; pairedBy: string; pairedAt: Date; lastSeenAt: Date };

export async function listDevices(tx: Tx): Promise<KioskDevice[]> {
  const rows = await tx.selectFrom("kiosk_devices").select(["id", "name", "paired_by", "paired_at", "last_seen_at"]).where("revoked_at", "is", null).orderBy("paired_at").limit(50).execute();
  return rows.map((r) => ({ id: r.id, name: r.name, pairedBy: r.paired_by, pairedAt: r.paired_at, lastSeenAt: r.last_seen_at }));
}

export async function unpairDevice(tx: Tx, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const r = await tx.updateTable("kiosk_devices").set({ revoked_at: new Date() }).where("id", "=", id).where("revoked_at", "is", null).executeTakeFirst();
  if (Number(r.numUpdatedRows) > 0) await audit(tx, { action: "kiosk.unpair", targetType: "kiosk_device", targetId: id });
  return Number(r.numUpdatedRows) > 0;
}

export const MAX_DEVICES = 10;

/** A code waiting to be typed on a tablet. The code itself is only shown once, when it's made. */
export async function waitingCode(tx: Tx): Promise<{ name: string; expiresAt: Date } | null> {
  const row = await tx.selectFrom("kiosk_pair_codes").select(["name", "expires_at"]).where("used_at", "is", null).where("expires_at", ">", new Date()).orderBy("created_at", "desc").limit(1).executeTakeFirst();
  return row ? { name: row.name, expiresAt: row.expires_at } : null;
}

/**
 * Makes a 6-digit code to pair a tablet, good for 10 minutes and once. Any
 * code the club made before stops working. Needs the staff PIN set first, so
 * nobody can leave the kiosk without it.
 */
export async function createPairCode(tx: Tx, name: string, actor: string, now = new Date()): Promise<{ code: string; expiresAt: Date }> {
  const label = name.replace(/\s+/g, " ").trim().slice(0, 60) || "Front desk";
  const setup = await readKiosk(tx);
  if (!setup.pinSet) throw new KioskError("Set a staff PIN first. It's how staff leave the kiosk on the tablet.");
  const paired = await tx.selectFrom("kiosk_devices").select(sql<string>`count(*)`.as("n")).where("revoked_at", "is", null).executeTakeFirstOrThrow();
  if (Number(paired.n) >= MAX_DEVICES) throw new KioskError(`You have ${MAX_DEVICES} tablets paired. Unpair one before adding another.`);
  await sql`select clear_expired_kiosk_codes()`.execute(tx);
  await tx.deleteFrom("kiosk_pair_codes").where("used_at", "is", null).execute();
  const expiresAt = new Date(now.getTime() + PAIR_CODE_MINUTES * 60_000);
  // A code another club is using right now can't be used twice; pick again.
  for (let i = 0; i < 8; i++) {
    const code = newPairCode();
    const row = await tx
      .insertInto("kiosk_pair_codes")
      .values({ code_hash: codeHash(code), name: label, created_by: actor.slice(0, 120), expires_at: expiresAt })
      .onConflict((oc) => oc.column("code_hash").where("used_at", "is", null).doNothing())
      .returning("id")
      .executeTakeFirst();
    if (row) {
      await audit(tx, { action: "kiosk.code", targetType: "kiosk_pair_code", targetId: row.id, detail: { name: label } });
      return { code, expiresAt };
    }
  }
  throw new KioskError("Couldn't make a code just now. Try again.");
}

// ---- The tablet ------------------------------------------------------------------

export type KioskScope = { tenantId: string; deviceId: string };
const scopeFor = (k: KioskScope) => ({ tenantId: k.tenantId, userId: `kiosk:${k.deviceId}` });

export async function deviceFor(token: string, database: Database = db()): Promise<KioskScope | null> {
  const { rows } = await sql<{ tenant_id: string; device_id: string }>`select * from resolve_kiosk_device(${tokenHash(token)})`.execute(database);
  return rows[0] ? { tenantId: rows[0].tenant_id, deviceId: rows[0].device_id } : null;
}

/** A network address as the pairing limit stores it: an HMAC, never the address itself. */
const addressHash = (address: string) => codeHash(`address:${address}`);

/** False when this address, or everyone together, has typed too many wrong codes lately. */
export async function pairingAllowed(address: string, database: Database = db()): Promise<boolean> {
  const { rows } = await sql<{ ok: boolean }>`select kiosk_pair_allowed(${addressHash(address)}) as ok`.execute(database);
  return rows[0]?.ok === true;
}

export async function pairingFailed(address: string, database: Database = db()): Promise<void> {
  await sql`select kiosk_pair_failed(${addressHash(address)})`.execute(database);
}

/** Pairs this tablet with the club whose code was typed. Returns the token for the tablet's cookie. */
export async function pairWithCode(code: string, database: Database = db()): Promise<{ token: string; scope: KioskScope } | null> {
  const { rows } = await sql<{ tenant_id: string; code_id: string }>`select * from resolve_kiosk_code(${codeHash(code)})`.execute(database);
  const found = rows[0];
  if (!found) return null;
  const token = newDeviceToken();
  return withTenant(
    { tenantId: found.tenant_id, userId: "kiosk:pairing" },
    async (tx) => {
      // Used once: whoever marks it used first gets the tablet.
      const used = await tx.updateTable("kiosk_pair_codes").set({ used_at: new Date() }).where("id", "=", found.code_id).where("used_at", "is", null).where("expires_at", ">", new Date()).returning(["name", "created_by"]).executeTakeFirst();
      if (!used) return null;
      const device = await tx.insertInto("kiosk_devices").values({ name: used.name, token_hash: tokenHash(token), paired_by: used.created_by }).returning("id").executeTakeFirstOrThrow();
      await tx.updateTable("kiosk_pair_codes").set({ device_id: device.id }).where("id", "=", found.code_id).execute();
      await audit(tx, { action: "kiosk.pair", targetType: "kiosk_device", targetId: device.id, detail: { name: used.name } });
      return { token, scope: { tenantId: found.tenant_id, deviceId: device.id } };
    },
    database,
  );
}

export type JoinOption = { id: string; name: string; price: string; description: string; url: string; qr: { size: number; path: string } };

/** What the tablet shows. Plain values only, so it can go to the browser. */
export type KioskView = {
  club: string;
  accent: string;
  logo: string | null;
  welcome: string;
  idleSeconds: number;
  pass: { label: string } | null;
  tour: { times: string[] } | null;
  join: JoinOption[] | null;
  checkIn: boolean;
  waiver: { title: string; body: string; version: number } | null;
  emailOptIn: boolean;
  deviceName: string;
  /** Changes whenever anything above does, so a tablet knows to reload. */
  stamp: string;
};

/** The products the join screen offers: the ones staff picked, or memberships and passes that don't ship. */
async function joinOptions(tx: Tx, config: KioskConfig, slug: string, currency: string): Promise<JoinOption[]> {
  const products = await publicProducts(tx, 200);
  const picked = config.join.productIds.length ? config.join.productIds.map((id) => products.find((p) => p.id === id)).filter((p): p is (typeof products)[number] => Boolean(p)) : products.filter((p) => p.variants.filter((v) => v.active).every((v) => v.weightOz <= 0)).slice(0, 4);
  return picked.map((p) => {
    const url = `${appUrl()}/p/${slug}/shop/${p.slug}?from=kiosk`;
    const price = p.minCents === p.maxCents ? formatMoney(p.minCents, currency) : `From ${formatMoney(p.minCents, currency)}`;
    return { id: p.id, name: p.name, price, description: p.description.split("\n")[0]?.slice(0, 200) ?? "", url, qr: qrFor(url) };
  });
}

/** What a club's kiosk shows, read inside that club's transaction. */
async function buildView(tx: Tx, deviceName: string): Promise<KioskView | null> {
  const info = await tenantInfo(tx);
  const access = { access: await loadAccess(tx) };
  if (info.edition !== "fit" || !can(access, "kiosk")) return null;
  const setup = await readKiosk(tx);
  const c = setup.config;
  const brand = (await getMarketingSettings(tx, info)).brand;
  const club = brand.businessName || info.name;
  let join: JoinOption[] | null = null;
  if (c.join.on && can(access, "sales.checkout")) {
    const [sales, pay] = [await getSalesSettings(tx), await readPayments(tx)];
    if (sales.store.shopOn && pay.chargesEnabled) {
      const options = await joinOptions(tx, c, info.slug, sales.store.currency);
      join = options.length ? options : null;
    }
  }
  return stamped({
    club,
    accent: brand.colors.accent || info.accent,
    logo: brand.logo?.src ?? null,
    welcome: welcomeLine(c, club),
    idleSeconds: c.idleSeconds,
    pass: c.pass.on ? { label: c.pass.label } : null,
    tour: c.tour.on ? { times: [...TOUR_TIMES] } : null,
    join,
    checkIn: c.checkIn.on,
    waiver: c.waiver.on && waiverReady(setup.waiver) ? setup.waiver : null,
    emailOptIn: c.emailOptIn && can(access, "marketing.subscribers"),
    deviceName,
  });
}

export function stamped(v: Omit<KioskView, "stamp">): KioskView {
  return { ...v, stamp: createHash("sha256").update(JSON.stringify(v)).digest("base64url").slice(0, 16) };
}

export async function kioskView(k: KioskScope, database: Database = db()): Promise<KioskView | null> {
  return withTenant(
    scopeFor(k),
    async (tx) => {
      const device = await tx.selectFrom("kiosk_devices").select(["name", "last_seen_at"]).where("id", "=", k.deviceId).where("revoked_at", "is", null).executeTakeFirst();
      if (!device) return null;
      const view = await buildView(tx, device.name);
      if (view && Date.now() - device.last_seen_at.getTime() > 120_000) await tx.updateTable("kiosk_devices").set({ last_seen_at: new Date() }).where("id", "=", k.deviceId).execute();
      return view;
    },
    database,
  );
}

/** The kiosk as staff will see it on a tablet, for the preview in Settings. */
export async function previewView(tx: Tx): Promise<KioskView | null> {
  return buildView(tx, "Preview");
}

// ---- What people do at the tablet ------------------------------------------------

export type KioskResult = { ok: true; message: string; name?: string; visits?: number; needsWaiver?: boolean; queued?: boolean } | { ok: false; status: number; message: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

type Person = { name: string; email: string; phone: string };

function readPerson(input: Record<string, unknown>): Person | string {
  const name = str(input.name, 120);
  const email = normalizeEmail(input.email);
  const phone = str(input.phone, 40);
  if (name.length < 2) return "Enter your name.";
  if (!email) return "Enter your email, like you@example.com.";
  if (phone && phone.replace(/\D/g, "").length < 7) return "That phone number looks short. Check it, or leave it blank.";
  return { name, email, phone };
}

/** One contact per email. Like a public form, fills in what's missing and never overwrites the team's details. */
async function upsertContact(tx: Tx, p: Person): Promise<string> {
  const row = await tx
    .insertInto("contacts")
    .values({ email: p.email, name: p.name, phone: p.phone })
    .onConflict((oc) =>
      oc.columns(["tenant_id", "email"]).doUpdateSet({
        last_seen_at: sql`now()`,
        name: sql`coalesce(nullif(contacts.name, ''), excluded.name)`,
        phone: sql`coalesce(nullif(contacts.phone, ''), excluded.phone)`,
      }),
    )
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/** Signs them up for email when they ticked the box and the club has Marketing, then starts any form series. */
async function followUp(tx: Tx, p: Person, optIn: boolean, detail: string): Promise<boolean> {
  const access = { access: await loadAccess(tx) };
  if (!can(access, "marketing.sequences")) return false;
  let started = 0;
  let subscriberId: string | null = null;
  if (optIn && can(access, "marketing.subscribers")) {
    const settings = await getMarketingSettings(tx, await tenantInfo(tx));
    const r = await signUp(tx, { email: p.email, name: p.name, source: "form", detail, offer: settings.offer });
    if (r.ok) {
      subscriberId = r.id;
      started += r.created || r.resubscribed ? 1 : 0;
    }
  }
  started += await startSeries(tx, "form", { email: p.email, name: p.name, subscriberId }, detail);
  return started > 0;
}

async function needsWaiver(tx: Tx, contactId: string, setup: KioskSetup): Promise<boolean> {
  if (!setup.config.waiver.on || !waiverReady(setup.waiver)) return false;
  const signed = await tx.selectFrom("kiosk_waivers").select("id").where("contact_id", "=", contactId).where("waiver_version", "=", setup.waiver.version).limit(1).executeTakeFirst();
  return !signed;
}

export async function claimPass(k: KioskScope, input: Record<string, unknown>, database: Database = db()): Promise<KioskResult> {
  const p = readPerson(input);
  if (typeof p === "string") return { ok: false, status: 400, message: p };
  return withTenant(
    scopeFor(k),
    async (tx) => {
      const setup = await readKiosk(tx);
      if (!setup.config.pass.on) return { ok: false, status: 409, message: "Free passes aren't offered here right now. Ask at the desk." };
      const contactId = await upsertContact(tx, p);
      await tx.insertInto("submissions").values({ contact_id: contactId, form_key: "kiosk", form_type: "kiosk-pass", fields: JSON.stringify({ name: p.name, email: p.email, ...(p.phone ? { phone: p.phone } : {}), pass: setup.config.pass.label }), alert: "{}" }).execute();
      const queued = await followUp(tx, p, input.optIn === true && setup.config.emailOptIn, "kiosk:pass");
      return { ok: true, message: "You're all set.", name: firstName(p.name), needsWaiver: await needsWaiver(tx, contactId, setup), queued };
    },
    database,
  );
}

export async function bookTour(k: KioskScope, input: Record<string, unknown>, database: Database = db()): Promise<KioskResult> {
  const p = readPerson(input);
  if (typeof p === "string") return { ok: false, status: 400, message: p };
  const when = (TOUR_TIMES as readonly string[]).includes(String(input.when)) ? String(input.when) : "";
  if (!when) return { ok: false, status: 400, message: "Pick a time that works for you." };
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";
  return withTenant(
    scopeFor(k),
    async (tx) => {
      const setup = await readKiosk(tx);
      if (!setup.config.tour.on) return { ok: false, status: 409, message: "Tours aren't booked here right now. Ask at the desk." };
      const contactId = await upsertContact(tx, p);
      // A new lead who books a tour reads as "Visit booked" in Leads.
      await tx.updateTable("contacts").set({ status: "qualified" }).where("id", "=", contactId).where("status", "=", "new").execute();
      await tx.insertInto("submissions").values({ contact_id: contactId, form_key: "kiosk", form_type: "kiosk-tour", fields: JSON.stringify({ name: p.name, email: p.email, ...(p.phone ? { phone: p.phone } : {}), when, ...(note ? { message: note } : {}) }), alert: "{}" }).execute();
      const queued = await followUp(tx, p, input.optIn === true && setup.config.emailOptIn, "kiosk:tour");
      return { ok: true, message: "Your tour request is in.", name: firstName(p.name), queued };
    },
    database,
  );
}

const NOT_FOUND = "We couldn't find you. Try the other one, phone or email, or ask at the desk.";

/** Checked in within this long counts as the same visit. */
const SAME_VISIT_MS = 30 * 60_000;

export async function checkIn(k: KioskScope, input: Record<string, unknown>, database: Database = db()): Promise<KioskResult> {
  const lookup = lookupFrom(input.lookup);
  if (!lookup) return { ok: false, status: 400, message: "Enter the phone number or email you signed up with." };
  return withTenant(
    scopeFor(k),
    async (tx) => {
      const setup = await readKiosk(tx);
      if (!setup.config.checkIn.on) return { ok: false, status: 409, message: "Check-in isn't on here right now. Ask at the desk." };
      // Only people who've joined, or been to the desk before (a pass, a tour, a waiver or a check-in).
      // Anyone else on the club's list gets the same answer as a stranger, so the tablet can't be used
      // to find out who's on it.
      let q = tx
        .selectFrom("contacts as c")
        .select(["c.id", "c.name"])
        .where("c.status", "<>", "spam")
        .where((eb) =>
          eb.or([
            eb("c.status", "=", "won"),
            eb.exists(eb.selectFrom("kiosk_check_ins as k").select("k.id").whereRef("k.contact_id", "=", "c.id")),
            eb.exists(eb.selectFrom("kiosk_waivers as w").select("w.id").whereRef("w.contact_id", "=", "c.id")),
            eb.exists(eb.selectFrom("submissions as s").select("s.id").whereRef("s.contact_id", "=", "c.id").where("s.form_type", "in", ["kiosk-pass", "kiosk-tour"])),
          ]),
        );
      q = lookup.kind === "email" ? q.where("c.email", "=", lookup.value) : q.where(sql<boolean>`right(regexp_replace(c.phone, '\\D', '', 'g'), 10) = ${lookup.value}`);
      const found = await q.limit(2).execute();
      if (found.length === 0) return { ok: false, status: 404, message: NOT_FOUND };
      if (found.length > 1) return { ok: false, status: 409, message: "More than one person uses that number. Try your email instead." };
      const contact = found[0];
      // One at a time per person, so a double tap can't count two visits.
      await tx.selectFrom("contacts").select("id").where("id", "=", contact.id).forUpdate().executeTakeFirst();
      const last = await tx.selectFrom("kiosk_check_ins").select("checked_in_at").where("contact_id", "=", contact.id).orderBy("checked_in_at", "desc").limit(1).executeTakeFirst();
      const again = last && Date.now() - last.checked_in_at.getTime() < SAME_VISIT_MS;
      if (!again) {
        await tx.insertInto("kiosk_check_ins").values({ contact_id: contact.id, device_id: k.deviceId }).execute();
        await tx.updateTable("contacts").set({ last_seen_at: new Date() }).where("id", "=", contact.id).execute();
      }
      const tz = (await tx.selectFrom("settings").select("timezone").executeTakeFirstOrThrow()).timezone;
      const month = await sql<{ n: string }>`select count(*) as n from kiosk_check_ins where contact_id = ${contact.id} and checked_in_at >= (date_trunc('month', now() at time zone ${tz}) at time zone ${tz})`.execute(tx);
      return { ok: true, message: again ? "You're already checked in." : "You're checked in.", name: firstName(contact.name), visits: Number(month.rows[0]?.n ?? 0), needsWaiver: await needsWaiver(tx, contact.id, setup) };
    },
    database,
  );
}

export async function signWaiver(k: KioskScope, input: Record<string, unknown>, database: Database = db()): Promise<KioskResult> {
  const p = readPerson(input);
  if (typeof p === "string") return { ok: false, status: 400, message: p };
  if (input.agree !== true) return { ok: false, status: 400, message: "Tick the box to say you've read it and agree." };
  if (signatureTooLong(input.signature)) return { ok: false, status: 400, message: "That signature has too many lines for us to save. Clear it and sign once, a little smaller." };
  const signature = signaturePath(input.signature);
  if (!signature) return { ok: false, status: 400, message: "Sign in the box with your finger. A dot or a short line isn't enough." };
  const version = Number(input.version);
  return withTenant(
    scopeFor(k),
    async (tx) => {
      const setup = await readKiosk(tx);
      if (!setup.config.waiver.on || !waiverReady(setup.waiver)) return { ok: false, status: 409, message: "The waiver isn't on this tablet right now. Ask at the desk." };
      // They read one version; if staff changed it since, they sign the new words, not the old ones.
      if (version !== setup.waiver.version) return { ok: false, status: 409, message: "The waiver changed while you were reading it. Read the new one and sign again." };
      const contactId = await upsertContact(tx, p);
      await tx.insertInto("kiosk_waivers").values({ contact_id: contactId, device_id: k.deviceId, waiver_version: setup.waiver.version, title: setup.waiver.title, body: setup.waiver.body, signed_name: p.name, signature }).execute();
      return { ok: true, message: "Thanks. Your waiver is signed.", name: firstName(p.name) };
    },
    database,
  );
}

/** Wrong PINs in a row before the tablet waits, and how long it waits. */
export const PIN_TRIES = 5;
export const PIN_LOCK_MINUTES = 15;

export async function leaveKiosk(k: KioskScope, pin: unknown, database: Database = db()): Promise<{ ok: true } | { ok: false; message: string }> {
  return withTenant(
    scopeFor(k),
    async (tx) => {
      const device = await tx.selectFrom("kiosk_devices").select(["pin_failures", "pin_locked_until"]).where("id", "=", k.deviceId).where("revoked_at", "is", null).forUpdate().executeTakeFirst();
      if (!device) return { ok: true as const };
      if (device.pin_locked_until && device.pin_locked_until > new Date()) {
        const mins = Math.ceil((device.pin_locked_until.getTime() - Date.now()) / 60_000);
        return { ok: false as const, message: `Too many wrong PINs. Try again in ${mins} ${mins === 1 ? "minute" : "minutes"}, or unpair this tablet from Settings.` };
      }
      const row = await tx.selectFrom("kiosk_settings").select("pin_hash").executeTakeFirst();
      if (!(await checkPin(pin, row?.pin_hash ?? null))) {
        const failures = device.pin_failures + 1;
        const locked = failures >= PIN_TRIES;
        await tx
          .updateTable("kiosk_devices")
          .set({ pin_failures: locked ? 0 : failures, pin_locked_until: locked ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000) : null })
          .where("id", "=", k.deviceId)
          .execute();
        return { ok: false as const, message: locked ? `That's ${PIN_TRIES} wrong PINs. This tablet waits ${PIN_LOCK_MINUTES} minutes before trying again.` : "That PIN isn't right." };
      }
      await tx.updateTable("kiosk_devices").set({ revoked_at: new Date(), pin_failures: 0, pin_locked_until: null }).where("id", "=", k.deviceId).execute();
      await audit(tx, { action: "kiosk.leave", targetType: "kiosk_device", targetId: k.deviceId });
      return { ok: true as const };
    },
    database,
  );
}

/** The tablet checking in now and then: still paired, and what its screens should show now. */
export async function ping(k: KioskScope, database: Database = db()): Promise<string | null> {
  const view = await kioskView(k, database);
  return view?.stamp ?? null;
}
