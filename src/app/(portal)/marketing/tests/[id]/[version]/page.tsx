import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { marketingGate } from "@/components/marketing/gate";
import { Editor } from "@/components/page-builder/editor";
import { RoleBlocked } from "@/components/ui";
import { may } from "@/config/roles";
import { withTenant } from "@/lib/db";
import { demoMode, pageAgentName } from "@/lib/env";
import { getMarketingSettings, settingsTenantOf } from "@/lib/marketing/store";
import { versionForEditing } from "@/lib/pages/tests";
import { publicPageUrl } from "@/lib/pages/urls";
import { getPortalContext, scopeOf } from "@/lib/portal";

export const metadata: Metadata = { title: "Edit version" };

// Version B or C of a test, open in the page editor. It saves to the test, and
// goes live only when the test ends keeping it.
async function Body({ params }: { params: Promise<{ id: string; version: string }> }) {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.tests");
  if (blocked) return blocked;
  if (!may(ctx.member.role, "pages.edit")) return <RoleBlocked mode="Pages" />;
  const { id, version } = await params;
  // The demo's tests are examples that have already started, so there's nothing to edit.
  if (demoMode()) redirect(`/marketing/tests/${id}`);
  const scope = scopeOf(ctx);
  const v = await versionForEditing(scope, version);
  if (!v || v.testId !== id) notFound();
  // Running and ended tests are locked; their versions show on the test's page.
  if (v.status !== "draft") redirect(`/marketing/tests/${id}`);
  const signup = (await withTenant(scope, (tx) => getMarketingSettings(tx, settingsTenantOf(ctx)))).signup;
  return (
    <Editor
      pageId={v.pageId}
      storage="server"
      tenant={{ id: ctx.tenant.id, name: ctx.tenant.name }}
      publicBase={publicPageUrl(ctx.tenant.slug, "")}
      canPublish={false}
      agentName={pageAgentName()}
      autoBuild={null}
      signup={signup}
      version={{ id: v.id, key: v.key === "c" ? "c" : "b", testId: v.testId, testName: v.testName }}
      initial={{ title: v.pageTitle, slug: v.pageSlug, doc: v.doc, status: "published", publicUrl: null, thread: [] }}
    />
  );
}

export default function EditVersionPage({ params }: PageProps<"/marketing/tests/[id]/[version]">) {
  return (
    <Suspense fallback={null}>
      <Body params={params} />
    </Suspense>
  );
}
