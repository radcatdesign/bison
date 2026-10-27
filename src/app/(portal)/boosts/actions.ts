"use server";

// Switching boosts on and off. Re-reads the session, checks the edition and the
// role on the server, and never takes the club from the form.
import { refresh } from "next/cache";
import { may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { boostSpec, isBoostKey } from "@/lib/boosts/catalog";
import { BoostError, setBoost } from "@/lib/boosts/store";
import { withTenant } from "@/lib/db";
import { DEMO_MESSAGE } from "@/lib/demo";
import { demoMode } from "@/lib/env";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { earn } from "@/lib/progress/repo";
import { gainedLine } from "@/lib/progress/store";
import { SampleModeError } from "@/lib/repo/types";

export type BoostResult = { ok: boolean; message: string; on?: boolean } | null;

const ON_LINE: Record<string, string> = {
  "Front desk agent": "Your front desk agent starts on it now. Drafts show up in Agents.",
  Kiosk: "Your kiosk tablets pick it up within a minute.",
  "Email to your team": "The next new lead sends an alert.",
};

export async function saveBoost(_prev: BoostResult, form: FormData): Promise<BoostResult> {
  const ctx = await getPortalContext();
  const key = form.get("key");
  if (!isBoostKey(key)) return { ok: false, message: "That boost isn't here anymore. Reload the page." };
  if (ctx.tenant.edition !== "fit" || !can(ctx.tenant, "kiosk")) return { ok: false, message: "Boosts are for Fit Funnels clubs." };
  if (!may(ctx.member.role, "settings.manage")) return { ok: false, message: "Only owners and admins can change boosts." };
  if (demoMode()) return { ok: false, message: DEMO_MESSAGE };
  if (ctx.settings.sampleData) return { ok: false, message: new SampleModeError().message };
  const on = form.get("on") === "on";
  const settings = { days: Number(form.get("days")) || undefined, visits: Number(form.get("visits")) || undefined, link: typeof form.get("link") === "string" ? String(form.get("link")) : undefined };
  const spec = boostSpec(key);
  try {
    await withTenant(scopeOf(ctx), (tx) => setBoost(tx, key, on, settings, ctx.member.name || ctx.member.email));
  } catch (err) {
    if (err instanceof BoostError) return { ok: false, message: err.message, on: false };
    console.error("saving a boost failed", err);
    return { ok: false, message: "Something went wrong on our side, so that wasn't saved. Try again in a minute." };
  }
  const line = on ? gainedLine(await earn(ctx)) : "";
  refresh();
  return { ok: true, message: on ? `${spec.name} is on. ${ON_LINE[spec.by]}${line}` : `${spec.name} is off.`, on };
}
