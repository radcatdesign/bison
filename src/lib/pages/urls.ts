import { appUrl } from "@/lib/env";

/** Where a published page lives. Tenants' own domains come later. */
export function publicPageUrl(tenantSlug: string, pageSlug: string): string {
  return `${appUrl()}/p/${tenantSlug}/${pageSlug}`;
}
