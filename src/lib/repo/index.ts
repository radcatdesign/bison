// Picks the database or sample repositories for a tenant. Screens never know which.
import { sampleAnalytics, sampleContacts, type SampleTenant } from "@/lib/sample/generate";
import type { TenantScope } from "@/lib/db";
import { liveAnalytics, liveContacts } from "./live";
import { type AnalyticsRepo, type ContactsRepo, type DataMode, SampleModeError } from "./types";

export type RepoContext = {
  scope: TenantScope;
  tenant: SampleTenant;
  sampleData: boolean;
  timezone: string;
};

export type Repos = { mode: DataMode; contacts: ContactsRepo; analytics: AnalyticsRepo };

function sampleRepos(tenant: SampleTenant): Repos {
  return {
    mode: "sample",
    contacts: {
      async list({ limit = 100 } = {}) {
        return sampleContacts(tenant)
          .slice(0, limit)
          .map((c) => ({ id: c.id, name: c.name, email: c.email, displayName: c.displayName, status: c.status, isNew: c.isNew, formType: c.formType, message: c.message, lastSeenAt: c.lastSeenAt }));
      },
      async get(id) {
        return sampleContacts(tenant).find((c) => c.id === id) ?? null;
      },
      async setStatus() {
        throw new SampleModeError();
      },
    },
    analytics: {
      async summary(rangeDays) {
        return sampleAnalytics(tenant, rangeDays);
      },
    },
  };
}

export function getRepos(ctx: RepoContext): Repos {
  if (ctx.sampleData) return sampleRepos(ctx.tenant);
  return { mode: "live", contacts: liveContacts(ctx.scope), analytics: liveAnalytics(ctx.scope, ctx.timezone) };
}
