import { demoMode } from "@/lib/env";
import { json, readJson, tabletCookie } from "@/lib/kiosk/http";
import { cleanCode } from "@/lib/kiosk/secrets";
import { pairWithCode } from "@/lib/kiosk/store";
import { addressKey, allow, clientIp } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/sales/shop-http";

// Pairs this tablet with a club, from the 6-digit code staff made in Settings.
// Codes last 10 minutes and work once; guessing is slowed per address and overall.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, message: "Not allowed." }, 403);
  if (demoMode()) return json({ ok: false, message: "This is a demo, so tablets can't be paired. Open the kiosk preview from Settings, Kiosk." }, 404);
  const who = addressKey(clientIp(req));
  if (!allow(`kiosk-pair:${who}`, 8, 10 * 60_000) || !allow("kiosk-pair:all", 600, 10 * 60_000)) {
    return json({ ok: false, message: "Too many tries. Wait a few minutes, then try again." }, 429);
  }
  const body = await readJson(req, 1_000);
  const code = body && body !== "too-big" ? cleanCode(body.code) : null;
  if (!code) return json({ ok: false, message: "Type the 6 digits from Settings, Kiosk." }, 400);
  try {
    const paired = await pairWithCode(code);
    if (!paired) return json({ ok: false, message: "That code didn't work. It may have run out, or been used. Make a new one in Settings, Kiosk." }, 404);
    return json({ ok: true }, 200, { "set-cookie": tabletCookie(paired.token) });
  } catch (err) {
    console.error("kiosk pairing failed", err);
    return json({ ok: false, message: "Something went wrong on our side. Try again in a minute." }, 500);
  }
}
