-- 0005_marketing
-- Everything behind Marketing's email side: the brand kit and other marketing
-- settings, uploaded images, subscribers and lists, the do-not-email list,
-- newsletters and saved templates, email series, welcome offer codes, and
-- email_sends: one row per email to one person, which is also the queue the
-- send job works from.
--
-- Same rules as every tenant table: tenant_id defaults to the transaction's
-- tenant, RLS with the one tenant_isolation policy, same-tenant foreign keys.

-- ── Marketing settings (one row per tenant) ─────────────────────────────────
-- Each column is a JSON document checked by the app (src/lib/marketing/settings.ts).

create table marketing_settings (
  tenant_id  uuid primary key default app_tenant_id() references tenants (id) on delete cascade,
  brand      jsonb not null default '{}' check (jsonb_typeof(brand) = 'object' and pg_column_size(brand) < 40000),
  signup     jsonb not null default '{}' check (jsonb_typeof(signup) = 'object' and pg_column_size(signup) < 20000),
  offer      jsonb not null default '{}' check (jsonb_typeof(offer) = 'object' and pg_column_size(offer) < 10000),
  search     jsonb not null default '{}' check (jsonb_typeof(search) = 'object' and pg_column_size(search) < 40000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger marketing_settings_touch before update on marketing_settings for each row execute function touch_updated_at();
select apply_tenant_policy('marketing_settings');

-- ── Uploaded images (logos and email photos) ────────────────────────────────
-- Stored here, resized and stripped of metadata by the app. Served at /f/<id>,
-- because email clients load images without signing in.

create table files (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  kind         text not null check (kind in ('logo', 'email-image')),
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/gif')),
  bytes        bytea not null check (octet_length(bytes) between 1 and 2097152),
  width        int not null check (width between 1 and 4000),
  height       int not null check (height between 1 and 8000),
  name         text not null default '' check (length(name) <= 200),
  created_by   text not null default '',
  created_at   timestamptz not null default now(),
  unique (tenant_id, id)
);
create index files_tenant_recent on files (tenant_id, created_at desc);
select apply_tenant_policy('files');

-- ── Subscribers and lists ───────────────────────────────────────────────────

create table subscribers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  email           text not null check (email = lower(email) and position('@' in email) > 1 and length(email) <= 254),
  name            text not null default '' check (length(name) <= 120),
  -- "I am a..." as a stable value (homeowner, pro), never the label shown on the form.
  kind            text not null default '' check (kind ~ '^[a-z0-9-]{0,40}$'),
  status          text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed', 'bounced', 'complained')),
  source          text not null default 'manual' check (source in ('manual', 'import', 'page', 'form')),
  source_detail   text not null default '' check (length(source_detail) <= 120),
  subscribed_at   timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, email),
  unique (tenant_id, id)
);
create index subscribers_tenant_status on subscribers (tenant_id, status, subscribed_at desc);
create trigger subscribers_touch before update on subscribers for each row execute function touch_updated_at();
select apply_tenant_policy('subscribers');

create table lists (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  name       text not null check (length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (tenant_id, name),
  unique (tenant_id, id)
);
select apply_tenant_policy('lists');

create table list_items (
  tenant_id     uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  list_id       uuid not null,
  subscriber_id uuid not null,
  added_at      timestamptz not null default now(),
  primary key (tenant_id, list_id, subscriber_id),
  foreign key (tenant_id, list_id) references lists (tenant_id, id) on delete cascade,
  foreign key (tenant_id, subscriber_id) references subscribers (tenant_id, id) on delete cascade
);
create index list_items_subscriber on list_items (tenant_id, subscriber_id);
select apply_tenant_policy('list_items');

-- The do-not-email list. One row per address, whether or not they were ever a
-- subscriber (a form sender can unsubscribe from a series too). Every send
-- checks it. Removing a row is only for someone signing up again themselves.
create table unsubscribes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  email      text not null check (email = lower(email) and position('@' in email) > 1 and length(email) <= 254),
  reason     text not null check (reason in ('link', 'one-click', 'team', 'complaint', 'bounce', 'suppressed')),
  detail     text not null default '' check (length(detail) <= 300),
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);
create index unsubscribes_tenant_recent on unsubscribes (tenant_id, created_at desc);
select apply_tenant_policy('unsubscribes');

-- ── Newsletters ─────────────────────────────────────────────────────────────

create table newsletters (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  subject       text not null default '' check (length(subject) <= 150),
  preheader     text not null default '' check (length(preheader) <= 150),
  doc           jsonb not null check (jsonb_typeof(doc) = 'object' and pg_column_size(doc) < 200000),
  status        text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'canceled')),
  audience      text not null default 'all' check (audience in ('all', 'list')),
  list_id       uuid,
  -- What the audience was called when it went out, so history reads right after a list is renamed or deleted.
  audience_name text not null default '',
  scheduled_for timestamptz,
  started_at    timestamptz,
  sent_at       timestamptz,
  recipients    int not null default 0,
  error         text,
  created_by    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, list_id) references lists (tenant_id, id) on delete set null (list_id),
  check (status <> 'scheduled' or scheduled_for is not null)
);
create index newsletters_tenant_recent on newsletters (tenant_id, updated_at desc);
create index newsletters_due on newsletters (scheduled_for) where status = 'scheduled';
create trigger newsletters_touch before update on newsletters for each row execute function touch_updated_at();
select apply_tenant_policy('newsletters');

