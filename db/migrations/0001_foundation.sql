-- 0001_foundation
-- Runs as the schema owner. The runtime role `bisonops_app` must already exist
-- (pnpm db:setup creates it). Every tenant table gets RLS and the
-- `tenant_isolation` policy; the schema lint test enforces this.

-- ── Tenant context ──────────────────────────────────────────────────────────
-- Set per transaction by withTenant() with set_config(..., true).
-- nullif guards the '' a custom setting reverts to after a local set ends.

create or replace function app_tenant_id() returns uuid
language sql stable parallel safe
as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

create or replace function app_user_id() returns text
language sql stable parallel safe
as $$ select nullif(current_setting('app.user_id', true), '') $$;

create or replace function touch_updated_at() returns trigger
language plpgsql
as $$ begin new.updated_at := now(); return new; end $$;

-- Applies RLS and the one standard policy to a tenant table.
create or replace function apply_tenant_policy(tbl regclass) returns void
language plpgsql
as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('drop policy if exists tenant_isolation on %s', tbl);
  execute format(
    'create policy tenant_isolation on %s to bisonops_app '
    'using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id())', tbl);
end $$;
revoke execute on function apply_tenant_policy(regclass) from public;

-- ── Tenants ─────────────────────────────────────────────────────────────────

create table tenants (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(name) between 1 and 120),
  slug               text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  industry           text not null default 'general' check (industry ~ '^[a-z0-9-]{2,40}$'),
  clerk_org_id       text unique,
  stripe_customer_id text unique,
  status             text not null default 'active' check (status in ('active', 'suspended')),
  retention_days     int  not null default 400 check (retention_days between 30 and 1100),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger tenants_touch before update on tenants for each row execute function touch_updated_at();
alter table tenants enable row level security;
create policy tenant_isolation on tenants to bisonops_app
  using (id = app_tenant_id()) with check (id = app_tenant_id());

-- ── Sites ───────────────────────────────────────────────────────────────────

create table sites (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  domain         text not null check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  site_key       text not null unique default ('site_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24)),
  -- Set once ownership is proven (DNS TXT record, Phase 1). Until then a domain
  -- can't lock anyone else out, and nobody learns which domains are customers.
  verified_at    timestamptz,
  excluded_ips   cidr[] not null default '{}',
  first_event_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, domain)
);
create unique index sites_verified_domain on sites (domain) where verified_at is not null;
select apply_tenant_policy('sites');

-- ── Members ─────────────────────────────────────────────────────────────────
-- Roles live here, not in the auth provider, so they work the same with any provider.

