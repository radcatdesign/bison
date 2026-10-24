import type { Metadata } from "next";
import { Suspense } from "react";
import { EditionPageHeader } from "@/components/marketing/edition-header";
import { marketingGate } from "@/components/marketing/gate";
import { type NewsletterCard, NewslettersHome } from "@/components/marketing/newsletters-home";
import { SetupFor } from "@/components/marketing/setup-for";
import { PageHeader } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { campaignNames } from "@/lib/campaigns/store";
import { appUrl, demoMode } from "@/lib/env";
import { listNewsletters, listTemplates } from "@/lib/marketing/newsletters";
import { subscriberCount } from "@/lib/marketing/people";
import { defaultMarketingSettings } from "@/lib/marketing/settings";
import { getMarketingSettings, settingsTenantOf } from "@/lib/marketing/store";
import { sayOf } from "@/lib/edition";
import { getPortalContext, scopeOf } from "@/lib/portal";
import { sampleSubscribers } from "@/lib/sample/marketing";

export const metadata: Metadata = { title: "Newsletters" };

const NOTE = "Build an email on the email itself, send yourself a test, then send it now or schedule it up to 30 days out.";
const CLUB_NOTE = "Member updates, class schedules and challenges. Build the email on the email itself, send yourself a test, then send it now or schedule it up to 30 days out.";

async function Body({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.newsletters");
  if (blocked) return blocked;
  const { error } = await searchParams;
  const demo = demoMode();
  const tz = ctx.settings.timezone;
  const site = ctx.sites[0]?.domain ? `https://${ctx.sites[0].domain}` : "https://example.com";
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });

  let cards: NewsletterCard[] = [];
  let saved: { id: string; name: string; subject: string; doc: import("@/lib/email/schema").EmailDoc }[] = [];
  let brand = defaultMarketingSettings(settingsTenantOf(ctx)).brand;
  let subscribed = sampleSubscribers(ctx.tenant).filter((x) => x.status === "subscribed").length;
  if (!demo) {
    const filed = await withTenant(scopeOf(ctx), (tx) => campaignNames(tx, "newsletter"));
    const [list, templates, loaded] = await Promise.all([
      listNewsletters(scopeOf(ctx)),
      listTemplates(scopeOf(ctx)),
      withTenant(scopeOf(ctx), async (tx) => ({ settings: await getMarketingSettings(tx, settingsTenantOf(ctx)), count: await subscriberCount(tx) })),
    ]);
    brand = loaded.settings.brand;
    if (!ctx.settings.sampleData) subscribed = loaded.count;
    saved = templates;
    cards = list.map((n) => ({
      id: n.id,
      subject: n.subject || "(no subject yet)",
      status: n.status,
      when:
        n.status === "sent" && n.sentAt
          ? `Sent ${fmt.format(n.sentAt)}`
          : n.status === "sending"
            ? "Going out now"
            : n.status === "scheduled" && n.scheduledFor
              ? `Goes out ${fmt.format(n.scheduledFor)}`
              : `Edited ${fmt.format(n.updatedAt)}`,
      audience: n.audienceName || (n.audience === "all" ? "Everyone subscribed" : "A list"),
      stats: n.status === "sent" || n.status === "sending" ? n.stats : null,
      error: n.status === "failed" ? n.error : null,
      campaign: filed.get(n.id) ?? null,
    }));
  }

  return (
    <>
      <PageHeader title="Newsletters" note={sayOf(ctx)(NOTE, CLUB_NOTE)} />
      <SetupFor ctx={ctx} tool="newsletters" />
      {error && (
        <p className="notice notice-error" role="alert" style={{ marginBottom: 18 }}>
          {error.slice(0, 200)}
        </p>
      )}
      <NewslettersHome
        storage={demo ? "browser" : "server"}
        tenantId={ctx.tenant.id}
        brand={brand}
        baseUrl={appUrl()}
        site={site}
        newsletters={cards}
        saved={saved}
        canEdit={may(ctx.member.role, "marketing.edit")}
        subscribed={subscribed}
        timeZone={tz}
        industry={ctx.tenant.industry}
      />
    </>
  );
}

export default function NewslettersPage({ searchParams }: PageProps<"/marketing/newsletters">) {
  return (
    <Suspense fallback={<EditionPageHeader title={["Newsletters", "Newsletters"]} note={[NOTE, CLUB_NOTE]} />}>
      <Body searchParams={searchParams as Promise<{ error?: string }>} />
    </Suspense>
  );
}
