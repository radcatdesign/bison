import Link from "next/link";
import type { CSSProperties } from "react";
import type { CampaignColor } from "@/lib/db/types";
import s from "./campaigns.module.css";

export const folderStyle = (color: CampaignColor) => ({ "--folder": `var(--bo-folder-${color})` }) as CSSProperties;

/** The campaign something is filed in, linking to it. */
export function CampaignChip({ campaign, link = true }: { campaign: { id: string; name: string; color: CampaignColor }; link?: boolean }) {
  const inner = (
    <>
      <span className={s.dot} aria-hidden="true" />
      {campaign.name}
    </>
  );
  return link ? (
    <Link href={`/marketing/campaigns/${campaign.id}`} className={s.chip} style={folderStyle(campaign.color)} title={`In ${campaign.name}`} data-testid="campaign-chip">
      {inner}
    </Link>
  ) : (
    <span className={s.chip} style={folderStyle(campaign.color)} data-testid="campaign-chip">
      {inner}
    </span>
  );
}
