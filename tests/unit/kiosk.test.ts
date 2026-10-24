// The front desk kiosk's pure parts: reading its settings, matching people at
// check-in, signatures, the waiver, the secrets, and the nav and routes.
import { describe, expect, it } from "vitest";
import { MODES } from "@/config/modes";
import { demoWaiver } from "@/lib/kiosk/demo";
import { qrFor } from "@/lib/kiosk/qr";
import { checkPin, cleanCode, codeHash, hashPin, isDeviceToken, newDeviceToken, newPairCode, tokenHash } from "@/lib/kiosk/secrets";
import { DEFAULT_CONFIG, firstName, hasPlaceholder, lookupFrom, phoneKey, readKioskConfig, signaturePath, starterWaiver, waiverReady, welcomeLine } from "@/lib/kiosk/settings";

describe("kiosk settings", () => {
  it("falls back to the defaults for anything missing or odd", () => {
    expect(readKioskConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(readKioskConfig("not json")).toEqual(DEFAULT_CONFIG);
    const c = readKioskConfig({ pass: { on: false, label: "" }, idleSeconds: 7, join: { on: true, productIds: ["x", "11111111-1111-4111-8111-111111111111"] }, waiver: { on: "yes" } });
    expect(c.pass).toEqual({ on: false, label: "Free trial pass" });
    expect(c.idleSeconds).toBe(60);
    expect(c.join.productIds).toEqual([]);
    expect(c.waiver.on).toBe(false);
    expect(readKioskConfig({ join: { on: true, productIds: Array.from({ length: 9 }, (_, i) => `11111111-1111-4111-8111-11111111111${i}`) } }).join.productIds).toHaveLength(6);
  });

  it("welcomes people by the club's name unless the club wrote its own line", () => {
    expect(welcomeLine({ welcome: "" }, "Summit Strength Club")).toBe("Welcome to Summit Strength Club");
    expect(welcomeLine({ welcome: "Hey, you made it" }, "Summit")).toBe("Hey, you made it");
  });
});

describe("check-in", () => {
  it("reads a phone number or an email, and nothing else", () => {
    expect(lookupFrom("(541) 555-0142")).toEqual({ kind: "phone", value: "5415550142" });
    expect(lookupFrom("+1 541 555 0142")).toEqual({ kind: "phone", value: "5415550142" });
    expect(lookupFrom(" Maya@Example.com ")).toEqual({ kind: "email", value: "maya@example.com" });
    expect(lookupFrom("12345")).toBeNull();
    expect(lookupFrom("maya@")).toBeNull();
    expect(lookupFrom(42)).toBeNull();
    expect(phoneKey("555-0142")).toBe("5550142");
  });

  it("shows a first name only", () => {
    expect(firstName("  Mo Ellis Grant ")).toBe("Mo");
    expect(firstName("")).toBe("");
  });
});

describe("signatures", () => {
  it("keeps strokes inside the box as whole numbers, and turns down dots and junk", () => {
    const path = signaturePath([
      [
        [10.4, 20.6],
        [90, 150],
        [700, -5],
      ],
      [
        [100, 100],
        [140, 120],
        [180, 100],
      ],
    ]);
    expect(path).toBe("M10 21 L90 150 L600 0 M100 100 L140 120 L180 100");
    expect(path).toMatch(/^[ML0-9 ]+$/);
    expect(signaturePath([[[5, 5]]])).toBeNull();
    expect(signaturePath([[[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]]])).toBeNull();
    expect(signaturePath("M0 0")).toBeNull();
    expect(signaturePath([[["1", 2]]])).toBeNull();
    expect(signaturePath([Array.from({ length: 3000 }, (_, i) => [i % 600, 50])])).toBeNull();
  });
});

describe("the waiver", () => {
  it("starts with the club's details to fill in, and isn't ready until they are", () => {
    const w = starterWaiver("Summit Strength Club");
    expect(w.body).toContain("Summit Strength Club");
    expect(hasPlaceholder(w.body)).toBe(true);
    expect(waiverReady({ ...w, version: 1 })).toBe(false);
    expect(waiverReady({ ...demoWaiver("Summit Strength Club") })).toBe(true);
    expect(waiverReady({ title: "Waiver", body: "Too short", version: 1 })).toBe(false);
    expect(waiverReady({ title: "Waiver", body: "x".repeat(60), version: 0 })).toBe(false);
  });
});

describe("kiosk secrets", () => {
  it("makes 6-digit codes, reads them typed with spaces, and hashes them", () => {
    for (let i = 0; i < 50; i++) expect(newPairCode()).toMatch(/^\d{6}$/);
    expect(cleanCode("482 913")).toBe("482913");
    expect(cleanCode("48291")).toBeNull();
    expect(cleanCode("4829134")).toBeNull();
    expect(codeHash("482913")).toMatch(/^[0-9a-f]{64}$/);
    expect(codeHash("482913")).not.toBe(codeHash("482914"));
  });

  it("makes tablet tokens that only match their own hash", () => {
    const t = newDeviceToken();
    expect(isDeviceToken(t)).toBe(true);
    expect(isDeviceToken("short")).toBe(false);
    expect(tokenHash(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash(t)).not.toBe(tokenHash(newDeviceToken()));
  });

  it("checks the staff PIN against its scrypt hash", async () => {
    const h = await hashPin("482913");
    expect(h).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await checkPin("482913", h)).toBe(true);
    expect(await checkPin("482914", h)).toBe(false);
    expect(await checkPin("12", h)).toBe(false);
    expect(await checkPin("482913", null)).toBe(false);
    expect(await checkPin("482913", "scrypt$9999999$8$1$a$b")).toBe(false);
    await expect(hashPin("12ab")).rejects.toThrow();
  });
});

describe("the kiosk in the app", () => {
  it("puts Front desk in Analyze for clubs only", () => {
    const desk = MODES.find((m) => m.key === "analyze")!.pages.find((p) => p.href === "/analyze/front-desk");
    expect(desk).toMatchObject({ feature: "kiosk", editions: ["fit"] });
  });

  it("draws a QR code as one path of whole squares", () => {
    const q = qrFor("https://example.com/p/summit/shop/day-pass?from=kiosk");
    expect(q.size).toBeGreaterThanOrEqual(21);
    expect(q.path).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
  });
});
