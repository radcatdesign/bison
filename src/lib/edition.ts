import "server-only";
// Which edition a screen is in. Signed in, it's the company's (tenants.edition).
// Before sign-in (the sign-in page, onboarding), it's the ?edition= the person
// chose, then the host name (FIT_FUNNELS_HOSTS), then Bison Ops.
import { headers } from "next/headers";
import { type Edition, type EditionKey, editionFor, isEditionKey, type Say, sayFor } from "@/config/editions";
import { fitFunnelsHosts } from "@/lib/env";
import type { PortalContext } from "@/lib/portal";

export const editionOf = (ctx: Pick<PortalContext, "tenant">): Edition => editionFor(ctx.tenant.edition);

/** The words for this company's edition: `say("Products", "Memberships")`. */
export const sayOf = (ctx: Pick<PortalContext, "tenant">): Say => sayFor(ctx.tenant.edition);

export async function requestEdition(chosen?: unknown): Promise<EditionKey> {
  if (isEditionKey(chosen)) return chosen;
  const host = ((await headers()).get("host") ?? "").split(":")[0].toLowerCase();
  return fitFunnelsHosts().includes(host) ? "fit" : "bison";
}
