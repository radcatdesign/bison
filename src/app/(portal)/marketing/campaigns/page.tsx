import { FileText, ImageIcon, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { folderStyle } from "@/components/campaigns/chip";
import s from "@/components/campaigns/campaigns.module.css";
import { marketingGate } from "@/components/marketing/gate";
import { Card, PageHeader, SampleBanner, Segmented } from "@/components/ui";
import { may } from "@/config/roles";
import { campaignsRepo } from "@/lib/campaigns/repo";
import { dateRange } from "@/lib/campaigns/dates";
import { sayOf } from "@/lib/edition";
import { getPortalContext } from "@/lib/portal";
import { newCampaign } from "./actions";

export const metadata: Metadata = { title: "Campaigns" };

const NOTE: [string, string] = [
  "Folders for everything that goes with one push, like a launch or a sale: its landing pages, emails and graphics, in one place.",
  "Folders for everything that goes with one push, like a challenge or a membership drive: its funnel pages, emails and graphics, in one place.",
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function Body({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const ctx = await getPortalContext();
  const blocked = marketingGate(ctx, "marketing.campaigns");
  if (blocked) return blocked;
  const say = sayOf(ctx);
  const archived = (await searchParams).show === "archived";
  const repo = campaignsRepo(ctx);
  const all = await repo.list();
  const shown = all.filter((c) => c.archived === archived);
  const archivedCount = all.filter((c) => c.archived).length;

  return (
    <>
      {repo.demo && <SampleBanner demo />}
      <PageHeader
        title="Campaigns"
        note={say(...NOTE)}
        actions={<Segmented label="Show" items={[{ href: "/marketing/campaigns", label: "Active", current: !archived }, { href: "/marketing/campaigns?show=archived", label: `Archived (${archivedCount})`, current: archived }]} />}
      />
      <div className={s.stack}>
        {!archived && (
          <details className="card" style={{ padding: 0 }} open={all.length === 0 || undefined} data-testid="campaign-new">
            <summary style={{ padding: "16px 20px", cursor: "pointer", fontWeight: 650 }}>New campaign</summary>
            <div style={{ padding: "0 20px 20px" }}>
              <CampaignForm action={newCampaign} submitLabel="Make the campaign" disabled={!may(ctx.member.role, "marketing.edit")} testId="campaign-new-form" />
              {repo.demo && <p className="muted">This is a demo, so new campaigns aren&apos;t saved.</p>}
            </div>
          </details>
        )}
        {shown.length === 0 ? (
          <Card>
            <div className={s.empty}>
              <p>{archived ? "No archived campaigns." : "No campaigns yet."}</p>
              {!archived && <p className="muted">{say("Make one above, then add pages, emails and graphics to it.", "Make one above, then add funnel pages, emails and graphics to it.")}</p>}
            </div>
          </Card>
        ) : (
          <div className={s.grid} data-testid="campaigns">
            {shown.map((c) => (
              <Link key={c.id} href={`/marketing/campaigns/${c.id}`} className={`${s.card} ${s.folder}`} style={folderStyle(c.color)} data-testid="campaign-card">
                <div className={s.cardHead}>
                  <h2 className={s.name}>{c.name}</h2>
                  {c.archived && <span className="pill">Archived</span>}
                </div>
                <span className={s.dates}>{dateRange(c.startsOn, c.endsOn)}</span>
                {c.notes && <p className={s.notes}>{c.notes}</p>}
                <span className={s.counts}>
                  <span>
                    <FileText aria-hidden="true" />
                    {plural(c.counts.pages, "page", "pages")}
                  </span>
                  <span>
                    <Mail aria-hidden="true" />
                    {plural(c.counts.emails, "email", "emails")}
                  </span>
                  <span>
                    <ImageIcon aria-hidden="true" />
                    {plural(c.counts.graphics, "graphic", "graphics")}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function CampaignsPage({ searchParams }: PageProps<"/marketing/campaigns">) {
  return (
    <Suspense fallback={<PageHeader title="Campaigns" />}>
      <Body searchParams={searchParams as Promise<{ show?: string }>} />
    </Suspense>
  );
}