create table members (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  user_id    text,
  email      text not null check (email = lower(email) and position('@' in email) > 1),
  name       text not null default '',
  role       text not null check (role in ('owner', 'admin', 'sales', 'marketing', 'viewer')),
  -- invited: added in Bison Ops, not signed in yet. pending: joined the Clerk org
  -- without an invite, waiting for an owner or admin to approve.
  status     text not null default 'active' check (status in ('active', 'invited', 'pending', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (tenant_id, email),
  unique (tenant_id, id)
);
create trigger members_touch before update on members for each row execute function touch_updated_at();
select apply_tenant_policy('members');

-- ── Entitlements and subscriptions ──────────────────────────────────────────
-- Base is always on and never stored. Modules and add-ons are rows here.

create table entitlements (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  item_key                    text not null check (item_key ~ '^(module|addon):[a-z0-9-]+$'),
  source                      text not null check (source in ('subscription', 'trial', 'grant')),
  status                      text not null default 'active' check (status in ('active', 'past_due', 'canceled', 'expired')),
  starts_at                   timestamptz not null default now(),
  ends_at                     timestamptz,
  stripe_subscription_id      text,
  stripe_subscription_item_id text,
  note                        text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (tenant_id, item_key, source)
);
create trigger entitlements_touch before update on entitlements for each row execute function touch_updated_at();
select apply_tenant_policy('entitlements');

create table subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  stripe_subscription_id text not null unique,
  status                 text not null,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger subscriptions_touch before update on subscriptions for each row execute function touch_updated_at();
select apply_tenant_policy('subscriptions');

-- ── Integrations (secrets encrypted by the app before they get here) ────────

create table integrations (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  provider          text not null check (provider ~ '^[a-z0-9-]+$'),
  status            text not null default 'not_set_up' check (status in ('connected', 'needs_attention', 'not_set_up')),
  secret_ciphertext text,
  public_config     jsonb not null default '{}',
  last_checked_at   timestamptz,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, provider)
);
create trigger integrations_touch before update on integrations for each row execute function touch_updated_at();
select apply_tenant_policy('integrations');

-- ── Settings (one row per tenant) ───────────────────────────────────────────

create table settings (
  tenant_id   uuid primary key default app_tenant_id() references tenants (id) on delete cascade,
  sample_data boolean not null default true,
  accent      text not null default '#7df9ff' check (accent ~ '^#[0-9a-f]{6}$'),
  timezone    text not null default 'America/Los_Angeles' check (timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'),
  privacy     jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger settings_touch before update on settings for each row execute function touch_updated_at();
select apply_tenant_policy('settings');

-- ── Audit log (append only for the app) ─────────────────────────────────────

create table audit_log (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  actor_user_id text default app_user_id(),
  action        text not null check (action ~ '^[a-z0-9_.-]+$'),
  target_type   text,
  target_id     text,
  detail        jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index audit_log_tenant_time on audit_log (tenant_id, created_at desc);
select apply_tenant_policy('audit_log');

-- ── Contacts and submissions ────────────────────────────────────────────────

create table contacts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  email         text not null check (email = lower(email) and position('@' in email) > 1),
  name          text not null default '',
  phone         text not null default '',
  status        text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'won', 'lost', 'spam')),
  is_new        boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, email),
  unique (tenant_id, id)
);
create index contacts_tenant_recent on contacts (tenant_id, last_seen_at desc);
create trigger contacts_touch before update on contacts for each row execute function touch_updated_at();
select apply_tenant_policy('contacts');

create table submissions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  contact_id  uuid,
  site_id     uuid,
  form_key    text not null,
  form_type   text not null default 'general',
  fields      jsonb not null default '{}',
  status      text not null default 'received' check (status in ('received', 'spam')),
  spam_reason text,
  alert       jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, contact_id) references contacts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, site_id) references sites (tenant_id, id) on delete set null (site_id)
);
create index submissions_tenant_contact on submissions (tenant_id, contact_id, created_at desc);
select apply_tenant_policy('submissions');

-- ── Events (partitioned by month) ───────────────────────────────────────────

create table events (
  tenant_id    uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  id           uuid not null default gen_random_uuid(),
  occurred_at  timestamptz not null default now(),
  site_id      uuid not null,
  visit_id     text not null,
  browser_id   text,
  visitor_hash text not null,
  type         text not null check (type in ('pageview', 'leave', 'action', 'heartbeat')),
  path         text not null default '/',
  name         text,
  label        text,
  props        jsonb not null default '{}',
  primary key (tenant_id, occurred_at, id),
  foreign key (tenant_id, site_id) references sites (tenant_id, id) on delete cascade
) partition by range (occurred_at);
create index events_tenant_site_time on events (tenant_id, site_id, occurred_at);
create index events_tenant_visit on events (tenant_id, visit_id);
select apply_tenant_policy('events');

-- Creates this month's partition plus `months_ahead` after it and `months_back`
-- before it (for imports and seeds), each with RLS. The app role gets no direct
-- grants on partitions; it reads and writes through `events`.
create or replace function ensure_event_partitions(months_ahead int default 2, months_back int default 0) returns int
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  m date;
  part text;
  created int := 0;
