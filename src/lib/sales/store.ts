import "server-only";
// Reading and saving Sales settings, and the company's connections for taking
// payments (its Stripe account) and for shipping (ShipStation or UPS). Secrets
// are encrypted before they're stored and never leave the server.
import { type EditionKey, isEditionKey } from "@/config/editions";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import type { Tx } from "@/lib/db";
import { type Carrier, shipStation, shippingStandIn, standInCarrier, ups } from "./carriers";
import { type SalesSettings, readSalesSettings, type CarrierKey } from "./settings";

export type SalesPart = keyof SalesSettings;

/** Owners and admins, as the default people to tell about new orders. */
export async function teamEmails(tx: Tx): Promise<string[]> {
  const rows = await tx.selectFrom("members").select("email").where("status", "=", "active").where("role", "in", ["owner", "admin"]).orderBy("created_at").limit(5).execute();
  return rows.map((r) => r.email.toLowerCase());
}

/** The company's edition (tenants.edition), for words on pages and emails that have no session. */
export async function readEdition(tx: Tx): Promise<EditionKey> {
  const t = await tx.selectFrom("tenants").select("edition").executeTakeFirst();
  return isEditionKey(t?.edition) ? t.edition : "bison";
}

export async function getSalesSettings(tx: Tx): Promise<SalesSettings> {
  const row = await tx.selectFrom("sales_settings").select(["store", "shipping", "trade"]).executeTakeFirst();
  const settings = readSalesSettings(row, [], await readEdition(tx));
  if (!settings.store.alertEmails.length) settings.store.alertEmails = await teamEmails(tx);
  return settings;
}

export async function saveSalesPart<P extends SalesPart>(tx: Tx, part: P, value: SalesSettings[P]): Promise<void> {
  const json = JSON.stringify(value);
  await tx
    .insertInto("sales_settings")
    .values({ [part]: json })
    .onConflict((oc) => oc.column("tenant_id").doUpdateSet({ [part]: json }))
    .execute();
}

// ---- Payments (the company's Stripe account) ----------------------------------------

export type PaymentsConnection = {
  accountId: string | null;
  chargesEnabled: boolean;
  needsAction: boolean;
  status: string;
  tax: "active" | "pending" | "unknown";
  checkedAt: Date | null;
  error: string | null;
};

export const NO_PAYMENTS: PaymentsConnection = { accountId: null, chargesEnabled: false, needsAction: false, status: "none", tax: "unknown", checkedAt: null, error: null };

export async function readPayments(tx: Tx): Promise<PaymentsConnection> {
  const row = await tx.selectFrom("integrations").select(["public_config", "last_checked_at", "last_error"]).where("provider", "=", "stripe").executeTakeFirst();
  if (!row) return NO_PAYMENTS;
  const c = (row.public_config ?? {}) as Record<string, unknown>;
  return {
    accountId: typeof c.accountId === "string" ? c.accountId : null,
    chargesEnabled: c.chargesEnabled === true,
    needsAction: c.needsAction === true,
    status: typeof c.status === "string" ? c.status : "none",
    tax: c.tax === "active" || c.tax === "pending" ? c.tax : "unknown",
    checkedAt: row.last_checked_at,
    error: row.last_error,
  };
}

export async function writePayments(tx: Tx, p: PaymentsConnection): Promise<void> {
  const config = JSON.stringify({ accountId: p.accountId, chargesEnabled: p.chargesEnabled, needsAction: p.needsAction, status: p.status, tax: p.tax });
  const status = p.chargesEnabled ? "connected" : p.accountId ? "needs_attention" : "not_set_up";
  await tx
    .insertInto("integrations")
    .values({ provider: "stripe", status, public_config: config, last_checked_at: new Date(), last_error: p.error })
    .onConflict((oc) => oc.columns(["tenant_id", "provider"]).doUpdateSet({ status, public_config: config, last_checked_at: new Date(), last_error: p.error }))
    .execute();
}

// ---- Shipping carriers --------------------------------------------------------------

export type CarrierConnection = {
  key: CarrierKey;
  connected: boolean;
  /** Not secret: what the team sees about the connection. */
  detail: string;
  /** UPS account number, ShipStation carrier ids. */
  config: Record<string, unknown>;
  hasSecret: boolean;
  checkedAt: Date | null;
  error: string | null;
};

export async function readCarrier(tx: Tx, key: CarrierKey): Promise<CarrierConnection> {
  const row = await tx.selectFrom("integrations").select(["status", "public_config", "secret_ciphertext", "last_checked_at", "last_error"]).where("provider", "=", key).executeTakeFirst();
  const config = (row?.public_config ?? {}) as Record<string, unknown>;
  return { key, connected: row?.status === "connected", detail: typeof config.detail === "string" ? config.detail : "", config, hasSecret: Boolean(row?.secret_ciphertext), checkedAt: row?.last_checked_at ?? null, error: row?.last_error ?? null };
}

export async function writeCarrier(tx: Tx, tenantId: string, key: CarrierKey, input: { secret?: string | null; config: Record<string, unknown>; connected: boolean; error: string | null }): Promise<void> {
  const status = input.connected ? "connected" : input.error ? "needs_attention" : "not_set_up";
  const values: Record<string, unknown> = { provider: key, status, public_config: JSON.stringify(input.config), last_checked_at: new Date(), last_error: input.error };
  if (input.secret !== undefined) values.secret_ciphertext = input.secret === null ? null : encryptSecret(input.secret, `${tenantId}:${key}`);
  await tx
    .insertInto("integrations")
    .values(values as never)
    .onConflict((oc) => oc.columns(["tenant_id", "provider"]).doUpdateSet(values as never))
    .execute();
}

export async function removeCarrier(tx: Tx, key: CarrierKey): Promise<void> {
  await tx.deleteFrom("integrations").where("provider", "=", key).execute();
}

/** The secret for a carrier, decrypted on the server only. */
async function carrierSecret(tx: Tx, tenantId: string, key: CarrierKey): Promise<string | null> {
  const row = await tx.selectFrom("integrations").select("secret_ciphertext").where("provider", "=", key).executeTakeFirst();
  if (!row?.secret_ciphertext) return null;
  return decryptSecret(row.secret_ciphertext, `${tenantId}:${key}`);
}

/** Builds a carrier from what's stored, before it's been saved (for Test), or null. */
export function carrierFrom(key: CarrierKey, secret: string, config: Record<string, unknown>): Carrier {
  if (shippingStandIn()) return standInCarrier();
  if (key === "shipstation") return shipStation(secret, Array.isArray(config.carrierIds) ? (config.carrierIds as string[]) : []);
  const parsed = JSON.parse(secret) as { clientId: string; clientSecret: string };
  return ups({ clientId: parsed.clientId, clientSecret: parsed.clientSecret, accountNumber: String(config.accountNumber ?? ""), sandbox: config.sandbox === true });
}

/** The connected carrier the company chose for live rates (or fulfillment), or null. */
export async function connectedCarrier(tx: Tx, tenantId: string, key: CarrierKey | null): Promise<Carrier | null> {
  if (!key) return null;
  const conn = await readCarrier(tx, key);
  if (!conn.connected) return null;
  const secret = await carrierSecret(tx, tenantId, key);
  if (!secret) return null;
  return carrierFrom(key, secret, conn.config);
}
