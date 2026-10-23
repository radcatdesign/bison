import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EstimateBuilder } from "@/components/sales/estimate-builder";
import { salesGate } from "@/components/sales/gate";
import { PageHeader, SampleBanner } from "@/components/ui";
import { may } from "@/config/roles";
import { DEMO_MESSAGE } from "@/lib/demo";
import { demoMode } from "@/lib/env";
import { getPortalContext } from "@/lib/portal";
import { SampleModeError } from "@/lib/repo/types";
import { builderExtras } from "@/lib/sales/estimate-page";
import { salesRepo } from "@/lib/sales/repo";

export const metadata: Metadata = { title: "Estimate" };

type Params = Promise<{ id: string }>;

async function Body({ params }: { params: Params }) {
  const ctx = await getPortalContext();
  const blocked = salesGate(ctx, "sales.estimates");
  if (blocked) return blocked;
  const { id } = await params;
  const repo = salesRepo(ctx);
  const isNew = id === "new";
  const [estimate, trade] = await Promise.all([isNew ? null : repo.estimate(id), repo.trade()]);
  if (!isNew && !estimate) notFound();
  const extras = await builderExtras(ctx, { estimateId: estimate?.id ?? null, sample: repo.sample, trade });
  const demo = demoMode();
  const locked = demo ? DEMO_MESSAGE : repo.sample ? new SampleModeError().message : null;
  const title = estimate ? `Estimate #${estimate.number}` : "New estimate";
  return (
    <>
      <PageHeader
        title={title}
        note={estimate ? estimate.client.company || estimate.client.name || "No client yet" : "Add who it's for and what's in it. It saves as a draft until you send it."}
        actions={
          <Link href="/sales/estimates" className="btn">
            All estimates
          </Link>
        }
      />
      {repo.sample && <SampleBanner demo={demo} />}
      <EstimateBuilder key={estimate?.id ?? "new"} estimate={estimate} extras={extras} canEdit={may(ctx.member.role, "sales.edit")} canSend={may(ctx.member.role, "email.send")} locked={locked} timeZone={ctx.settings.timezone} />
    </>
  );
}

export default function EstimatePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageHeader title="Estimate" />}>
      <Body params={params} />
    </Suspense>
  );
}
