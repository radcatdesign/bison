import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { marketingGate } from "@/components/marketing/gate";
import { TestScreen } from "@/components/page-tests/test-screen";
import { PageHeader, SampleBanner } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { defaultMarketingSettings } from "@/lib/marketing/settings";
import { getMarketingSettings, settingsTenantOf } from "@/lib/marketing/store";
import { testsRepo } from "@/lib/pages/test-repo";
import { statusLabel, testView } from "@/lib/pages/test-view";
import { publicPageUrl } from "@/lib/pages/urls";
import { getPortalContext, scopeOf } from "@/lib/portal";

export const metadata: Metadata = { title: "A/B test" };

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.tests");
  if (blocked) return blocked;
  const { id } = await params;
  const repo = testsRepo(ctx);
  const found = await repo.get(id);
  if (!found) notFound();
  const { test, days } = found;
  const view = testView(test, days, { timeZone: ctx.settings.timezone });
  const signup = repo.demo ? defaultMarketingSettings(settingsTenantOf(ctx)).signup : (await withTenant(scopeOf(ctx), (tx) => getMarketingSettings(tx, settingsTenantOf(ctx)))).signup;
  return (
    <>
      <PageHeader title={test.name} />
      {repo.demo && <SampleBanner demo />}
      <TestScreen
        view={{ ...view, statusLabel: statusLabel(test) }}
        brand={ctx.tenant.name}
        publicUrl={repo.demo ? null : publicPageUrl(ctx.tenant.slug, test.pageSlug)}
        canEdit={may(ctx.member.role, "pages.edit")}
        canPublish={may(ctx.member.role, "pages.publish")}
        demo={repo.demo}
        sample={repo.sample}
        signup={signup}
      />
    </>
  );
}

export default function TestPage({ params }: PageProps<"/marketing/tests/[id]">) {
  return (
    <Suspense fallback={<PageHeader title="A/B test" />}>
      <Body params={params} />
    </Suspense>
  );
}
