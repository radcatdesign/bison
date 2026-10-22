// Creating a tenant. The new tenant's rows are written under its own tenant
// context, so creation goes through the same RLS policies as everything else.
import { randomUUID } from "node:crypto";
import { audit } from "@/lib/audit";
import { type Database, db, withTenant } from "@/lib/db";
import type { Role } from "@/lib/db/types";

export type NewTenantInput = {
  /** Fixed id for seeds and tests. Normally left out. */
  id?: string;
  name: string;
  domain: string;
  industry?: string;
  clerkOrgId?: string | null;
  sampleData?: boolean;
  owner: { userId: string; email: string; name: string; role?: Role };
};

export class TenantInputError extends Error {}

export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/^www\./, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) {
    throw new TenantInputError("That doesn't look like a website address. Try something like yourcompany.com.");
  }
  return d;
}

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s.length >= 2 ? s : `company-${s}`.replace(/-$/, "");
}

function pgCode(err: unknown): { code?: string; constraint?: string } {
  return (err ?? {}) as { code?: string; constraint?: string };
}

export async function createTenant(input: NewTenantInput, database: Database = db()) {
  const name = input.name.trim();
  if (!name || name.length > 120) throw new TenantInputError("Add your company name (120 characters at most).");
  const domain = normalizeDomain(input.domain);
  const baseSlug = slugify(name);

  for (let attempt = 0; attempt < 5; attempt++) {
    const tenantId = input.id ?? randomUUID();
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomUUID().slice(0, 4)}`;
    try {
      return await withTenant(
        { tenantId, userId: input.owner.userId },
        async (tx) => {
          await tx
            .insertInto("tenants")
            .values({ id: tenantId, name, slug, industry: input.industry ?? "general", clerk_org_id: input.clerkOrgId ?? null, stripe_customer_id: null })
            .execute();
          await tx.insertInto("settings").values({ sample_data: input.sampleData ?? true, privacy: "{}" }).execute();
          const site = await tx.insertInto("sites").values({ domain }).returning(["id", "site_key"]).executeTakeFirstOrThrow();
          await tx
            .insertInto("members")
            .values({
              user_id: input.owner.userId,
              email: input.owner.email.trim().toLowerCase(),
              name: input.owner.name.trim(),
              role: input.owner.role ?? "owner",
            })
            .execute();
          await audit(tx, { action: "tenant.created", targetType: "tenant", targetId: tenantId, detail: { name, domain } });
          return { tenantId, slug, siteId: site.id, siteKey: site.site_key };
        },
        database,
      );
    } catch (err) {
      const { code, constraint } = pgCode(err);
      if (code === "23505" && constraint === "tenants_slug_key") continue;
      if (code === "23505" && constraint === "tenants_clerk_org_id_key") {
        throw new TenantInputError("This organization already has a Bison Ops account. Switch to it from the account menu.");
      }
      throw err;
    }
  }
  throw new Error("Couldn't find a free account name. Try a slightly different company name.");
}
