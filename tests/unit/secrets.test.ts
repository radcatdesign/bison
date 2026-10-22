import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret, parseKeyring, rotateSecret, secretVersion } from "@/lib/crypto/secrets";

const k1 = randomBytes(32).toString("base64");
const k2 = randomBytes(32).toString("base64");
const ring1 = parseKeyring(`1:${k1}`, "1");
const ring12 = parseKeyring(`1:${k1},2:${k2}`, "2");

describe("secrets at rest", () => {
  it("round-trips and never stores the plain value", () => {
    const stored = encryptSecret("sk_live_abc123", "tenant:stripe", ring1);
    expect(stored).not.toContain("sk_live_abc123");
    expect(decryptSecret(stored, "tenant:stripe", ring1)).toBe("sk_live_abc123");
  });

  it("uses a fresh nonce every time", () => {
    expect(encryptSecret("same", "ctx", ring1)).not.toBe(encryptSecret("same", "ctx", ring1));
  });

  it("refuses a value copied to another row", () => {
    const stored = encryptSecret("re_key", "tenant-a:resend", ring1);
    expect(() => decryptSecret(stored, "tenant-b:resend", ring1)).toThrow();
  });

  it("requires a context", () => {
    expect(() => encryptSecret("x", "", ring1)).toThrow("needs a context");
    expect(() => decryptSecret(encryptSecret("x", "ctx", ring1), "", ring1)).toThrow();
  });

  it("refuses a tampered value", () => {
    const parts = encryptSecret("re_key", "ctx", ring1).split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), "ctx", ring1)).toThrow();
  });

  it("refuses a shortened auth tag", () => {
    const parts = encryptSecret("re_key", "ctx", ring1).split(".");
    parts[2] = Buffer.from(parts[2], "base64url").subarray(0, 4).toString("base64url");
    expect(() => decryptSecret(parts.join("."), "ctx", ring1)).toThrow("tampered");
  });

  it("rotates to the active key and still reads old values", () => {
    const old = encryptSecret("token", "ctx", ring1);
    expect(decryptSecret(old, "ctx", ring12)).toBe("token");
    const rotated = rotateSecret(old, "ctx", ring12);
    expect(secretVersion(rotated)).toBe(2);
    expect(decryptSecret(rotated, "ctx", ring12)).toBe("token");
    expect(rotateSecret(rotated, "ctx", ring12)).toBe(rotated);
  });

  it("says plainly when a key is missing or malformed", () => {
    expect(() => parseKeyring("1:short", "1")).toThrow("32 bytes");
    expect(() => parseKeyring(`1:${k1}`, "3")).toThrow("SECRETS_ACTIVE_KEY");
    const v2 = encryptSecret("x", "ctx", ring12);
    expect(() => decryptSecret(v2, "ctx", ring1)).toThrow("No key for secret version 2");
  });

  it("masks for display", () => {
    expect(maskSecret("sk_live_abcd1234")).toBe("••••1234");
    expect(maskSecret("abc")).toBe("••••");
  });
});
