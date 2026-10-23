import "server-only";
// Sharing one contact's page with someone outside the team (a rep, a partner,
// an installer) at a signed link that expires. The page shows who they are,
// what they sent, and their orders, estimates and carts, never team notes.
// Revoking a link, or letting it run out, turns it off at once.
import { sql } from "kysely";
import type { EditionKey } from "@/config/editions";
import { can, loadAccess } from "@/lib/access/entitlements";
import { type Database, db, isUuid, type Tx, withTenant } from "@/lib/db";
import { checkLink, linkId, signLink } from "@/lib/email/tokens";
import { appUrl } from "@/lib/env";
import { estimatesFor } from "./estimates";
import { ordersFor } from "./orders";
import type { PricedCart } from "./pricing";
import type { EstimateRow, OrderRow } from "./types";

export const SHARE_DAYS = [1, 7, 30] as const;
const MAX_DAYS = 30;

export type ContactShare = { id: string; url: string; expiresAt: Date; createdBy: string; createdAt: Date };

const shareUrl = (id: string, issuedAt: number) => `${appUrl()}/s/${signLink("contact-share", id, issuedAt)}`;

export class ShareError extends Error {}

export async function createShare(tx: Tx, contactId: string, days: number, actor: string): Promise<ContactShare> {
  if (!isUuid(contactId)) throw new ShareError("That person isn't here anymore.");
  const keep = SHARE_DAYS.includes(days as (typeof SHARE_DAYS)[number]) ? days : 7;
  const contact = await tx.selectFrom("contacts").select("id").where("id", "=", contactId).executeTakeFirst();
  if (!contact) throw new ShareError("That person isn't here anymore.");
  const now = new Date();
  const row = await tx
    .insertInto("contact_shares")
    .values({ contact_id: contactId, expires_at: new Date(now.getTime() + keep * 86_400_000), created_by: actor.slice(0, 120), created_at: now, updated_at: now })
    .returning(["id", "expires_at", "created_by", "created_at"])
    .executeTakeFirstOrThrow();
  return { id: row.id, url: shareUrl(row.id, row.created_at.getTime()), expiresAt: row.expires_at, createdBy: row.created_by, createdAt: row.created_at };
}

/** Links still working for this contact. */
export async function activeShares(tx: Tx, contactId: string): Promise<ContactShare[]> {
  if (!isUuid(contactId)) return [];
  const rows = await tx.selectFrom("contact_shares").select(["id", "expires_at", "created_by", "created_at"]).where("contact_id", "=", contactId).where("revoked_at", "is", null).where("expires_at", ">", new Date()).orderBy("created_at", "desc").limit(10).execute();
  return rows.map((r) => ({ id: r.id, url: shareUrl(r.id, r.created_at.getTime()), expiresAt: r.expires_at, createdBy: r.created_by, createdAt: r.created_at }));
}

export async function revokeShare(tx: Tx, shareId: string): Promise<boolean> {
  if (!isUuid(shareId)) return false;
  const r = await tx.updateTable("contact_shares").set({ revoked_at: new Date() }).where("id", "=", shareId).where("revoked_at", "is", null).executeTakeFirst();
  return Number(r.numUpdatedRows) > 0;
}

export type SharedCart = { status: string; itemCount: number; subtotalCents: number; currency: string; lastActiveAt: Date; items: { name: string; variant: string; qty: number }[] };

export type SharedContact = {
  business: string;
  /** The company's edition, so a club's page reads in club words. */
  edition: EditionKey;
  contact: { name: string; email: string; phone: string; firstSeenAt: Date; lastSeenAt: Date };
  sent: { formType: string; at: Date; fields: Record<string, string> }[];
  orders: OrderRow[];
  estimates: EstimateRow[];
  carts: SharedCart[];
  expiresAt: Date;
};

