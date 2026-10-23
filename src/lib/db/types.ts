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

export interface PagesTable {
  id: Generated<string>;
  tenant_id: TenantId;
  slug: string;
  title: string;
  doc: Json<unknown>;
  published_doc: ColumnType<unknown | null, unknown | string | null | undefined, unknown | string | null>;
  published_at: TimestampNullable;
  created_by: Generated<string>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PageRevisionsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  page_id: string;
  source: "agent" | "publish";
  doc: Json<unknown>;
  instruction: Generated<string>;
  reply: Generated<string>;
  actor: Generated<string>;
  created_at: Timestamp;
}

export interface PageAgentRunsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  page_id: string | null;
  actor: Generated<string>;
  created_at: Timestamp;
}

export interface WebhookEventsTable {
  provider: string;
  event_id: string;
  received_at: Timestamp;
}

// ---- Marketing (0005) ----------------------------------------------------------

export type SubscriberStatus = "subscribed" | "unsubscribed" | "bounced" | "complained";
export type SubscriberSource = "manual" | "import" | "page" | "form";
export type UnsubscribeReason = "link" | "one-click" | "team" | "complaint" | "bounce" | "suppressed";
export type NewsletterStatus = "draft" | "scheduled" | "sending" | "sent" | "failed" | "canceled";
export type SequenceTrigger = "joined" | "form" | "estimate" | "cart" | "manual";
export type EmailSendKind = "newsletter" | "series" | "test";
export type EmailSendStatus = "queued" | "sending" | "sent" | "delivered" | "bounced" | "complained" | "failed" | "canceled";

