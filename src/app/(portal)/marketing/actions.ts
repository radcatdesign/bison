"use server";

// Marketing actions: brand kit, signup choices, subscribers and lists, and the
// sending domain. Each one re-reads the session, then checks the plan and the
// person's role on the server. Settings are content and save even with sample
// data on; subscriber changes are data, so sample mode refuses them.
import { refresh } from "next/cache";
import { CATALOG } from "@/config/catalog";
import type { FeatureKey } from "@/config/features";
import { type Action, may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { audit } from "@/lib/audit";
import { isUuid, withTenant } from "@/lib/db";
import { DEMO_MESSAGE } from "@/lib/demo";
import { demoMode } from "@/lib/env";
import { EmailProviderError, emailProvider, NOT_SET_UP } from "@/lib/email/provider";
import { BrandKitError, EMAIL_DOC_VERSION, parseBrandKit } from "@/lib/email/schema";
import { detectColumns, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseCsv, rowsFromCsv } from "@/lib/marketing/csv";
import { importPeople, normalizeEmail, resubscribeEmail, signUp, subscriberCount, unsubscribeEmail } from "@/lib/marketing/people";
import { FROM_LOCAL, isVerified, NO_SENDING, normalizeSendingDomain, readSending, writeSending } from "@/lib/marketing/sending";
import { markCode } from "@/lib/marketing/offer";
import { offerSettingsSchema, parseWith, searchSettingsSchema, SettingsInputError, signupSettingsSchema } from "@/lib/marketing/settings";
import { getMarketingSettings, ownFiles, saveMarketingPart, settingsTenantOf } from "@/lib/marketing/store";
import { sendTestEmail } from "@/lib/marketing/test-send";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";
import { SampleModeError } from "@/lib/repo/types";

export type MarketingResult = { ok: boolean; message: string };

const ROLE_MESSAGES: Partial<Record<Action, string>> = {
  "marketing.edit": "Your role can't change email or marketing settings.",
  "settings.manage": "Only owners and admins can set up email sending.",
  "data.delete": "Only owners and admins can delete subscribers.",
  "email.send": "Your role can't send email.",
};

type Guarded = { ctx: PortalContext; error: null } | { ctx: PortalContext; error: string };

async function guard(action: Action, feature: FeatureKey, opts: { data?: boolean } = {}): Promise<Guarded> {
  const ctx = await getPortalContext();
  if (!can(ctx.tenant, feature)) return { ctx, error: "This is part of Marketing. Unlock Marketing to use it." };
  if (!may(ctx.member.role, action)) return { ctx, error: ROLE_MESSAGES[action] ?? "Your role can't do that." };
  if (demoMode()) return { ctx, error: DEMO_MESSAGE };
  if (opts.data && ctx.settings.sampleData) return { ctx, error: new SampleModeError().message };
  return { ctx, error: null };
}

function failed(err: unknown, fallback: string): MarketingResult {
  if (err instanceof BrandKitError || err instanceof SettingsInputError || err instanceof EmailProviderError) return { ok: false, message: err.message };
  console.error(fallback, err);
  return { ok: false, message: fallback };
}

// ---- Brand kit ----------------------------------------------------------------------

export async function saveBrandKitAction(input: unknown): Promise<MarketingResult> {
  const { ctx, error } = await guard("marketing.edit", "marketing.brand-kit");
  if (error) return { ok: false, message: error };
  try {
    const brand = parseBrandKit(input);
    if (brand.logo?.src.startsWith("data:")) return { ok: false, message: "Upload the logo again; it didn't finish uploading." };
    const fileId = brand.logo?.src.match(/^\/f\/([0-9a-f-]{36})$/)?.[1];
    await withTenant(scopeOf(ctx), async (tx) => {
      if (fileId && !(await ownFiles(tx, [fileId]))) throw new BrandKitError("That logo isn't one of your uploads. Upload it again.");
      await saveMarketingPart(tx, "brand", brand);
      await audit(tx, { action: "marketing.brand_kit", detail: { address: Boolean(brand.address) } });
    });
    refresh();
    return { ok: true, message: "Brand kit saved. Every email uses it from now on." };
  } catch (err) {
    return failed(err, "Couldn't save the brand kit. Try again.");
  }
}

// ---- Signup choices ------------------------------------------------------------------

export async function saveSignupAction(input: unknown): Promise<MarketingResult> {
  const { ctx, error } = await guard("marketing.edit", "marketing.subscribers");
  if (error) return { ok: false, message: error };
  try {
    const signup = parseWith(signupSettingsSchema, input);
    await withTenant(scopeOf(ctx), async (tx) => {
      // Values already used by subscribers stay, so their answers keep meaning something.
      const current = await getMarketingSettings(tx, settingsTenantOf(ctx));
      const kept = new Set(signup.types.map((t) => t.value));
      const dropped = current.signup.types.filter((t) => !kept.has(t.value)).map((t) => t.value);
      if (dropped.length) {
        const inUse = await tx.selectFrom("subscribers").select("kind").where("kind", "in", dropped).limit(1).executeTakeFirst();
        if (inUse) {
          const label = current.signup.types.find((t) => t.value === inUse.kind)?.label ?? inUse.kind;
          throw new SettingsInputError(`Some subscribers chose "${label}", so it can't be removed. Rename it instead.`);
        }
      }
      await saveMarketingPart(tx, "signup", signup);
    });
    refresh();
    return { ok: true, message: "Signup choices saved." };
  } catch (err) {
    return failed(err, "Couldn't save the signup choices. Try again.");
  }
}

// ---- Subscribers ------------------------------------------------------------------------

const limitOf = () => CATALOG["module:marketing"].limits.subscribers ?? Infinity;

function cleanIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter(isUuid))].slice(0, 50) : [];
}

