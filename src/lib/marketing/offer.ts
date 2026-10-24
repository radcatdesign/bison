import "server-only";
// Welcome offer codes: one per signup, ever. Checking "first order only" at
// checkout comes with Sales; until then the team looks a code up here and
// marks it used.
import { sql } from "kysely";
import { editionOfIndustry } from "@/config/editions";
import { audit } from "@/lib/audit";
import { isUuid, type TenantScope, withTenant } from "@/lib/db";
import { seeded } from "@/lib/sample/random";
import type { SampleTenant } from "@/lib/sample/marketing";
import { sampleSubscribers } from "@/lib/sample/marketing";

export type CodeRow = { id: string; code: string; email: string; kind: "percent" | "amount"; discount: number; issuedAt: Date; expiresAt: Date | null; redeemedAt: Date | null; note: string };
export type CodeStats = { issued30: number; used: number; total: number };

export interface OfferRepo {
  mode: "sample" | "live";
  stats(): Promise<CodeStats>;
  list(q?: string): Promise<CodeRow[]>;
}

export function sampleOfferRepo(tenant: SampleTenant, now = new Date()): OfferRepo {
  const rand = seeded(`${tenant.id}:offer`);
  const people = sampleSubscribers(tenant, now).filter((s) => s.source === "page").slice(0, 80);
  const club = editionOfIndustry(tenant.industry) === "fit";
  const rows: CodeRow[] = people.map((p, i) => {
    const used = rand.chance(0.32) && i > 3;
    const code = `${club ? "INTRO" : "WELCOME"}-${(rand.int(100000, 999999) * 7919).toString(36).toUpperCase().slice(0, 6)}`;
    // Used some days after signing up, but never after today.
    const usedAfter = used ? Math.min(rand.int(1, 20) * 86_400_000, Math.max(0, now.getTime() - p.subscribedAt.getTime()) * 0.8) : 0;
    return {
      id: `sample-code-${i}`,
      code,
      email: p.email,
      kind: "percent",
      discount: 10,
      issuedAt: p.subscribedAt,
      expiresAt: new Date(p.subscribedAt.getTime() + 30 * 86_400_000),
      redeemedAt: used ? new Date(p.subscribedAt.getTime() + usedAfter) : null,
      note: used ? (club ? "Joined online" : "Online order") : "",
    };
  });
  return {
    mode: "sample",
    async stats() {
      return { issued30: rows.filter((r) => r.issuedAt.getTime() > now.getTime() - 30 * 86_400_000).length, used: rows.filter((r) => r.redeemedAt).length, total: rows.length };
    },
    async list(q) {
      const needle = q?.trim().toLowerCase();
      return rows.filter((r) => !needle || r.email.includes(needle) || r.code.toLowerCase().includes(needle)).slice(0, 100);
    },
  };
}

export function liveOfferRepo(scope: TenantScope): OfferRepo {
  return {
    mode: "live",
    async stats() {
      return withTenant(scope, async (tx) => {
        const { rows } = await sql<CodeStats>`select
            (select count(*)::int from offer_codes where issued_at >= now() - interval '30 days') as "issued30",
            (select count(*)::int from offer_codes where redeemed_at is not null) as used,
            (select count(*)::int from offer_codes) as total`.execute(tx);
        return rows[0];
      });
    },
    async list(q) {
      return withTenant(scope, async (tx) => {
        let query = tx.selectFrom("offer_codes").select(["id", "code", "email", "discount_kind", "discount", "issued_at", "expires_at", "redeemed_at", "redeemed_note"]).orderBy("issued_at", "desc").limit(100);
        const needle = q?.trim().slice(0, 100);
        if (needle) {
          const like = `%${needle.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
          query = query.where((eb) => eb.or([eb("email", "like", like), eb("code", "=", needle.toUpperCase())]));
        }
        const rows = await query.execute();
        return rows.map((r) => ({ id: r.id, code: r.code, email: r.email, kind: r.discount_kind, discount: Number(r.discount), issuedAt: r.issued_at, expiresAt: r.expires_at, redeemedAt: r.redeemed_at, note: r.redeemed_note }));
      });
    },
  };
}

export async function markCode(scope: TenantScope, id: string, used: boolean, note: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return withTenant(scope, async (tx) => {
    const r = await tx
      .updateTable("offer_codes")
      .set(used ? { redeemed_at: new Date(), redeemed_note: note.trim().slice(0, 200) } : { redeemed_at: null, redeemed_note: "" })
      .where("id", "=", id)
      .returning("code")
      .executeTakeFirst();
    if (r) await audit(tx, { action: used ? "offer_code.used" : "offer_code.unused", targetType: "offer_code", targetId: id, detail: { code: r.code } });
    return Boolean(r);
  });
}
