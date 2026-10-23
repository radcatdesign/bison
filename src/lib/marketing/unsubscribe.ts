import "server-only";
// The public side of unsubscribing. A signed link names one send; the send
// names the person and the company. Nothing here needs a session.
import { sql } from "kysely";
import { type Database, db, withTenant } from "@/lib/db";
import type { UnsubscribeReason } from "@/lib/db/types";
import { checkUnsubscribeToken } from "@/lib/email/tokens";
import { resubscribeEmail, unsubscribeEmail } from "./people";
import { getMarketingSettings, tenantInfo } from "./store";

export type UnsubscribeView = {
  business: string;
  maskedEmail: string;
  accent: string;
  unsubscribed: boolean;
  /** Only someone who unsubscribed with a link can undo it with a link. */
  canResubscribe: boolean;
};

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  const shown = user.length <= 2 ? user[0] ?? "" : user.slice(0, 2);
  return `${shown}${"•".repeat(Math.max(2, Math.min(6, user.length - shown.length)))}@${domain}`;
}

async function resolve(token: unknown, database: Database) {
  const checked = checkUnsubscribeToken(token);
  if (!checked) return null;
  const { rows } = await sql<{ tenant_id: string | null }>`select resolve_email_send(${checked.id}) as tenant_id`.execute(database);
  const tenantId = rows[0]?.tenant_id;
  return tenantId ? { ...checked, tenantId } : null;
}

export async function viewUnsubscribe(token: unknown, database: Database = db()): Promise<UnsubscribeView | null> {
  const hit = await resolve(token, database);
  if (!hit) return null;
  return withTenant(
    { tenantId: hit.tenantId },
    async (tx) => {
      const send = await tx.selectFrom("email_sends").select("email").where("id", "=", hit.id).executeTakeFirst();
      if (!send) return null;
      const info = await tenantInfo(tx);
      const { brand } = await getMarketingSettings(tx, info);
      const row = await tx.selectFrom("unsubscribes").select("reason").where("email", "=", send.email).executeTakeFirst();
      return {
        business: brand.businessName,
        maskedEmail: maskEmail(send.email),
        accent: brand.colors.accent,
        unsubscribed: Boolean(row),
        canResubscribe: Boolean(row) && !hit.expired && (row!.reason === "link" || row!.reason === "one-click"),
      };
    },
    database,
  );
}

/** Works for any correctly signed link, however old: stopping email always has to work. */
export async function unsubscribeByToken(token: unknown, reason: Extract<UnsubscribeReason, "link" | "one-click">, database: Database = db()): Promise<boolean> {
  const hit = await resolve(token, database);
  if (!hit) return false;
  return withTenant(
    { tenantId: hit.tenantId, userId: "public:unsubscribe" },
    async (tx) => {
      const send = await tx.selectFrom("email_sends").select("email").where("id", "=", hit.id).executeTakeFirst();
      if (!send) return false;
      await unsubscribeEmail(tx, send.email, reason, `send ${hit.id}`);
      return true;
    },
    database,
  );
}

export async function resubscribeByToken(token: unknown, database: Database = db()): Promise<boolean> {
  const hit = await resolve(token, database);
  if (!hit || hit.expired) return false;
  return withTenant(
    { tenantId: hit.tenantId, userId: "public:unsubscribe" },
    async (tx) => {
      const send = await tx.selectFrom("email_sends").select("email").where("id", "=", hit.id).executeTakeFirst();
      return send ? resubscribeEmail(tx, send.email, ["link", "one-click"]) : false;
    },
    database,
  );
}