export interface MarketingSettingsTable {
  tenant_id: TenantId;
  brand: Json<unknown>;
  signup: Json<unknown>;
  offer: Json<unknown>;
  search: Json<unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface FilesTable {
  id: Generated<string>;
  tenant_id: TenantId;
  kind: "logo" | "email-image" | "product-image";
  content_type: "image/png" | "image/jpeg" | "image/gif";
  bytes: Buffer;
  width: number;
  height: number;
  name: Generated<string>;
  created_by: Generated<string>;
  created_at: Timestamp;
}

export interface SubscribersTable {
  id: Generated<string>;
  tenant_id: TenantId;
  email: string;
  name: Generated<string>;
  kind: Generated<string>;
  status: Generated<SubscriberStatus>;
  source: Generated<SubscriberSource>;
  source_detail: Generated<string>;
  subscribed_at: Timestamp;
  unsubscribed_at: TimestampNullable;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ListsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  name: string;
  created_at: Timestamp;
}

export interface ListItemsTable {
  tenant_id: TenantId;
  list_id: string;
  subscriber_id: string;
  added_at: Timestamp;
}

export interface UnsubscribesTable {
  id: Generated<string>;
  tenant_id: TenantId;
  email: string;
  reason: UnsubscribeReason;
  detail: Generated<string>;
  created_at: Timestamp;
}

export interface NewslettersTable {
  id: Generated<string>;
  tenant_id: TenantId;
  subject: Generated<string>;
  preheader: Generated<string>;
  doc: Json<unknown>;
  status: Generated<NewsletterStatus>;
  audience: Generated<"all" | "list">;
  list_id: string | null;
  audience_name: Generated<string>;
  scheduled_for: TimestampNullable;
  started_at: TimestampNullable;
  sent_at: TimestampNullable;
  recipients: Generated<number>;
  error: string | null;
  created_by: Generated<string>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface NewsletterTemplatesTable {
  id: Generated<string>;
  tenant_id: TenantId;
  name: string;
  subject: Generated<string>;
  preheader: Generated<string>;
  doc: Json<unknown>;
  created_by: Generated<string>;
  created_at: Timestamp;
}

export interface SequencesTable {
  id: Generated<string>;
  tenant_id: TenantId;
  name: string;
  trigger: SequenceTrigger;
  trigger_detail: Generated<string>;
  status: Generated<"on" | "off">;
  paused_at: TimestampNullable;
  starter: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SequenceStepsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  sequence_id: string;
  delay_days: number;
  subject: Generated<string>;
  preheader: Generated<string>;
  doc: Json<unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SequenceRunsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  sequence_id: string;
  subscriber_id: string | null;
  email: string;
  name: Generated<string>;
  status: Generated<"active" | "done" | "stopped">;
  started_at: Timestamp;
  last_day: Generated<number>;
  next_at: TimestampNullable;
  locked_until: TimestampNullable;
  stopped_reason: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface OfferCodesTable {
  id: Generated<string>;
  tenant_id: TenantId;
  code: string;
  subscriber_id: string | null;
  email: string;
  discount_kind: "percent" | "amount";
  discount: ColumnType<string, string | number, string | number>;
  expires_at: TimestampNullable;
  issued_at: Timestamp;
  redeemed_at: TimestampNullable;
  redeemed_note: Generated<string>;
}

export interface EmailSendsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  kind: EmailSendKind;
  newsletter_id: string | null;
  sequence_id: string | null;
  step_id: string | null;
  run_id: string | null;
  subscriber_id: string | null;
  email: string;
  name: Generated<string>;
  subject: Generated<string>;
  status: Generated<EmailSendStatus>;
  attempts: Generated<number>;
  next_attempt_at: Timestamp;
  locked_until: TimestampNullable;
  provider_id: string | null;
  error: string | null;
  sent_at: TimestampNullable;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface WorkerRunsTable {
  name: string;
  last_run_at: Timestamp;
  last_result: Json;
}

// ---- Sales ----------------------------------------------------------------------------

type Numeric = ColumnType<string, string | number, string | number>;
type NumericNullable = ColumnType<string | null, string | number | null | undefined, string | number | null>;

export type ProductStatus = "active" | "draft" | "archived";
export type ProductSource = "manual" | "csv" | "shopify" | "feed";
export type CartStatus = "open" | "checkout" | "ordered" | "abandoned" | "inquiry";
export type EstimateStatus = "draft" | "sent" | "viewed" | "changes_requested" | "approved" | "declined" | "invoiced" | "paid" | "void";
export type EstimateEventKind = "created" | "edited" | "sent" | "email_failed" | "viewed" | "changes_requested" | "approved" | "declined" | "invoiced" | "invoice_failed" | "paid" | "void" | "reopened";
export type OrderSource = "checkout" | "estimate" | "free";
export type OrderStatus = "paid" | "partially_refunded" | "refunded" | "canceled";
export type FulfillmentStatus = "none" | "pending" | "sent" | "failed" | "shipped";
export type DiscountUsage = "unlimited" | "single_use" | "per_account";
export type RedemptionStatus = "reserved" | "used" | "released";
export type TradeStatus = "applied" | "approved" | "declined" | "paused";

export interface SalesSettingsTable {
  tenant_id: TenantId;
  store: Json<unknown>;
  shipping: Json<unknown>;
  trade: Json<unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ProductsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  slug: string;
  name: string;
  description: Generated<string>;
  status: Generated<ProductStatus>;
  options: Json<unknown>;
  photos: Json<unknown>;
  category: Generated<string>;
  tax_code: Generated<string>;
  seo: Json<unknown>;
  source: Generated<ProductSource>;
  source_id: Generated<string>;
  position: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ProductVariantsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  product_id: string;
  options: Json<unknown>;
  sku: Generated<string>;
  price_cents: number;
  compare_at_cents: number | null;
  weight_oz: Numeric;
  box: Generated<string>;
  units_per_box: Generated<number>;
  ships_alone: Generated<boolean>;
  flat_ship_cents: number | null;
  active: Generated<boolean>;
  position: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TradeAccountsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  company: string;
  contact_name: Generated<string>;
  email: string;
  phone: Generated<string>;
  website: Generated<string>;
  details: Json<unknown>;
  status: Generated<TradeStatus>;
  tier_override: Generated<string>;
  note: Generated<string>;
  contact_id: string | null;
  decided_at: TimestampNullable;
  decided_by: Generated<string>;
  session_version: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface DiscountsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  code: string;
  percent_off: NumericNullable;
  amount_off_cents: number | null;
  usage: Generated<DiscountUsage>;
  trade_account_id: string | null;
  max_uses: number | null;
  min_order_cents: number | null;
  starts_at: TimestampNullable;
  expires_at: TimestampNullable;
  note: Generated<string>;
  active: Generated<boolean>;
  created_by: Generated<string>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CartsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  status: Generated<CartStatus>;
  items: Json<unknown>;
  email: string | null;
  name: Generated<string>;
  contact_id: string | null;
  trade_account_id: string | null;
  discount_code: Generated<string>;
  priced: Json<unknown>;
  checkout_session_id: string | null;
  last_active_at: Timestamp;
  abandoned_at: TimestampNullable;
  order_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface EstimatesTable {
  id: Generated<string>;
  tenant_id: TenantId;
  number: number;
  status: Generated<EstimateStatus>;
  source: Generated<"team" | "inquiry">;
  title: Generated<string>;
  client: Json<unknown>;
  contact_id: string | null;
  trade_account_id: string | null;
  items: Json<unknown>;
  discount: Json<unknown>;
  shipping_cents: Generated<number>;
  subtotal_cents: Generated<number>;
  discount_cents: Generated<number>;
  total_cents: Generated<number>;
  currency: Generated<string>;
  notes: Generated<string>;
  internal_note: Generated<string>;
  valid_until: ColumnType<string | null, string | null | undefined, string | null>;
  link_version: Generated<number>;
  sent_at: TimestampNullable;
  viewed_at: TimestampNullable;
  responded_at: TimestampNullable;
  approved_name: Generated<string>;
  change_request: Generated<string>;
  delivery: Json<unknown>;
  stripe_customer_id: string | null;
  stripe_invoice_id: string | null;
  invoice_url: string | null;
  invoiced_at: TimestampNullable;
  paid_at: TimestampNullable;
  order_id: string | null;
  created_by: Generated<string>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface EstimateEventsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  estimate_id: string;
  kind: EstimateEventKind;
  actor: Generated<string>;
  detail: Generated<string>;
  created_at: Timestamp;
}

export interface OrdersTable {
  id: Generated<string>;
  tenant_id: TenantId;
  number: number;
  source: OrderSource;
  status: Generated<OrderStatus>;
  fulfillment: Generated<FulfillmentStatus>;
  email: string;
  name: Generated<string>;
  phone: Generated<string>;
  ship_to: Json<unknown>;
  items: Json<unknown>;
  subtotal_cents: Generated<number>;
  discount_cents: Generated<number>;
  shipping_cents: Generated<number>;
  tax_cents: Generated<number>;
  total_cents: Generated<number>;
  refunded_cents: Generated<number>;
  currency: Generated<string>;
  discount_code: Generated<string>;
  shipping_service: Generated<string>;
  cart_id: string | null;
  estimate_id: string | null;
  contact_id: string | null;
  trade_account_id: string | null;
  stripe_account_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_invoice_id: string | null;
  alert: Json<unknown>;
  fulfillment_detail: Json<unknown>;
  note: Generated<string>;
  paid_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface DiscountRedemptionsTable {
  id: Generated<string>;
  tenant_id: TenantId;
  discount_id: string | null;
  offer_code_id: string | null;
  code: string;
  status: Generated<RedemptionStatus>;
  reserved_until: TimestampNullable;
  email: string | null;
  trade_account_id: string | null;
  cart_id: string | null;
  order_id: string | null;
  amount_cents: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ContactSharesTable {
  id: Generated<string>;
  tenant_id: TenantId;
  contact_id: string;
  expires_at: Timestamp;
  revoked_at: TimestampNullable;
  created_by: Generated<string>;
  created_at: Timestamp;
  updated_at: Timestamp;
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
  pages: PagesTable;
  page_revisions: PageRevisionsTable;
  page_agent_runs: PageAgentRunsTable;
  webhook_events: WebhookEventsTable;
  marketing_settings: MarketingSettingsTable;
  files: FilesTable;
  subscribers: SubscribersTable;
  lists: ListsTable;
  list_items: ListItemsTable;
  unsubscribes: UnsubscribesTable;
  newsletters: NewslettersTable;
  newsletter_templates: NewsletterTemplatesTable;
  sequences: SequencesTable;
  sequence_steps: SequenceStepsTable;
  sequence_runs: SequenceRunsTable;
  offer_codes: OfferCodesTable;
  email_sends: EmailSendsTable;
  worker_runs: WorkerRunsTable;
  sales_settings: SalesSettingsTable;
  products: ProductsTable;
  product_variants: ProductVariantsTable;
  trade_accounts: TradeAccountsTable;
  discounts: DiscountsTable;
  carts: CartsTable;
  estimates: EstimatesTable;
  estimate_events: EstimateEventsTable;
  orders: OrdersTable;
  discount_redemptions: DiscountRedemptionsTable;
  contact_shares: ContactSharesTable;
}

export type Tenant = Selectable<TenantsTable>;
export type Member = Selectable<MembersTable>;
export type Entitlement = Selectable<EntitlementsTable>;
export type Settings = Selectable<SettingsTable>;
export type Contact = Selectable<ContactsTable>;
export type Submission = Selectable<SubmissionsTable>;
export type NewContact = Insertable<ContactsTable>;
export type ContactUpdate = Updateable<ContactsTable>;
