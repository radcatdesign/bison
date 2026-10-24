import type { Metadata } from "next";
import { Suspense } from "react";
import { marketingGate } from "@/components/marketing/gate";
import { SetupFor } from "@/components/marketing/setup-for";
import { TestsHeader, TestsHome } from "@/components/page-tests/tests-home";
import { SampleBanner } from "@/components/ui";
import { may } from "@/config/roles";
import { listPages } from "@/lib/pages/repo";
import { seedPageFor } from "@/lib/pages/seeds";
import { testsRepo } from "@/lib/pages/test-repo";
import { testCard } from "@/lib/pages/test-view";
import { getPortalContext, scopeOf } from "@/lib/portal";

export const metadata: Metadata = { title: "A/B tests" };

async function Body() {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.tests");
  if (blocked) return blocked;
  const repo = testsRepo(ctx);
  const rows = await repo.list();
  const open = new Set(rows.filter((r) => r.status !== "ended").map((r) => r.pageId));
  // The demo has one live example page; real accounts list their published pages.
  const live = repo.demo ? [{ id: "example", title: seedPageFor(ctx.tenant.industry).title, slug: seedPageFor(ctx.tenant.industry).slug }] : (await listPages(scopeOf(ctx))).filter((p) => p.status !== "draft").map((p) => ({ id: p.id, title: p.title, slug: p.slug }));
  return (
    <>
      <TestsHeader />
      <SetupFor ctx={ctx} tool="tests" />
      {repo.demo && <SampleBanner demo />}
      <TestsHome
        sampleResults={repo.sample && !repo.demo && rows.some((r) => r.status !== "draft")}
        tests={rows.map((r) => testCard(r, r.days))}
        pages={repo.demo ? live : live.filter((p) => !open.has(p.id))}
        hasLivePage={live.length > 0}
        canEdit={may(ctx.member.role, "pages.edit")}
      />
    </>
  );
}

export default function TestsPage() {
  return (
    <Suspense fallback={<TestsHeader />}>
      <Body />
    </Suspense>
  );
}
