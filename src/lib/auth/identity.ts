import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { resolveTenantByClerkOrg } from "@/lib/db";
import { authProvider } from "@/lib/env";
import { DEV_SESSION_COOKIE, readDevSession } from "./dev-session";

export type Identity = {
  provider: "clerk" | "dev";
  userId: string;
  /** Clerk organization id, when signed in with Clerk and an org is active. */
  orgId: string | null;
  /** Clerk organization role ("org:admin", "org:member"). Only used to decide who can set up a new account. */
  orgRole: string | null;
  /** The tenant this session is acting for, or null when none exists yet. */
  tenantId: string | null;
};

/** Who is signed in, and for which tenant. Says nothing about role; that comes from `members`. */
export async function getIdentity(): Promise<Identity | null> {
  // Request-time only. Reading cookies keeps this out of the static frame, and
  // connection() keeps it out of prefetch prerenders too (sessions check the clock).
  const jar = await cookies();
  await connection();
  if (authProvider() === "clerk") {
    const { auth } = await import("@clerk/nextjs/server");
    const session = await auth();
    if (!session.userId) return null;
    const orgId = session.orgId ?? null;
    return { provider: "clerk", userId: session.userId, orgId, orgRole: session.orgRole ?? null, tenantId: orgId ? await resolveTenantByClerkOrg(orgId) : null };
  }
  const dev = readDevSession(jar.get(DEV_SESSION_COOKIE)?.value);
  if (!dev) return null;
  return { provider: "dev", userId: dev.u, orgId: null, orgRole: null, tenantId: dev.t };
}