create table newsletter_templates (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  name       text not null check (length(name) between 1 and 80),
  subject    text not null default '' check (length(subject) <= 150),
  preheader  text not null default '' check (length(preheader) <= 150),
  doc        jsonb not null check (jsonb_typeof(doc) = 'object' and pg_column_size(doc) < 200000),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);
select apply_tenant_policy('newsletter_templates');

-- ── Email series ────────────────────────────────────────────────────────────

create table sequences (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  name           text not null check (length(name) between 1 and 80),
  trigger        text not null check (trigger in ('joined', 'form', 'estimate', 'cart', 'manual')),
  -- For 'form': which form (a form key like page:spring-sale). Otherwise empty.
  trigger_detail text not null default '' check (length(trigger_detail) <= 120),
  status         text not null default 'off' check (status in ('on', 'off')),
  paused_at      timestamptz default now(),
  starter        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, id)
);
-- One starter welcome series per company.
create unique index sequences_one_starter on sequences (tenant_id) where starter;
create trigger sequences_touch before update on sequences for each row execute function touch_updated_at();
select apply_tenant_policy('sequences');

create table sequence_steps (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  sequence_id uuid not null,
  -- Days after someone starts. 0 sends right away. One email per day of a series.
  delay_days  int not null check (delay_days between 0 and 365),
  subject     text not null default '' check (length(subject) <= 150),
  preheader   text not null default '' check (length(preheader) <= 150),
  doc         jsonb not null check (jsonb_typeof(doc) = 'object' and pg_column_size(doc) < 200000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, sequence_id, delay_days),
  foreign key (tenant_id, sequence_id) references sequences (tenant_id, id) on delete cascade
);
create trigger sequence_steps_touch before update on sequence_steps for each row execute function touch_updated_at();
select apply_tenant_policy('sequence_steps');

-- One person going through one series. "Already in it" means any run at all,
-- so nobody gets the same series twice.
create table sequence_runs (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  sequence_id    uuid not null,
  subscriber_id  uuid,
  email          text not null check (email = lower(email) and position('@' in email) > 1 and length(email) <= 254),
  name           text not null default '' check (length(name) <= 120),
  status         text not null default 'active' check (status in ('active', 'done', 'stopped')),
  started_at     timestamptz not null default now(),
  -- The day of the last step sent (-1 before the first), and when the next one is due.
  last_day       int not null default -1,
  next_at        timestamptz,
  locked_until   timestamptz,
  stopped_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, sequence_id, email),
  foreign key (tenant_id, sequence_id) references sequences (tenant_id, id) on delete cascade,
  foreign key (tenant_id, subscriber_id) references subscribers (tenant_id, id) on delete set null (subscriber_id)
);
create index sequence_runs_due on sequence_runs (next_at) where status = 'active';
create index sequence_runs_email on sequence_runs (tenant_id, email);
create trigger sequence_runs_touch before update on sequence_runs for each row execute function touch_updated_at();
select apply_tenant_policy('sequence_runs');

-- ── Welcome offer codes ─────────────────────────────────────────────────────

create table offer_codes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  code          text not null check (code ~ '^[A-Z0-9-]{4,40}$'),
  subscriber_id uuid,
  email         text not null check (email = lower(email) and position('@' in email) > 1 and length(email) <= 254),
  -- What it was worth when it was issued, so changing the offer never changes a code someone already has.
  discount_kind text not null check (discount_kind in ('percent', 'amount')),
  discount      numeric(10, 2) not null check (discount > 0),
  expires_at    timestamptz,
  issued_at     timestamptz not null default now(),
  redeemed_at   timestamptz,
  redeemed_note text not null default '' check (length(redeemed_note) <= 200),
  unique (tenant_id, code),
  -- One per signup, ever.
  unique (tenant_id, email),
  foreign key (tenant_id, subscriber_id) references subscribers (tenant_id, id) on delete set null (subscriber_id)
);
select apply_tenant_policy('offer_codes');

-- ── Every email to one person ───────────────────────────────────────────────
-- Also the send queue: rows wait as 'queued' until next_attempt_at, the send
-- job claims them with a short lease, and failed sends wait a little and retry.
-- The app can't delete these rows, so the monthly email count can't be undone.