begin
  if months_ahead not between 0 and 24 or months_back not between 0 and 36 then
    raise exception 'months_ahead must be 0 to 24 and months_back 0 to 36';
  end if;
  for i in -months_back..months_ahead loop
    m := (date_trunc('month', now()) + make_interval(months => i))::date;
    part := 'events_' || to_char(m, 'YYYY_MM');
    if to_regclass(part) is null then
      execute format('create table %I partition of events for values from (%L) to (%L)',
                     part, m, (m + interval '1 month')::date);
      perform apply_tenant_policy(part::regclass);
      execute format('revoke all on %I from bisonops_app', part);
      created := created + 1;
    end if;
  end loop;
  return created;
end $$;

-- Drops partitions older than the longest retention, then deletes rows past each tenant's own.
create or replace function purge_expired_events() returns bigint
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  longest int;
  r record;
  part_end date;
  deleted bigint;
begin
  select coalesce(max(retention_days), 400) into longest from tenants;
  for r in
    select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid
    where i.inhparent = 'events'::regclass and c.relname ~ '^events_\d{4}_\d{2}$'
  loop
    part_end := (to_date(substr(r.relname, 8), 'YYYY_MM') + interval '1 month')::date;
    if part_end < (now() - make_interval(days => longest))::date then
      execute format('drop table %I', r.relname);
    end if;
  end loop;
  delete from events e using tenants t
  where e.tenant_id = t.id and e.occurred_at < now() - make_interval(days => t.retention_days);
  get diagnostics deleted = row_count;
  return deleted;
end $$;

select ensure_event_partitions(2, 1);

-- ── System: webhook dedupe (no tenant; app may insert only) ─────────────────

create table webhook_events (
  provider    text not null,
  event_id    text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- ── Narrow lookups for requests that arrive without a tenant ────────────────

create or replace function resolve_tenant_by_clerk_org(p_org_id text) returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select id from tenants where clerk_org_id = p_org_id and status = 'active' $$;

create or replace function resolve_tenant_by_stripe_customer(p_customer_id text) returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select id from tenants where stripe_customer_id = p_customer_id $$;

-- Unverified sites resolve too: the first page view is how onboarding shows the
-- tag works. Collection still checks the request's origin against the domain.
create or replace function resolve_site_by_key(p_site_key text)
returns table (tenant_id uuid, site_id uuid, domain text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select s.tenant_id, s.id, s.domain
  from sites s join tenants t on t.id = s.tenant_id
  where s.site_key = p_site_key and t.status = 'active'
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke execute on function ensure_event_partitions(int, int) from public;
revoke execute on function purge_expired_events() from public;
revoke execute on function resolve_tenant_by_clerk_org(text) from public;
revoke execute on function resolve_tenant_by_stripe_customer(text) from public;
revoke execute on function resolve_site_by_key(text) from public;

grant usage on schema public to bisonops_app;
grant select, insert, update, delete on
  members, entitlements, subscriptions, integrations,
  settings, contacts, submissions, events
to bisonops_app;
-- Sites: verified_at is only ever set by the system after a DNS check.
grant select, delete on sites to bisonops_app;
grant insert (tenant_id, domain, excluded_ips) on sites to bisonops_app;
grant update (excluded_ips, first_event_at) on sites to bisonops_app;
-- Tenants: the app can create its own row and change a few columns. Deleting a
-- tenant, suspending one, or moving it to another Clerk org is system work.
grant select, insert on tenants to bisonops_app;
grant update (name, industry, stripe_customer_id) on tenants to bisonops_app;
grant select, insert on audit_log to bisonops_app;
grant insert on webhook_events to bisonops_app;
grant execute on function
  app_tenant_id(), app_user_id(),
  ensure_event_partitions(int, int), purge_expired_events(),
  resolve_tenant_by_clerk_org(text), resolve_tenant_by_stripe_customer(text), resolve_site_by_key(text)
to bisonops_app;
