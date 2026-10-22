// The made-up companies and people used by the dev sign-in, the seed and the tests.
// Two companies on purpose: every isolation test signs in as one and looks for the other.
import type { Role } from "@/lib/db/types";

export type DevTenant = {
  id: string;
  name: string;
  domain: string;
  industry: string;
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
    sampleData: true,
  },
  ridgeline: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Ridgeline Roasters",
    domain: "ridgelineroasters.com",
    industry: "coffee",
    sampleData: false,
  },
} satisfies Record<string, DevTenant>;

export const DEV_PEOPLE: DevPerson[] = [
  { userId: "dev_ada", tenantId: DEV_TENANTS.brightwater.id, name: "Ada Lopez", email: "ada@brightwaterpools.com", role: "owner" },
  { userId: "dev_ben", tenantId: DEV_TENANTS.brightwater.id, name: "Ben Cho", email: "ben@brightwaterpools.com", role: "sales" },
  { userId: "dev_cora", tenantId: DEV_TENANTS.ridgeline.id, name: "Cora Hale", email: "cora@ridgelineroasters.com", role: "owner" },
  { userId: "dev_dana", tenantId: DEV_TENANTS.ridgeline.id, name: "Dana Ruiz", email: "dana@ridgelineroasters.com", role: "viewer" },
];

export function devTenantName(tenantId: string): string {
  return Object.values(DEV_TENANTS).find((t) => t.id === tenantId)?.name ?? "Unknown company";
}