export async function addSubscriberAction(input: { email?: unknown; name?: unknown; kind?: unknown; listIds?: unknown }): Promise<MarketingResult> {
  const { ctx, error } = await guard("marketing.edit", "marketing.subscribers", { data: true });
  if (error) return { ok: false, message: error };
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, message: "That doesn't look like an email address." };
  try {
    const result = await withTenant(scopeOf(ctx), async (tx) => {
      const settings = await getMarketingSettings(tx, settingsTenantOf(ctx));
      const kind = typeof input.kind === "string" && settings.signup.types.some((t) => t.value === input.kind) ? input.kind : "";
      const existing = await tx.selectFrom("subscribers").select("id").where("email", "=", email).executeTakeFirst();
      if (!existing && (await subscriberCount(tx)) >= limitOf()) return { ok: false as const, message: `Your plan includes ${limitOf().toLocaleString("en-US")} subscribers, and you're there. Remove people who left, or contact us about a bigger plan.` };
      const lists = cleanIds(input.listIds);
      const ownLists = lists.length ? await tx.selectFrom("lists").select("id").where("id", "in", lists).execute() : [];
      const r = await signUp(tx, { email, name: typeof input.name === "string" ? input.name : "", kind, source: "manual", listIds: ownLists.map((l) => l.id), startSeries: true });
      if (!r.ok) return { ok: false as const, message: `${email} unsubscribed on ${r.since.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, so they can't be added back by hand. They can sign up again themselves.` };
      return { ok: true as const, message: r.created ? `Added ${email}.` : `${email} was already on your list. Anything missing was filled in.` };
    });
    if (result.ok) refresh();
    return result;
  } catch (err) {
    return failed(err, "Couldn't add that subscriber. Try again.");
  }
}

