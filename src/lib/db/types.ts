// Row types for Kysely. Keep in step with db/migrations.
import type { ColumnType, Generated, Insertable, Selectable, Updateable } from "kysely";

/** Timestamps read as Date and may be left out on insert (they have defaults). */
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type TimestampNullable = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
type Json<T = Record<string, unknown>> = ColumnType<T, T | string | undefined, T | string>;
/** tenant_id defaults to the transaction's tenant, so inserts may leave it out. */
type TenantId = ColumnType<string, string | undefined, never>;

export type Role = "owner" | "admin" | "sales" | "marketing" | "viewer";
export type MemberStatus = "active" | "invited" | "pending" | "removed";
export type ContactStatus = "new" | "contacted" | "qualified" | "won" | "lost" | "spam";
export type EntitlementSource = "subscription" | "trial" | "grant";
export type EntitlementStatus = "active" | "past_due" | "canceled" | "expired";
export type IntegrationStatus = "connected" | "needs_attention" | "not_set_up";
export type EventType = "pageview" | "leave" | "action" | "heartbeat";

export interface TenantsTable {
  id: ColumnType<string, string, never>;
  name: string;
  slug: string;
  industry: Generated<string>;
  clerk_org_id: string | null;
  stripe_customer_id: string | null;
  status: Generated<"active" | "suspended">;
  retention_days: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SitesTable {
  id: Generated<string>;
  tenant_id: TenantId;
  domain: string;
  site_key: Generated<string>;
  verified_at: TimestampNullable;
  excluded_ips: Generated<string>;
  first_event_at: TimestampNullable;
  created_at: Timestamp;
}

export interface MembersTable {
  id: Generated<string>;
  tenant_id: TenantId;
  user_id: string | null;
  email: string;
  name: Generated<string>;
  role: Role;
  status: Generated<MemberStatus>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface EntitlementsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  item_key: string;
  source: EntitlementSource;
  status: Generated<EntitlementStatus>;
  starts_at: Timestamp;
  ends_at: TimestampNullable;
  stripe_subscription_id: ColumnType<string | null, string | null | undefined, string | null>;
  stripe_subscription_item_id: string | null;
  note: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SubscriptionsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  stripe_subscription_id: string;
  status: string;
  current_period_end: TimestampNullable;
  cancel_at_period_end: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface IntegrationsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  provider: string;
  status: Generated<IntegrationStatus>;
  secret_ciphertext: string | null;
  public_config: Json;
  last_checked_at: TimestampNullable;
  last_error: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SettingsTable {
  tenant_id: TenantId;
  sample_data: Generated<boolean>;
  accent: Generated<string>;
  timezone: Generated<string>;
  privacy: Json;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AuditLogTable {
  id: Generated<string>;
  tenant_id: TenantId;
  actor_user_id: Generated<string | null>;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Json;
  created_at: Timestamp;
}

export interface ContactsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  email: string;
  name: Generated<string>;
  phone: Generated<string>;
  status: Generated<ContactStatus>;
  is_new: Generated<boolean>;
  first_seen_at: Timestamp;
  last_seen_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SubmissionsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  contact_id: string | null;
  site_id: string | null;
  form_key: string;
  form_type: Generated<string>;
  fields: Json<Record<string, string>>;
  status: Generated<"received" | "spam">;
  spam_reason: string | null;
  alert: Json;
  created_at: Timestamp;
}

export interface EventsTable {
  tenant_id: TenantId;
  id: Generated<string>;
  occurred_at: Timestamp;
  site_id: string;
  visit_id: string;
  browser_id: string | null;
  visitor_hash: string;
  type: EventType;
  path: Generated<string>;
  name: string | null;
  label: string | null;
  props: Json;
}

export interface WebhookEventsTable {
  provider: string;
  event_id: string;
  received_at: Timestamp;
}

export interface DB {
  tenants: TenantsTable;
  sites: SitesTable;
  members: MembersTable;
  entitlements: EntitlementsTable;
  subscriptions: SubscriptionsTable;
  integrations: IntegrationsTable;
  settings: SettingsTable;
  audit_log: AuditLogTable;
  contacts: ContactsTable;
  submissions: SubmissionsTable;
  events: EventsTable;
  webhook_events: WebhookEventsTable;
}

export type Tenant = Selectable<TenantsTable>;
export type Member = Selectable<MembersTable>;
export type Entitlement = Selectable<EntitlementsTable>;
export type Settings = Selectable<SettingsTable>;
export type Contact = Selectable<ContactsTable>;
export type Submission = Selectable<SubmissionsTable>;
export type NewContact = Insertable<ContactsTable>;
export type ContactUpdate = Updateable<ContactsTable>;
