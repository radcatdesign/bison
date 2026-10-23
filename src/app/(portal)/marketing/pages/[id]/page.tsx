import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Editor } from "@/components/page-builder/editor";
import { Locked, RoleBlocked } from "@/components/ui";
import { may } from "@/config/roles";
import { demoMode, pageAgentName } from "@/lib/env";
import { gateMode } from "@/lib/gate";
import { agentTurns, getPage } from "@/lib/pages/repo";
import { publicPageUrl } from "@/lib/pages/urls";
import { getPortalContext, scopeOf } from "@/lib/portal";

export const metadata: Metadata = { title: "Edit page" };

type Params = Promise<{ id: string }>;
type Search = Promise<{ build?: string }>;

async function EditorBody({ params, searchParams }: { params: Params; searchParams: Search }) {
  const ctx = await getPortalContext();
  const gate = gateMode(ctx, "marketing");
  if (gate.kind === "role") return <RoleBlocked mode={gate.label} />;
  if (gate.kind === "locked") return <Locked item={gate.item} canBuy={gate.canBuy} trialUsed={gate.trialUsed} />;
  if (!may(ctx.member.role, "pages.edit")) return <RoleBlocked mode="Pages" />;

  const { id } = await params;
  const { build } = await searchParams;
  const autoBuild = typeof build === "string" && build.trim() ? build.trim().slice(0, 2000) : null;
  const shared = {
    pageId: id,
    tenant: { id: ctx.tenant.id, name: ctx.tenant.name },
    publicBase: publicPageUrl(ctx.tenant.slug, ""),
    canPublish: may(ctx.member.role, "pages.publish"),
    agentName: pageAgentName(),
    autoBuild,
  };

  if (demoMode()) return <Editor {...shared} initial={null} storage="browser" />;

  const scope = scopeOf(ctx);
  const page = await getPage(scope, id);
  if (!page) notFound();
  const turns = await agentTurns(scope, id);
  const thread = turns.flatMap((t, i) => [
    { id: `u${i}`, role: "user" as const, text: t.instruction },
    { id: `a${i}`, role: "agent" as const, text: t.reply, state: "done" as const },
  ]);

  return (
    <Editor
      {...shared}
      storage="server"
      initial={{ title: page.title, slug: page.slug, doc: page.doc, status: page.status, publicUrl: page.status === "draft" ? null : publicPageUrl(ctx.tenant.slug, page.slug), thread }}
    />
  );
}

export default function EditPagePage({ params, searchParams }: PageProps<"/marketing/pages/[id]">) {
  return (
    <Suspense fallback={null}>
      <EditorBody params={params as Params} searchParams={searchParams as Search} />
    </Suspense>
  );
}