export async function importSubscribersAction(formData: FormData): Promise<MarketingResult & { counts?: { added: number; updated: number; skipped: number; invalid: number } }> {
  const { ctx, error } = await guard("marketing.edit", "marketing.subscribers", { data: true });
  if (error) return { ok: false, message: error };
  if (formData.get("consent") !== "on") return { ok: false, message: "Confirm that everyone in the file agreed to get email from you." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Pick a CSV file to import." };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, message: "That file is over 2 MB. Split it into smaller files." };

  const rows = parseCsv(await file.text());
  const found = detectColumns(rows);
  if (!found) return { ok: false, message: 'Couldn\'t find an email column. Name the column "Email", or put email addresses in the first column.' };
  const people = rowsFromCsv(rows, found);
  if (people.length > MAX_IMPORT_ROWS) return { ok: false, message: `That's ${people.length.toLocaleString("en-US")} rows. Import up to ${MAX_IMPORT_ROWS.toLocaleString("en-US")} at a time.` };

  try {
    const result = await withTenant(scopeOf(ctx), async (tx) => {
      const settings = await getMarketingSettings(tx, settingsTenantOf(ctx));
      const kinds = settings.signup.types;
      const kindOf = (raw: string) => {
        const v = raw.trim().toLowerCase();
        return kinds.find((k) => k.value === v || k.label.toLowerCase() === v)?.value ?? "";
      };
      const valid = people.map((p) => ({ ...p, email: normalizeEmail(p.email) })).filter((p): p is { email: string; name: string; kind: string } => !!p.email).map((p) => ({ ...p, kind: kindOf(p.kind) }));
      const invalid = people.length - valid.length;
      if (!valid.length) return { ok: false as const, message: "None of the rows had a valid email address." };

      let listId = typeof formData.get("listId") === "string" && isUuid(formData.get("listId")) ? String(formData.get("listId")) : null;
      if (listId && !(await tx.selectFrom("lists").select("id").where("id", "=", listId).executeTakeFirst())) listId = null;
      const newList = String(formData.get("newList") ?? "").trim().slice(0, 60);
      if (!listId && newList) {
        const l = await tx.insertInto("lists").values({ name: newList }).onConflict((oc) => oc.columns(["tenant_id", "name"]).doUpdateSet({ name: newList })).returning("id").executeTakeFirstOrThrow();
        listId = l.id;
      }

      const current = await subscriberCount(tx);
      const existing = new Set((await tx.selectFrom("subscribers").select("email").where("email", "in", valid.slice(0, 5000).map((v) => v.email)).execute()).map((r) => r.email));
      const newCount = new Set(valid.map((v) => v.email).filter((e) => !existing.has(e))).size;
      if (current + newCount > limitOf()) {
        return { ok: false as const, message: `This adds ${newCount.toLocaleString("en-US")} people, which goes past your plan's ${limitOf().toLocaleString("en-US")} subscribers. You have room for ${Math.max(0, limitOf() - current).toLocaleString("en-US")}.` };
      }
      const r = await importPeople(tx, valid, { listId, startSeries: formData.get("startSeries") === "on", detail: file.name.slice(0, 120) });
      return { ok: true as const, counts: { added: r.added, updated: r.updated, skipped: r.skippedUnsubscribed, invalid } };
    });
    if (!result.ok) return result;
    refresh();
    const c = result.counts;
    const parts = [`Added ${c.added.toLocaleString("en-US")}`, c.updated ? `updated ${c.updated.toLocaleString("en-US")} already on your list` : "", c.skipped ? `skipped ${c.skipped} who unsubscribed before` : "", c.invalid ? `skipped ${c.invalid} rows without a valid email` : ""].filter(Boolean);
    return { ok: true, message: `${parts.join(", ")}.`, counts: c };
  } catch (err) {
    return failed(err, "Couldn't import that file. Check it opens in a spreadsheet, then try again.");
  }
}

export async function updateSubscriberAction(id: string, input: { name?: unknown; kind?: unknown; listIds?: unknown }): Promise<MarketingResult> {
  const { ctx, error } = await guard("marketing.edit", "marketing.subscribers", { data: true });
  if (error) return { ok: false, message: error };
  if (!isUuid(id)) return { ok: false, message: "That subscriber doesn't exist." };
  try {
    await withTenant(scopeOf(ctx), async (tx) => {
      const settings = await getMarketingSettings(tx, settingsTenantOf(ctx));
      const kind = typeof input.kind === "string" && (input.kind === "" || settings.signup.types.some((t) => t.value === input.kind)) ? input.kind : undefined;
      const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : undefined;
      if (name !== undefined || kind !== undefined) await tx.updateTable("subscribers").set({ ...(name !== undefined ? { name } : {}), ...(kind !== undefined ? { kind } : {}) }).where("id", "=", id).execute();
      if (Array.isArray(input.listIds)) {
        const wanted = cleanIds(input.listIds);
        const own = wanted.length ? (await tx.selectFrom("lists").select("id").where("id", "in", wanted).execute()).map((l) => l.id) : [];
        await tx.deleteFrom("list_items").where("subscriber_id", "=", id).$if(own.length > 0, (q) => q.where("list_id", "not in", own)).execute();
        if (own.length) await tx.insertInto("list_items").values(own.map((list_id) => ({ list_id, subscriber_id: id }))).onConflict((oc) => oc.doNothing()).execute();
      }
    });
    refresh();
    return { ok: true, message: "Saved." };
  } catch (err) {
    return failed(err, "Couldn't save that. Try again.");
  }
}

export async function unsubscribeSubscriberAction(id: string): Promise<MarketingResult> {
  const { ctx, error } = await guard("marketing.edit", "marketing.subscribers", { data: true });
  if (error) return { ok: false, message: error };
  if (!isUuid(id)) return { ok: false, message: "That subscriber doesn't exist." };
  const done = await withTenant(scopeOf(ctx), async (tx) => {
    const s = await tx.selectFrom("subscribers").select("email").where("id", "=", id).executeTakeFirst();
    if (!s) return false;
    await unsubscribeEmail(tx, s.email, "team", ctx.member.email);
    return true;
  });
  if (!done) return { ok: false, message: "That subscriber doesn't exist." };
  refresh();
  return { ok: true, message: "Unsubscribed. Their series stopped and anything queued for them was canceled." };
}

export async function undoTeamUnsubscribeAction(id: string): Promise<MarketingResult> {
  const { ctx, error } = await guard("marketing.edit", "marketing.subscribers", { data: true });
  if (error) return { ok: false, message: error };
  if (!isUuid(id)) return { ok: false, message: "That subscriber doesn't exist." };
  const ok = await withTenant(scopeOf(ctx), async (tx) => {
    const s = await tx.selectFrom("subscribers").select("email").where("id", "=", id).executeTakeFirst();
    return s ? resubscribeEmail(tx, s.email, ["team"]) : false;
  });
  if (!ok) return { ok: false, message: "Only an unsubscribe your team made can be undone. People who unsubscribed themselves have to sign up again." };
  refresh();
  return { ok: true, message: "They're subscribed again." };
}

export async function deleteSubscriberAction(id: string): Promise<MarketingResult> {
  const { ctx, error } = await guard("data.delete", "marketing.subscribers", { data: true });
  if (error) return { ok: false, message: error };
  if (!isUuid(id)) return { ok: false, message: "That subscriber doesn't exist." };
  await withTenant(scopeOf(ctx), async (tx) => {
    await tx.deleteFrom("subscribers").where("id", "=", id).execute();
    await audit(tx, { action: "subscriber.deleted", targetType: "subscriber", targetId: id });
  });
  refresh();
  return { ok: true, message: "Deleted. If they had unsubscribed, they stay on your do-not-email list." };
}

// ---- Lists ---------------------------------------------------------------------------------

function listName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return name && name.length <= 60 ? name : null;
}

