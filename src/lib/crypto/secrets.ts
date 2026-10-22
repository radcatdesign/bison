// Encrypts tenant secrets (API keys, webhook secrets, OAuth tokens) before they
// reach the database. AES-256-GCM with versioned keys:
//   SECRETS_KEYS="1:<base64 32 bytes>,2:<base64 32 bytes>"  SECRETS_ACTIVE_KEY=2
// Stored form: "v2.<iv>.<tag>.<ciphertext>" (base64url parts).
// Rotation: add a new key, make it active, then run rotateSecret() over stored values.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type Keyring = { active: number; keys: Map<number, Buffer> };

export function parseKeyring(spec = process.env.SECRETS_KEYS ?? "", active = process.env.SECRETS_ACTIVE_KEY ?? ""): Keyring {
  const keys = new Map<number, Buffer>();
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [v, b64] = part.split(":");
    const version = Number(v);
    const key = Buffer.from(b64 ?? "", "base64");
    if (!Number.isInteger(version) || version < 1) throw new Error(`SECRETS_KEYS has a bad version: "${v}"`);
    if (key.length !== 32) throw new Error(`SECRETS_KEYS key ${version} must be 32 bytes of base64.`);
    keys.set(version, key);
  }
  const activeVersion = Number(active);
  if (!keys.has(activeVersion)) throw new Error("SECRETS_ACTIVE_KEY must name a version in SECRETS_KEYS.");
  return { active: activeVersion, keys };
}

const b64u = (b: Buffer) => b.toString("base64url");
const TAG_BYTES = 16;

/**
 * `context` binds the ciphertext to where it's stored, for example
 * "<tenant id>:resend". Required, so a secret can't be moved to another row.
 */
export function encryptSecret(plaintext: string, context: string, keyring: Keyring = parseKeyring()): string {
  if (!context) throw new Error("encryptSecret needs a context, like \"<tenant id>:<provider>\".");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyring.keys.get(keyring.active)!, iv, { authTagLength: TAG_BYTES });
  // Binding the context (for example "tenant-id:provider") stops a ciphertext being moved to another row.
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v${keyring.active}.${b64u(iv)}.${b64u(cipher.getAuthTag())}.${b64u(body)}`;
}

export function decryptSecret(stored: string, context: string, keyring: Keyring = parseKeyring()): string {
  if (!context) throw new Error("decryptSecret needs the same context the secret was stored with.");
  const m = /^v(\d+)\.([\w-]+)\.([\w-]+)\.([\w-]*)$/.exec(stored);
  if (!m) throw new Error("Stored secret is not in the expected format.");
  const key = keyring.keys.get(Number(m[1]));
  if (!key) throw new Error(`No key for secret version ${m[1]}. Add it back to SECRETS_KEYS.`);
  const tag = Buffer.from(m[3], "base64url");
  // A shortened tag is easier to forge, so anything but the full 16 bytes is refused.
  if (tag.length !== TAG_BYTES) throw new Error("Stored secret has been tampered with.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(m[2], "base64url"), { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(m[4], "base64url")), decipher.final()]).toString("utf8");
}

export function secretVersion(stored: string): number | null {
  const m = /^v(\d+)\./.exec(stored);
  return m ? Number(m[1]) : null;
}

/** Re-encrypts with the active key. Returns the same string when it's already current. */
export function rotateSecret(stored: string, context: string, keyring: Keyring = parseKeyring()): string {
  if (secretVersion(stored) === keyring.active) return stored;
  return encryptSecret(decryptSecret(stored, context, keyring), context, keyring);
}

/** For showing a saved secret without revealing it: "••••4f2a". */
export function maskSecret(plaintext: string): string {
  return plaintext.length <= 4 ? "••••" : `••••${plaintext.slice(-4)}`;
}
