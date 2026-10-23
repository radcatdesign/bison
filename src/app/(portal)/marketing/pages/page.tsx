import type { Metadata } from "next";
import { Suspense } from "react";
import { PagesHome } from "@/components/page-builder/pages-home";
import { Locked, PageHeader, RoleBlocked } from "@/components/ui";
import { may } from "@/config/roles";
import { demoMode } from "@/lib/env";
import { gateMode } from "@/lib/gate";
import { listPages } from "@/lib/pages/repo";
import { listTests } from "@/lib/pages/tests";
import { seedPageFor } from "@/lib/pages/seeds";
import { getPortalContext, scopeOf } from "@/lib/portal";

export const metadata: Metadata = { title: "Pages" };

const NOTE = "Landing pages you build by describing them. Forms on every page send to Contacts.";

async function PagesBody({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await getPortalContext();
  const gate = gateMode(ctx, "marketing");
  if (gate.kind === "role") return <RoleBlocked mode={gate.label} />;
  if (gate.kind === "locked") return <Locked item={gate.item} canBuy={gate.canBuy} trialUsed={gate.trialUsed} />;

  const { error } = await searchParams;
  const demo = demoMode();
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: ctx.settings.timezone });
  const tests = demo ? [] : await listTests(scopeOf(ctx));
  const testOf = (pageId: string) => tests.find((t) => t.pageId === pageId && t.status === "running") ?? null;
  const pages = demo
    ? []
    : (await listPages(scopeOf(ctx))).map((p) => ({ id: p.id, title: p.title, slug: p.slug, status: p.status, edited: `Edited ${fmt.format(p.updatedAt)}`, doc: p.doc, testId: testOf(p.id)?.id ?? null }));
  const seed = demo ? seedPageFor(ctx.tenant.industry) : null;

  return (
    <>
      <PageHeader title="Pages" note={NOTE} />
      <PagesHome
        storage={demo ? "browser" : "server"}
        pages={pages}
        tenant={{ id: ctx.tenant.id, name: ctx.tenant.name, accent: ctx.settings.accent }}
        seed={seed && { title: seed.title, slug: seed.slug, doc: seed.doc }}
        canEdit={may(ctx.member.role, "pages.edit")}
        error={typeof error === "string" ? error.slice(0, 200) : null}
      />
    </>
  );
}

export default function PagesPage({ searchParams }: PageProps<"/marketing/pages">) {
  return (
    <Suspense fallback={<PageHeader title="Pages" note={NOTE} />}>
      <PagesBody searchParams={searchParams as Promise<{ error?: string }>} />
    </Suspense>
  );
}