export async function createListAction(name: unknown): Promise<MarketingResult> {
  const { ctx, error } = await guard("marketing.edit", "marketing.subscribers", { data: true });
  if (error) return { ok: false, message: error };
  const clean = listName(name);
  if (!clean) return { ok: false, message: "Give the list a name of up to 60 characters." };
  try {
    await withTenant(scopeOf(ctx), (tx) => tx.insertInto("lists").values({ name: clean }).execute());
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return { ok: false, message: `You already have a list called ${clean}.` };
    return failed(err, "Couldn't make the list. Try again.");
  }
  refresh();
  return { ok: true, message: `Made ${clean}.` };
}

export async function renameListAction(id: string, name: unknown): Promise<MarketingResult> {
  const { ctx, error } = await guard("marketing.edit", "marketing.subscribers", { data: true });
  if (error) return { ok: false, message: error };
  const clean = listName(name);
  if (!clean || !isUuid(id)) return { ok: false, message: "Give the list a name of up to 60 characters." };
  try {
    await withTenant(scopeOf(ctx), (tx) => tx.updateTable("lists").set({ name: clean }).where("id", "=", id).execute());
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return { ok: false, message: `You already have a list called ${clean}.` };
    return failed(err, "Couldn't rename the list. Try again.");
  }
  refresh();
  return { ok: true, message: "Renamed." };
}

