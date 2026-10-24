import { after } from "next/server";
import { demoMode } from "@/lib/env";
import { currentTablet, json, readJson, tabletCookie } from "@/lib/kiosk/http";
import { bookTour, checkIn, claimPass, type KioskResult, leaveKiosk, signWaiver, stillPaired } from "@/lib/kiosk/store";
import { runEmailWork } from "@/lib/marketing/worker";
import { allow } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/sales/shop-http";

// Everything people do at a paired tablet. The tablet's cookie is the only
// thing that says which club it is; the body never does.
const MAX_BYTES = 64_000;

/** Per tablet, per minute and per hour. A busy desk at 6 am stays well under these. */
const LIMITS: Record<string, [number, number]> = { pass: [12, 120], tour: [12, 120], checkin: [40, 600], waiver: [12, 120], leave: [10, 30], ping: [10, 200] };

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, message: "Not allowed." }, 403);
  if (demoMode()) return json({ ok: false, message: "This is a demo, so nothing is saved." }, 404);
  const tablet = await currentTablet();
  if (!tablet) return json({ ok: false, message: "This tablet isn't paired anymore." }, 401, { "set-cookie": tabletCookie(null) });
  const body = await readJson(req, MAX_BYTES);
  if (body === "too-big") return json({ ok: false, message: "That's too much to send at once. Clear the signature and sign again." }, 413);
  if (!body) return json({ ok: false, message: "Couldn't read that. Try again." }, 400);
  const action = typeof body.action === "string" ? body.action : "";
  const limit = LIMITS[action];
  if (!limit) return json({ ok: false, message: "Couldn't read that. Try again." }, 400);
  const key = `kiosk:${tablet.scope.deviceId}:${action}`;
  if (!allow(`${key}:m`, limit[0], 60_000) || !allow(`${key}:h`, limit[1], 3_600_000)) return json({ ok: false, message: "That's a lot at once. Wait a minute, then try again." }, 429);

  try {
    if (action === "ping") return (await stillPaired(tablet.scope)) ? json({ ok: true }) : json({ ok: false }, 401, { "set-cookie": tabletCookie(null) });
    if (action === "leave") {
      const r = await leaveKiosk(tablet.scope, body.pin);
      return r.ok ? json({ ok: true, message: "" }, 200, { "set-cookie": tabletCookie(null) }) : json({ ok: false, message: r.message }, 403);
    }
    const r: KioskResult =
      action === "pass" ? await claimPass(tablet.scope, body) : action === "tour" ? await bookTour(tablet.scope, body) : action === "checkin" ? await checkIn(tablet.scope, body) : await signWaiver(tablet.scope, body);
    // Day 0 of a follow-up goes right away, not whenever the job next runs.
    if (r.ok && r.queued) after(() => runEmailWork({ tenantId: tablet.scope.tenantId, budgetMs: 30_000 }).then(() => undefined));
    if (!r.ok) return json({ ok: false, message: r.message }, r.status);
    return json({ ok: true, message: r.message, name: r.name, visits: r.visits, needsWaiver: r.needsWaiver });
  } catch (err) {
    console.error(`kiosk ${action} failed`, err);
    return json({ ok: false, message: "Something went wrong on our side, so this wasn't saved. Try again, or ask at the desk." }, 500);
  }
}
