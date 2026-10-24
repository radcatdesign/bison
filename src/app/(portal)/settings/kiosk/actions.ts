"use server";

// Kiosk settings. Each action re-reads the session, checks the role and the
// edition on the server, and never takes the club from the form.
import { refresh } from "next/cache";
import type { ActionState } from "@/app/(portal)/actions";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { DEMO_MESSAGE } from "@/lib/demo";
import { demoMode } from "@/lib/env";
import { DEFAULT_CONFIG, IDLE_CHOICES, type KioskConfig, MAX_JOIN_PRODUCTS, PIN_PATTERN, waiverReady } from "@/lib/kiosk/settings";
import { createPairCode, KioskError, readKiosk, saveKioskConfig, saveWaiver, setKioskPin, unpairDevice } from "@/lib/kiosk/store";
import { getPortalContext, type PortalContext, scopeOf } from "@/lib/portal";

async function staff(): Promise<{ ctx: PortalContext; error: null } | { ctx: PortalContext; error: string }> {
  const ctx = await getPortalContext();
  if (ctx.tenant.edition !== "fit") return { ctx, error: "The front desk kiosk is for Fit Funnels clubs." };
  if (!may(ctx.member.role, "settings.manage")) return { ctx, error: "Only owners and admins can change the kiosk." };
  if (demoMode()) return { ctx, error: DEMO_MESSAGE };
  return { ctx, error: null };
}

const fail = (err: unknown): ActionState => {
  if (err instanceof KioskError) return { ok: false, message: err.message };
  console.error("kiosk settings failed", err);
  return { ok: false, message: "Something went wrong on our side, so that wasn't saved. Try again in a minute." };
};

export async function saveKioskSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx, error } = await staff();
  if (error) return { ok: false, message: error };
  const on = (k: string) => form.get(k) === "on";
  const idle = Number(form.get("idleSeconds"));
  try {
    return await withTenant(scopeOf(ctx), async (tx) => {
      const now = await readKiosk(tx);
      const wantsWaiver = on("waiverOn");
      if (wantsWaiver && !waiverReady(now.waiver)) return { ok: false, message: "Write the waiver below and save it before turning it on. Fill in anything marked [Add ...]." };
      const config: KioskConfig = {
        welcome: String(form.get("welcome") ?? ""),
        pass: { on: on("passOn"), label: String(form.get("passLabel") ?? "") || DEFAULT_CONFIG.pass.label },
        tour: { on: on("tourOn") },
        join: { on: on("joinOn"), productIds: form.getAll("product").map(String).slice(0, MAX_JOIN_PRODUCTS) },
        checkIn: { on: on("checkInOn") },
        waiver: { on: wantsWaiver },
        emailOptIn: on("emailOptIn"),
        idleSeconds: (IDLE_CHOICES as readonly number[]).includes(idle) ? (idle as KioskConfig["idleSeconds"]) : DEFAULT_CONFIG.idleSeconds,
      };
      if (form.getAll("product").length > MAX_JOIN_PRODUCTS) return { ok: false, message: `Pick up to ${MAX_JOIN_PRODUCTS} to show on the join screen.` };
      await saveKioskConfig(tx, config);
      refresh();
      return { ok: true, message: "Saved. Paired tablets show it the next time they go back to the welcome screen." };
    });
  } catch (err) {
    return fail(err);
  }
}

export async function setPin(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx, error } = await staff();
  if (error) return { ok: false, message: error };
  const pin = String(form.get("pin") ?? "");
  if (!PIN_PATTERN.test(pin)) return { ok: false, message: "Use 4 to 8 digits. Six is a good length." };
  if (pin !== String(form.get("confirm") ?? "")) return { ok: false, message: "The two PINs don't match. Type it again in both boxes." };
  if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) return { ok: false, message: "That PIN is easy to guess. Pick digits that aren't all the same or in a row." };
  try {
    await withTenant(scopeOf(ctx), (tx) => setKioskPin(tx, pin));
    refresh();
    return { ok: true, message: "Staff PIN saved. Share it only with your team." };
  } catch (err) {
    return fail(err);
  }
}

export async function saveWaiverText(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx, error } = await staff();
  if (error) return { ok: false, message: error };
  try {
    const r = await withTenant(scopeOf(ctx), (tx) => saveWaiver(tx, String(form.get("title") ?? ""), String(form.get("body") ?? "")));
    refresh();
    if (!r.changed) return { ok: true, message: "No changes to save." };
    return { ok: true, message: r.version > 1 ? `Saved as version ${r.version}. People who signed an earlier version are asked to sign this one at their next check-in.` : "Waiver saved. Turn it on above when it's ready." };
  } catch (err) {
    return fail(err);
  }
}

export type PairState = { ok: boolean; message: string; code?: string; expiresAt?: number } | null;

export async function pairTablet(_prev: PairState, form: FormData): Promise<PairState> {
  const { ctx, error } = await staff();
  if (error) return { ok: false, message: error };
  try {
    const r = await withTenant(scopeOf(ctx), (tx) => createPairCode(tx, String(form.get("name") ?? ""), ctx.member.email || ctx.member.name));
    return { ok: true, message: "", code: r.code, expiresAt: r.expiresAt.getTime() };
  } catch (err) {
    return fail(err);
  }
}

export async function unpairTablet(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx, error } = await staff();
  if (error) return { ok: false, message: error };
  try {
    const done = await withTenant(scopeOf(ctx), (tx) => unpairDevice(tx, String(form.get("deviceId") ?? "")));
    refresh();
    return done ? { ok: true, message: "Unpaired. That tablet goes back to the pairing screen within a minute." } : { ok: false, message: "That tablet was already unpaired." };
  } catch (err) {
    return fail(err);
  }
}
