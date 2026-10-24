// The made-up companies and people used by the dev sign-in, the seed and the tests.
// Two companies per edition on purpose: every isolation test signs in as one and
// looks for the other. Bison Ops has a pool supplier and a roaster; Fit Funnels
// has a full gym and a cycling studio.
import type { EditionKey } from "@/config/editions";
import type { Role } from "@/lib/db/types";

export type DevTenant = {
  id: string;
  name: string;
  domain: string;
  industry: string;
  edition: EditionKey;
  sampleData: boolean;
};

export type DevPerson = {
  userId: string;
  tenantId: string;
  name: string;
  email: string;
  role: Role;
};

export const DEV_TENANTS = {
  brightwater: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Brightwater Pools",
    domain: "brightwaterpools.com",
    industry: "pools",
    edition: "bison",
    sampleData: true,
  },
  ridgeline: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Ridgeline Roasters",
    domain: "ridgelineroasters.com",
    industry: "coffee",
    edition: "bison",
    sampleData: false,
  },
  summit: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Summit Strength Club",
    domain: "summitstrengthclub.com",
    industry: "gym",
    edition: "fit",
    sampleData: true,
  },
  pulse: {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Pulse Cycle Studio",
    domain: "pulsecyclestudio.com",
    industry: "studio",
    edition: "fit",
    sampleData: false,
  },
} satisfies Record<string, DevTenant>;

export const DEV_PEOPLE: DevPerson[] = [
  { userId: "dev_ada", tenantId: DEV_TENANTS.brightwater.id, name: "Ada Lopez", email: "ada@brightwaterpools.com", role: "owner" },
  { userId: "dev_ben", tenantId: DEV_TENANTS.brightwater.id, name: "Ben Cho", email: "ben@brightwaterpools.com", role: "sales" },
  { userId: "dev_cora", tenantId: DEV_TENANTS.ridgeline.id, name: "Cora Hale", email: "cora@ridgelineroasters.com", role: "owner" },
  { userId: "dev_dana", tenantId: DEV_TENANTS.ridgeline.id, name: "Dana Ruiz", email: "dana@ridgelineroasters.com", role: "viewer" },
  { userId: "dev_maya", tenantId: DEV_TENANTS.summit.id, name: "Maya Reyes", email: "maya@summitstrengthclub.com", role: "owner" },
  { userId: "dev_theo", tenantId: DEV_TENANTS.summit.id, name: "Theo Banks", email: "theo@summitstrengthclub.com", role: "sales" },
  { userId: "dev_jo", tenantId: DEV_TENANTS.pulse.id, name: "Jo Whitaker", email: "jo@pulsecyclestudio.com", role: "owner" },
  { userId: "dev_sam", tenantId: DEV_TENANTS.pulse.id, name: "Sam Okoro", email: "sam@pulsecyclestudio.com", role: "marketing" },
];

/** The made-up companies in one edition. */
export const devTenantsIn = (edition: EditionKey): DevTenant[] => Object.values(DEV_TENANTS).filter((t) => t.edition === edition);

/** The made-up people at companies in one edition. */
export const devPeopleIn = (edition: EditionKey): DevPerson[] => {
  const ids = new Set(devTenantsIn(edition).map((t) => t.id));
  return DEV_PEOPLE.filter((p) => ids.has(p.tenantId));
};

export function devTenantName(tenantId: string): string {
  return Object.values(DEV_TENANTS).find((t) => t.id === tenantId)?.name ?? "Unknown company";
}