/** What a share link shows, or null when it's forged, revoked or expired. */
export async function openShare(token: string, database: Database = db()): Promise<SharedContact | null> {
  const id = linkId(token);
  if (!id) return null;
  const ok = checkLink("contact-share", token, MAX_DAYS);
  if (!ok || ok.expired || ok.id !== id) return null;
  const r = await sql<{ id: string | null }>`select resolve_contact_share(${id}::uuid) as id`.execute(database);
  const tenantId = r.rows[0]?.id;
  if (!tenantId) return null;
  return withTenant(
    { tenantId, userId: "public:share" },
    async (tx) => {
      const share = await tx.selectFrom("contact_shares").select(["contact_id", "expires_at", "revoked_at"]).where("id", "=", id).executeTakeFirst();
      if (!share || share.revoked_at || share.expires_at <= new Date()) return null;
      // Links stop when the company no longer has contact sharing.
      if (!can({ access: await loadAccess(tx) }, "contacts.share")) return null;
      const c = await tx.selectFrom("contacts").select(["id", "name", "email", "phone", "first_seen_at", "last_seen_at"]).where("id", "=", share.contact_id).executeTakeFirst();
      if (!c) return null;
      const tenant = await tx.selectFrom("tenants").select(["name", "edition"]).executeTakeFirstOrThrow();
      const subs = await tx.selectFrom("submissions").select(["form_type", "fields", "created_at"]).where("contact_id", "=", c.id).orderBy("created_at", "desc").limit(20).execute();
      const carts = await tx.selectFrom("carts").select(["status", "priced", "last_active_at"]).where("email", "=", c.email).where("status", "in", ["abandoned", "open", "checkout", "inquiry"]).orderBy("last_active_at", "desc").limit(10).execute();
      return {
        business: tenant.name,
        edition: tenant.edition === "fit" ? "fit" : "bison",
        contact: { name: c.name, email: c.email, phone: c.phone, firstSeenAt: c.first_seen_at, lastSeenAt: c.last_seen_at },
        sent: subs.map((x) => ({ formType: x.form_type, at: x.created_at, fields: Object.fromEntries(Object.entries((x.fields ?? {}) as Record<string, unknown>).filter(([, v]) => typeof v === "string" && v).map(([k, v]) => [k, String(v).slice(0, 2000)])) })),
        orders: await ordersFor(tx, c.email),
        estimates: (await estimatesFor(tx, c.email)).filter((e) => e.status !== "draft"),
        carts: carts
          .map((x) => {
            const p = (x.priced ?? {}) as Partial<PricedCart>;
            return { status: x.status, itemCount: p.itemCount ?? 0, subtotalCents: p.subtotalCents ?? 0, currency: p.currency ?? "usd", lastActiveAt: x.last_active_at, items: (p.lines ?? []).map((l) => ({ name: l.name, variant: l.variant, qty: l.qty })) };
          })
          .filter((x) => x.itemCount > 0),
        expiresAt: share.expires_at,
      };
    },
    database,
  );
}

/** The Sales side of a contact, for the contact panel. */
export async function salesForContact(tx: Tx, contactId: string): Promise<{ orders: OrderRow[]; estimates: EstimateRow[]; carts: SharedCart[]; shares: ContactShare[] } | null> {
  if (!isUuid(contactId)) return null;
  const c = await tx.selectFrom("contacts").select(["email"]).where("id", "=", contactId).executeTakeFirst();
  if (!c) return null;
  const carts = await tx.selectFrom("carts").select(["status", "priced", "last_active_at"]).where("email", "=", c.email).where("status", "in", ["abandoned", "open", "checkout", "inquiry"]).orderBy("last_active_at", "desc").limit(10).execute();
  return {
    orders: await ordersFor(tx, c.email),
    estimates: await estimatesFor(tx, c.email),
    carts: carts
      .map((x) => {
        const p = (x.priced ?? {}) as Partial<PricedCart>;
        return { status: x.status, itemCount: p.itemCount ?? 0, subtotalCents: p.subtotalCents ?? 0, currency: p.currency ?? "usd", lastActiveAt: x.last_active_at, items: (p.lines ?? []).map((l) => ({ name: l.name, variant: l.variant, qty: l.qty })) };
      })
      .filter((x) => x.itemCount > 0),
    shares: await activeShares(tx, contactId),
  };
}
