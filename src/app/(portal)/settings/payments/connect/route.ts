import { may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { appUrl, demoMode } from "@/lib/env";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { onboardingUrl } from "@/lib/sales/connect";
import { PaymentsError } from "@/lib/sales/payments";

// Sends an owner or admin into Stripe's onboarding for the company's own
// account (made on the first visit). Stripe also sends people back here when a
// link has expired, so this makes a fresh one each time.
export async function GET() {
  const ctx = await getPortalContext();
  const back = (q: string) => Response.redirect(`${appUrl()}/settings/payments?${q}`, 303);
  if (!can(ctx.tenant, "sales.checkout")) return back("error=locked");
  if (!may(ctx.member.role, "settings.manage")) return back("error=role");
  if (demoMode()) return back("error=demo");
  try {
    const url = await onboardingUrl(scopeOf(ctx), { email: ctx.member.email, businessName: ctx.tenant.name, website: ctx.sites[0]?.domain ? `https://${ctx.sites[0].domain}` : null });
    return Response.redirect(url, 303);
  } catch (err) {
    console.error("Stripe onboarding link failed", err);
    return back(err instanceof PaymentsError && err.retry ? "error=busy" : "error=stripe");
  }
}
