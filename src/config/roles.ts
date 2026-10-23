// What each team role sees and may do. Entitlements decide what the company
// has; roles decide what this person can do with it.
import type { Role } from "@/lib/db/types";
import type { ModeKey } from "./modes";

export type Action =
  | "billing.manage"
  | "members.manage"
  | "settings.manage"
  | "contacts.edit"
  | "email.send"
  | "refunds.issue"
  | "data.export"
  | "data.delete"
  | "pages.edit"
  | "pages.publish";

type RoleSpec = { label: string; description: string; modes: readonly ModeKey[]; actions: readonly Action[] };

export const ROLES: Record<Role, RoleSpec> = {
  owner: {
    label: "Owner",
    description: "Everything, including billing and deleting the account.",
    modes: ["analyze", "marketing", "sales"],
    actions: ["billing.manage", "members.manage", "settings.manage", "contacts.edit", "email.send", "refunds.issue", "data.export", "data.delete", "pages.edit", "pages.publish"],
  },
  admin: {
    label: "Admin",
    description: "Everything except billing.",
    modes: ["analyze", "marketing", "sales"],
    actions: ["members.manage", "settings.manage", "contacts.edit", "email.send", "refunds.issue", "data.export", "data.delete", "pages.edit", "pages.publish"],
  },
  sales: {
    label: "Sales",
    description: "Analyze and Sales. Can work contacts, send email and issue refunds.",
    modes: ["analyze", "sales"],
    actions: ["contacts.edit", "email.send", "refunds.issue"],
  },
  marketing: {
    label: "Marketing",
    description: "Analyze and Marketing. Can work contacts, send email, and build and publish landing pages.",
    modes: ["analyze", "marketing"],
    actions: ["contacts.edit", "email.send", "pages.edit", "pages.publish"],
  },
  viewer: {
    label: "Viewer",
    description: "Analyze only. Read only.",
    modes: ["analyze"],
    actions: [],
  },
};

export function may(role: Role, action: Action): boolean {
  return ROLES[role].actions.includes(action);
}

export function seesMode(role: Role, mode: ModeKey): boolean {
  return ROLES[role].modes.includes(mode);
}
