import "server-only";
// What the Campaigns screens read: the company's own campaigns, or made-up
// ones in the public demo, where there's no database. Campaigns are content,
// so sample data doesn't change them.
import { withTenant } from "@/lib/db";
import { demoMode } from "@/lib/env";
import { type PortalContext, scopeOf } from "@/lib/portal";
import { sampleCampaigns } from "@/lib/sample/campaigns";
import { type CampaignDetail, type CampaignSummary, type FilingChoices, filingChoices, getCampaign, listCampaigns } from "./store";

export type CampaignsRepo = {
  demo: boolean;
  list(): Promise<CampaignSummary[]>;
  get(id: string): Promise<CampaignDetail | null>;
  choices(): Promise<FilingChoices>;
};

export function campaignsRepo(ctx: PortalContext): CampaignsRepo {
  if (demoMode()) {
    const all = () => sampleCampaigns(ctx.tenant);
    return { demo: true, list: async () => all(), get: async (id) => all().find((c) => c.id === id) ?? null, choices: async () => ({ pages: [], newsletters: [], series: [] }) };
  }
  const scope = scopeOf(ctx);
  return {
    demo: false,
    list: () => withTenant(scope, (tx) => listCampaigns(tx)),
    get: (id) => withTenant(scope, (tx) => getCampaign(tx, id)),
    choices: () => withTenant(scope, (tx) => filingChoices(tx)),
  };
}