export async function deleteListAction(id: string): Promise<MarketingResult> {
  const { ctx, error } = await guard("marketing.edit", "marketing.subscribers", { data: true });
  if (error) return { ok: false, message: error };
  if (!isUuid(id)) return { ok: false, message: "That list doesn't exist." };
  const blocked = await withTenant(scopeOf(ctx), async (tx) => {
    const scheduled = await tx.selectFrom("newsletters").select("subject").where("list_id", "=", id).where("status", "in", ["scheduled", "sending"]).executeTakeFirst();
    if (scheduled) return scheduled.subject || "a newsletter";
    await tx.deleteFrom("lists").where("id", "=", id).execute();
    await audit(tx, { action: "list.deleted", targetType: "list", targetId: id });
    return null;
  });
  if (blocked) return { ok: false, message: `"${blocked}" is scheduled to go to this list. Change who it goes to first.` };
  refresh();
  return { ok: true, message: "List deleted. The people on it are still subscribed." };
}

// ---- Sending domain ------------------------------------------------------------------------

export async function addSendingDomainAction(input: unknown): Promise<MarketingResult> {
  const { ctx, error } = await guard("settings.manage", "marketing.newsletters");
  if (error) return { ok: false, message: error };
  const provider = emailProvider();
  if (!provider) return { ok: false, message: NOT_SET_UP };
  const domain = normalizeSendingDomain(typeof input === "string" ? input : "");
  if (!domain) return { ok: false, message: "That doesn't look like a domain. Try something like mail.yourcompany.com." };
  try {
    const current = await withTenant(scopeOf(ctx), (tx) => readSending(tx));
    if (current.domain && isVerified(current)) return { ok: false, message: `You're already sending from ${current.domain}. Remove it first to switch.` };
    const info = await provider.createDomain(domain);
    await withTenant(scopeOf(ctx), async (tx) => {
      await writeSending(tx, { ...current, domain: info.name || domain, domainId: info.id, status: info.status, records: info.records, checkedAt: new Date().toISOString(), verifiedAt: null, error: null });
      await audit(tx, { action: "sending.domain_added", detail: { domain } });
    });
    refresh();
    return { ok: true, message: `Added ${domain}. Now add the records below at your DNS host.` };
  } catch (err) {
    return failed(err, "Couldn't add that domain. Try again in a minute.");
  }
}

export async function checkSendingDomainAction(): Promise<MarketingResult & { status?: string }> {
  const { ctx, error } = await guard("marketing.edit", "marketing.newsletters");
  if (error) return { ok: false, message: error };
  const provider = emailProvider();
  if (!provider) return { ok: false, message: NOT_SET_UP };
  const current = await withTenant(scopeOf(ctx), (tx) => readSending(tx));
  if (!current.domainId) return { ok: false, message: "Add a domain first." };
  try {
    if (current.status !== "verified") await provider.verifyDomain(current.domainId);
    const info = await provider.getDomain(current.domainId);
    const verified = info.status === "verified";
    await withTenant(scopeOf(ctx), async (tx) => {
      await writeSending(tx, { ...current, status: info.status, records: info.records.length ? info.records : current.records, checkedAt: new Date().toISOString(), verifiedAt: verified ? (current.verifiedAt ?? new Date().toISOString()) : null, error: null });
      if (verified && current.status !== "verified") await audit(tx, { action: "sending.domain_verified", detail: { domain: current.domain } });
    });
    if (verified !== (current.status === "verified")) refresh();
    return {
      ok: true,
      status: info.status,
      message: verified
        ? `${current.domain} is verified. You can send from it now.`
        : info.status === "failed"
          ? "The records didn't match. Check each one against the table, fix any that differ, and check again."
          : "Not live yet. DNS changes usually show up within an hour, and can take up to a day. We'll keep checking while this page is open.",
    };
  } catch (err) {
    return failed(err, "Couldn't reach the email provider to check. Try again in a minute.");
  }
}

export async function setFromAddressAction(local: unknown): Promise<MarketingResult> {
  const { ctx, error } = await guard("settings.manage", "marketing.newsletters");
  if (error) return { ok: false, message: error };
  const clean = typeof local === "string" ? local.trim().toLowerCase() : "";
  if (!FROM_LOCAL.test(clean) || clean.length > 40) return { ok: false, message: "Use letters, numbers, dots or dashes, like hello or news." };
  await withTenant(scopeOf(ctx), async (tx) => writeSending(tx, { ...(await readSending(tx)), fromLocal: clean }));
  refresh();
  return { ok: true, message: "Saved." };
}

