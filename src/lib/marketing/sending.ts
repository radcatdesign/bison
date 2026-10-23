import "server-only";
// Each company sends from its own domain. The domain is added to Resend from
// inside Bison Ops, the company adds the DNS records it shows, and we check
// until Resend says it's verified. Kept in the integrations row for "resend";
// nothing secret lives there (the Resend key is Bison Ops' own, in env).
import type { Tx } from "@/lib/db";
import type { DomainRecord, DomainStatus } from "@/lib/email/provider";
import type { BrandKit } from "@/lib/email/schema";

export type SendingState = {
  domain: string | null;
  domainId: string | null;
  status: DomainStatus | "none";
  records: DomainRecord[];
  /** The part before the @, like hello or news. */
  fromLocal: string;
  checkedAt: string | null;
  verifiedAt: string | null;
  error: string | null;
};

export const NO_SENDING: SendingState = { domain: null, domainId: null, status: "none", records: [], fromLocal: "hello", checkedAt: null, verifiedAt: null, error: null };

export const FROM_LOCAL = /^[a-z0-9]+([._-][a-z0-9]+)*$/;

export async function readSending(tx: Tx): Promise<SendingState> {
  const row = await tx.selectFrom("integrations").select(["public_config", "last_error", "last_checked_at"]).where("provider", "=", "resend").executeTakeFirst();
  if (!row) return NO_SENDING;
  const c = (row.public_config ?? {}) as Partial<SendingState>;
  return {
    domain: typeof c.domain === "string" ? c.domain : null,
    domainId: typeof c.domainId === "string" ? c.domainId : null,
    status: (c.status as SendingState["status"]) ?? "none",
    records: Array.isArray(c.records) ? c.records : [],
    fromLocal: typeof c.fromLocal === "string" && FROM_LOCAL.test(c.fromLocal) ? c.fromLocal : "hello",
    checkedAt: row.last_checked_at?.toISOString() ?? null,
    verifiedAt: typeof c.verifiedAt === "string" ? c.verifiedAt : null,
    error: row.last_error,
  };
}

export async function writeSending(tx: Tx, state: SendingState): Promise<void> {
  const config = { domain: state.domain, domainId: state.domainId, status: state.status, records: state.records, fromLocal: state.fromLocal, verifiedAt: state.verifiedAt };
  const status = state.status === "verified" ? "connected" : state.status === "failed" || state.status === "partially_failed" ? "needs_attention" : "not_set_up";
  await tx
    .insertInto("integrations")
    .values({ provider: "resend", status, public_config: JSON.stringify(config), last_error: state.error, last_checked_at: state.checkedAt ? new Date(state.checkedAt) : null })
    .onConflict((oc) =>
      oc.columns(["tenant_id", "provider"]).doUpdateSet({ status, public_config: JSON.stringify(config), last_error: state.error, last_checked_at: state.checkedAt ? new Date(state.checkedAt) : null }),
    )
    .execute();
}

export function isVerified(state: SendingState): boolean {
  return state.status === "verified" && Boolean(state.domain);
}

/** A display name that can't break out of the From header. */
export function headerName(name: string): string {
  return name.replace(/[\r\n"<>\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** "Brightwater Pools" <hello@mail.brightwaterpools.com>, only once the domain is verified. */
export function fromAddress(state: SendingState, brand: BrandKit): string | null {
  if (!isVerified(state)) return null;
  return `"${headerName(brand.fromName || brand.businessName)}" <${state.fromLocal}@${state.domain}>`;
}

/** Test sends before a domain is verified come from Bison Ops' own address, if one is set. */
export function testFromAddress(state: SendingState, brand: BrandKit): string | null {
  const own = fromAddress(state, brand);
  if (own) return own;
  const fallback = process.env.EMAIL_FALLBACK_FROM?.trim();
  if (!fallback || !/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(fallback)) return null;
  return `"${headerName(`${brand.fromName || brand.businessName} (test)`)}" <${fallback}>`;
}

export function normalizeSendingDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/^www\./, "");
  if (d.length > 200 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return null;
  return d;
}
