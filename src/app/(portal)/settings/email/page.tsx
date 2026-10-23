import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { marketingGate } from "@/components/marketing/gate";
import { SendingSetup } from "@/components/marketing/sending-setup";
import { PageHeader } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { demoTeam } from "@/lib/demo";
import { demoMode } from "@/lib/env";
import { emailProvider } from "@/lib/email/provider";
import { NO_SENDING, readSending } from "@/lib/marketing/sending";
import { defaultMarketingSettings } from "@/lib/marketing/settings";
import { getMarketingSettings, settingsTenantOf } from "@/lib/marketing/store";
import { getPortalContext, scopeOf } from "@/lib/portal";

export const metadata: Metadata = { title: "Email sending" };

const NOTE = "Newsletters and series go out from your own domain. Set it up once; it takes about 15 minutes plus waiting for DNS.";

async function Body() {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.newsletters");
  if (blocked) return blocked;
  const demo = demoMode();
  const site = ctx.sites[0]?.domain ?? "yourcompany.com";
  const data = demo
    ? { state: NO_SENDING, fromName: defaultMarketingSettings(settingsTenantOf(ctx)).brand.fromName, team: demoTeam(ctx).map((m) => ({ email: m.email, name: m.name })), tested: false }
    : await withTenant(scopeOf(ctx), async (tx) => ({
        state: await readSending(tx),
        fromName: (await getMarketingSettings(tx, settingsTenantOf(ctx))).brand.fromName,
        team: await tx.selectFrom("members").select(["email", "name"]).where("status", "=", "active").orderBy("name").execute(),
        tested: Boolean(await tx.selectFrom("email_sends").select("id").where("kind", "=", "test").where("status", "=", "sent").limit(1).executeTakeFirst()),
      }));
  return (
    <>
      <PageHeader title="Email sending" note={NOTE} />
      <SendingSetup
        state={data.state}
        storage={demo ? "browser" : "server"}
        tenantId={ctx.tenant.id}
        providerReady={demo || Boolean(emailProvider())}
        canManage={may(ctx.member.role, "settings.manage")}
        suggested={`mail.${site}`}
        fromName={data.fromName}
        me={ctx.member.email}
        team={data.team}
        tested={data.tested}
      />
    </>
  );
}

export default function EmailSendingPage() {
  return (
    <>
      <Link href="/settings#integrations" className="link" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: "var(--bo-text-sm)" }}>
        <ArrowLeft aria-hidden="true" style={{ width: 15, height: 15 }} />
        Settings
      </Link>
      <Suspense fallback={<PageHeader title="Email sending" note={NOTE} />}>
        <Body />
      </Suspense>
    </>
  );
}