create table email_sends (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  kind            text not null check (kind in ('newsletter', 'series', 'test')),
  newsletter_id   uuid,
  sequence_id     uuid,
  step_id         uuid,
  run_id          uuid,
  subscriber_id   uuid,
  email           text not null check (email = lower(email) and position('@' in email) > 1 and length(email) <= 254),
  name            text not null default '' check (length(name) <= 120),
  subject         text not null default '' check (length(subject) <= 200),
  status          text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'canceled')),
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until    timestamptz,
  provider_id     text,
  error           text check (length(error) <= 500),
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, newsletter_id) references newsletters (tenant_id, id) on delete set null (newsletter_id),
  foreign key (tenant_id, sequence_id) references sequences (tenant_id, id) on delete set null (sequence_id),
  foreign key (tenant_id, step_id) references sequence_steps (tenant_id, id) on delete set null (step_id),
  foreign key (tenant_id, run_id) references sequence_runs (tenant_id, id) on delete set null (run_id),
  foreign key (tenant_id, subscriber_id) references subscribers (tenant_id, id) on delete set null (subscriber_id)
);
-- A newsletter goes to each address once; a series step goes to each run once.
create unique index email_sends_newsletter_once on email_sends (tenant_id, newsletter_id, email) where kind = 'newsletter' and newsletter_id is not null;
create unique index email_sends_step_once on email_sends (tenant_id, run_id, step_id) where kind = 'series' and run_id is not null and step_id is not null;
create index email_sends_queue on email_sends (next_attempt_at) where status in ('queued', 'sending');
create index email_sends_month on email_sends (tenant_id, created_at);
create index email_sends_email on email_sends (tenant_id, email, created_at desc);
create index email_sends_provider on email_sends (provider_id) where provider_id is not null;
create trigger email_sends_touch before update on email_sends for each row execute function touch_updated_at();
select apply_tenant_policy('email_sends');

-- ── System: when each background job last ran (no tenant data) ──────────────

create table worker_runs (
  name        text primary key check (name ~ '^[a-z0-9-]{1,40}$'),
  last_run_at timestamptz not null default now(),
  last_result jsonb not null default '{}' check (pg_column_size(last_result) < 4000)
);

-- ── Narrow lookups for requests that arrive without a tenant ────────────────

-- The send job runs for every company. This lists the companies that have
-- something due, and nothing else.
create or replace function due_marketing_tenants(p_limit int default 200)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct t.id from tenants t
  where t.status = 'active' and (
    exists (select 1 from newsletters n where n.tenant_id = t.id and n.status = 'scheduled' and n.scheduled_for <= now())
    or exists (select 1 from newsletters n where n.tenant_id = t.id and n.status = 'sending')
    or exists (select 1 from email_sends e where e.tenant_id = t.id and e.status in ('queued', 'sending') and e.next_attempt_at <= now())
    or exists (
      select 1 from sequence_runs r join sequences q on q.tenant_id = r.tenant_id and q.id = r.sequence_id
      where r.tenant_id = t.id and r.status = 'active' and q.status = 'on' and r.next_at <= now()
    )
  )
  limit greatest(1, least(p_limit, 1000))
$$;

-- Unsubscribe links carry a signed send id. This finds whose send it is.
create or replace function resolve_email_send(p_send_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select tenant_id from email_sends where id = p_send_id $$;

-- Provider webhooks name the message the provider sent.
create or replace function resolve_email_provider_id(p_provider_id text)
returns table (tenant_id uuid, send_id uuid)
language sql stable security definer set search_path = public, pg_temp
as $$ select tenant_id, id from email_sends where provider_id = p_provider_id and p_provider_id <> '' limit 1 $$;

-- Images in emails and on pages load without a session.
create or replace function resolve_public_file(p_file_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select f.tenant_id from files f join tenants t on t.id = f.tenant_id where f.id = p_file_id and t.status = 'active' $$;

-- A company's search files (sitemap, llms.txt) by its address, while it has Marketing.
create or replace function resolve_marketing_tenant(p_tenant_slug text) returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select t.id from tenants t
  where t.slug = p_tenant_slug and t.status = 'active'
    and exists (
      select 1 from entitlements e
      where e.tenant_id = t.id and e.item_key = 'module:marketing'
        and e.status in ('active', 'past_due')
        and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())
    )
$$;

revoke execute on function due_marketing_tenants(int) from public;
revoke execute on function resolve_email_send(uuid) from public;
revoke execute on function resolve_email_provider_id(text) from public;
revoke execute on function resolve_public_file(uuid) from public;
revoke execute on function resolve_marketing_tenant(text) from public;

-- ── Grants ──────────────────────────────────────────────────────────────────

grant select, insert, update on marketing_settings to bisonops_app;
grant select, insert, delete on files to bisonops_app;
grant select, insert, update, delete on subscribers, lists, list_items, unsubscribes, newsletters, newsletter_templates, sequences, sequence_steps, sequence_runs to bisonops_app;
grant select, insert, update on offer_codes to bisonops_app;
grant select, insert, update on email_sends to bisonops_app;
grant select, insert, update on worker_runs to bisonops_app;
grant execute on function
  due_marketing_tenants(int), resolve_email_send(uuid), resolve_email_provider_id(text),
  resolve_public_file(uuid), resolve_marketing_tenant(text)
to bisonops_app;
