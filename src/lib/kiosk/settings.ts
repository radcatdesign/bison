// What a club's front desk kiosk shows, and its waiver. Pure: read and checked
// here, saved by store.ts. Anything odd in the stored JSON falls back to the
// default, so a bad row can never break the tablet at the desk.
import { z } from "zod";

export const MAX_JOIN_PRODUCTS = 6;
export const IDLE_CHOICES = [30, 60, 120, 300] as const;
export const PAIR_CODE_MINUTES = 10;
export const PIN_PATTERN = /^\d{4,8}$/;
export const TOUR_TIMES = ["Morning", "Afternoon", "Evening", "Weekend"] as const;

export type KioskConfig = {
  /** The big line on the welcome screen. Empty means "Welcome to {club}". */
  welcome: string;
  pass: { on: boolean; label: string };
  tour: { on: boolean };
  join: { on: boolean; productIds: string[] };
  checkIn: { on: boolean };
  waiver: { on: boolean };
  /** Offer "Send me tips and offers" on the pass and tour forms (needs Marketing). */
  emailOptIn: boolean;
  /** Seconds without a touch before the kiosk goes back to the welcome screen. */
  idleSeconds: (typeof IDLE_CHOICES)[number];
};

export const DEFAULT_CONFIG: KioskConfig = {
  welcome: "",
  pass: { on: true, label: "Free trial pass" },
  tour: { on: true },
  join: { on: true, productIds: [] },
  checkIn: { on: true },
  waiver: { on: false },
  emailOptIn: true,
  idleSeconds: 60,
};

const text = (max: number) => z.string().transform((s) => s.replace(/\s+/g, " ").trim().slice(0, max));
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

const configSchema = z.object({
  welcome: text(80).catch(DEFAULT_CONFIG.welcome),
  pass: z.object({ on: z.boolean().catch(true), label: text(40).catch("") }).catch(DEFAULT_CONFIG.pass),
  tour: z.object({ on: z.boolean().catch(true) }).catch(DEFAULT_CONFIG.tour),
  join: z
    .object({ on: z.boolean().catch(true), productIds: z.array(uuid).catch([]) })
    .transform((j) => ({ on: j.on, productIds: [...new Set(j.productIds)].slice(0, MAX_JOIN_PRODUCTS) }))
    .catch(DEFAULT_CONFIG.join),
  checkIn: z.object({ on: z.boolean().catch(true) }).catch(DEFAULT_CONFIG.checkIn),
  waiver: z.object({ on: z.boolean().catch(false) }).catch(DEFAULT_CONFIG.waiver),
  emailOptIn: z.boolean().catch(true),
  idleSeconds: z
    .number()
    .refine((n): n is KioskConfig["idleSeconds"] => (IDLE_CHOICES as readonly number[]).includes(n))
    .catch(DEFAULT_CONFIG.idleSeconds),
});

export function readKioskConfig(raw: unknown): KioskConfig {
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  const parsed = configSchema.safeParse(value && typeof value === "object" ? value : {});
  const c = parsed.success ? (parsed.data as KioskConfig) : DEFAULT_CONFIG;
  return { ...c, pass: { on: c.pass.on, label: c.pass.label || DEFAULT_CONFIG.pass.label } };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/** The welcome line, with the club's name when the club hasn't written one. */
export const welcomeLine = (c: Pick<KioskConfig, "welcome">, club: string) => c.welcome || `Welcome to ${club}`;

// ---- The waiver ------------------------------------------------------------------

const PLACEHOLDER = /\[Add [^\]]*\]/;
export const hasPlaceholder = (s: string) => PLACEHOLDER.test(s);

export type WaiverText = { title: string; body: string; version: number };

/** Ready to sign: written, with no "[Add ...]" left in it. */
export const waiverReady = (w: WaiverText) => w.version > 0 && w.title.trim().length > 0 && w.body.trim().length >= 40 && !hasPlaceholder(w.title) && !hasPlaceholder(w.body);

/**
 * A starting point for the club to edit, with its own details marked. Not legal
 * advice: Settings says to have a lawyer read it before it goes on the tablet.
 */
export function starterWaiver(club: string): { title: string; body: string } {
  return {
    title: "Release and waiver",
    body: [
      `I want to use the facilities, classes and services of ${club} ([Add your club's legal name]), including any equipment, programs and training.`,
      "I understand that exercise and physical activity carry a risk of injury, including strains, falls, and in rare cases serious injury or death. I'm choosing to take part, and I accept those risks.",
      "I confirm I'm in good enough health to exercise, and that I'll talk to a doctor first if I'm unsure. I'll follow the club's rules and the instructions of its staff, and I'll stop and tell staff if I feel unwell.",
      `To the extent the law allows, I release ${club}, its owners, staff and instructors from claims for injury or loss that come from my taking part, except where caused by their gross negligence or willful misconduct.`,
      "I agree that the club may take care of me, or call emergency services, if I'm hurt or unwell, and that I'm responsible for any costs of that care.",
      "[Add anything your lawyer wants here, like photo consent, the state whose law applies, or rules for guests under 18.]",
      "I've read this, I understand it, and I'm signing it of my own free will.",
    ].join("\n\n"),
  };
}

// ---- Matching people at check-in -------------------------------------------------

/** The last 10 digits of a phone number, or null when there aren't at least 7. */
export function phoneKey(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

/** What the check-in box was given: an email, a phone number, or neither. */
export function lookupFrom(input: unknown): { kind: "email"; value: string } | { kind: "phone"; value: string } | null {
  if (typeof input !== "string") return null;
  const s = input.trim().slice(0, 254);
  if (s.includes("@")) {
    const email = s.toLowerCase();
    return /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/.test(email) ? { kind: "email", value: email } : null;
  }
  const key = phoneKey(s);
  return key ? { kind: "phone", value: key } : null;
}

/** First name only, so the screen at the desk never shows anyone's full name. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0]?.slice(0, 40) ?? "";

// ---- Signatures ------------------------------------------------------------------

export const SIGNATURE_BOX = { width: 600, height: 200 } as const;
const MAX_POINTS = 2500;

/** More than the box can hold: lots of strokes, or a very long scribble. */
export function signatureTooLong(strokes: unknown): boolean {
  if (!Array.isArray(strokes)) return false;
  if (strokes.length > 60) return true;
  return strokes.reduce((n: number, st) => n + (Array.isArray(st) ? st.length : 0), 0) > MAX_POINTS;
}

/**
 * Turns strokes from the signing pad into an SVG path in a 600 by 200 box, with
 * whole numbers only. Null when it's too small to be a signature, or too big.
 */
export function signaturePath(strokes: unknown): string | null {
  if (!Array.isArray(strokes) || strokes.length === 0 || strokes.length > 60) return null;
  const parts: string[] = [];
  let points = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const stroke of strokes) {
    if (!Array.isArray(stroke) || stroke.length === 0) continue;
    const pts: [number, number][] = [];
    for (const p of stroke) {
      if (!Array.isArray(p) || p.length !== 2) return null;
      const [x, y] = p;
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      const px = Math.round(Math.min(SIGNATURE_BOX.width, Math.max(0, x)));
      const py = Math.round(Math.min(SIGNATURE_BOX.height, Math.max(0, y)));
      pts.push([px, py]);
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
    }
    points += pts.length;
    if (points > MAX_POINTS) return null;
    parts.push(pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" "));
  }
  // A dot or a tiny tick isn't a signature.
  if (points < 6 || maxX - minX < 30) return null;
  return parts.join(" ");
}