export async function removeSendingDomainAction(): Promise<MarketingResult> {
  const { ctx, error } = await guard("settings.manage", "marketing.newsletters");
  if (error) return { ok: false, message: error };
  await withTenant(scopeOf(ctx), async (tx) => {
    const current = await readSending(tx);
    await writeSending(tx, { ...NO_SENDING, fromLocal: current.fromLocal });
    await audit(tx, { action: "sending.domain_removed", detail: { domain: current.domain } });
  });
  refresh();
  return { ok: true, message: "Removed. Add a domain to send again." };
}

export async function sendSetupTestAction(to: unknown): Promise<MarketingResult> {
  const { ctx, error } = await guard("marketing.edit", "marketing.newsletters");
  if (error) return { ok: false, message: error };
  const settings = await withTenant(scopeOf(ctx), (tx) => getMarketingSettings(tx, settingsTenantOf(ctx)));
  const result = await sendTestEmail(scopeOf(ctx), {
    to: typeof to === "string" ? to : ctx.member.email,
    subject: `Sending works for ${settings.brand.businessName}`,
    preheader: "This is what your emails will look like.",
    doc: {
      version: EMAIL_DOC_VERSION,
      signOff: true,
      fallbackName: "there",
      sections: [
        { id: "hello", type: "text", heading: "Sending is set up", body: "Hi {first name},\n\nThis came from your own domain through Bison Ops, so your newsletters and series will arrive the same way.\n\nThe header, colors, sign-off and footer come from your brand kit. Change them there any time.", align: "left" },
      ],
    },
  });
  if (result.ok) refresh();
  return result;
}

// ---- Setup steps nobody can check for you ----------------------------------------------------

export async function markSetupStepAction(stepKey: string, done: boolean): Promise<MarketingResult> {
  if (stepKey !== "search.submit") return { ok: false, message: "That step ticks off on its own once it's done." };
  const { ctx, error } = await guard("marketing.edit", "marketing.seo");
  if (error) return { ok: false, message: error };
  await withTenant(scopeOf(ctx), async (tx) => {
    const current = await getMarketingSettings(tx, settingsTenantOf(ctx));
    await saveMarketingPart(tx, "search", parseWith(searchSettingsSchema, { ...current.search, submitted: done }));
  });
  refresh();
  return { ok: true, message: done ? "Marked as done." : "Marked as not done." };
}

// ---- Welcome offer ------------------------------------------------------------------------

export async function saveOfferAction(input: unknown): Promise<MarketingResult> {
  const { ctx, error } = await guard("marketing.edit", "marketing.welcome-offer");
  if (error) return { ok: false, message: error };
  try {
    const offer = parseWith(offerSettingsSchema, input);
    await withTenant(scopeOf(ctx), async (tx) => {
      await saveMarketingPart(tx, "offer", offer);
      await audit(tx, { action: "marketing.offer", detail: { on: offer.on, kind: offer.kind, value: offer.value } });
    });
    refresh();
    return { ok: true, message: offer.on ? "Saved. Everyone who signs up from now gets their own code." : "Saved. The offer is off, so new signups don't get a code." };
  } catch (err) {
    return failed(err, "Couldn't save the offer. Try again.");
  }
}

export async function markCodeAction(id: string, used: boolean, note: string): Promise<MarketingResult> {
  const { ctx, error } = await guard("marketing.edit", "marketing.welcome-offer", { data: true });
  if (error) return { ok: false, message: error };
  const ok = await markCode(scopeOf(ctx), id, used, String(note ?? ""));
  if (!ok) return { ok: false, message: "That code doesn't exist." };
  refresh();
  return { ok: true, message: used ? "Marked as used." : "Marked as not used." };
}

// ---- Search pack ---------------------------------------------------------------------------

export async function saveSearchAction(input: unknown): Promise<MarketingResult> {
  const { ctx, error } = await guard("marketing.edit", "marketing.seo");
  if (error) return { ok: false, message: error };
  try {
    await withTenant(scopeOf(ctx), async (tx) => {
      const current = await getMarketingSettings(tx, settingsTenantOf(ctx));
      const next = parseWith(searchSettingsSchema, { ...(input as object), submitted: current.search.submitted });
      await saveMarketingPart(tx, "search", next);
    });
    refresh();
    return { ok: true, message: "Saved. Your pages, sitemap and llms.txt use it now." };
  } catch (err) {
    return failed(err, "Couldn't save the business details. Try again.");
  }
}
