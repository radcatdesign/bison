-- 0009_page_tests
-- A/B tests on landing pages: a test on one page, its versions (A is the live
-- page, B and C are edited copies), and one row per visitor per day saying
-- which version they saw and whether they did what the test is counting.
--
-- Visitors are a hash of the test, their network address and their browser,
-- keyed with a random salt per company per day. Salts are deleted after two
-- days, so a visitor can't be matched across days by anyone, us included.
-- No cookie is set and nothing that names a person is stored.

create table page_tests (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  page_id           uuid not null,
  name              text not null check (length(name) between 1 and 120),
  -- What the team thinks will happen and why. Optional.
  hypothesis        text not null default '' check (length(hypothesis) <= 1000),
  -- What counts: a form send on the page, or a click on one of its buttons.
  goal              text not null default 'form' check (goal in ('form', 'click')),
  status            text not null default 'draft' check (status in ('draft', 'running', 'ended')),
  -- End on its own once one version is clearly ahead, and keep that one live.
  auto_end          boolean not null default false,
  started_at        timestamptz,
  ended_at          timestamptz,
  end_reason        text not null default '' check (end_reason in ('', 'team', 'winner', 'unpublished')),
  -- The version kept live when it ended.
  kept_variant_id   uuid,
  created_by        text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, page_id) references pages (tenant_id, id) on delete cascade,
  check ((status = 'draft') = (started_at is null)),
  check ((status = 'ended') = (ended_at is not null))
);
-- One test at a time per page, from draft until it ends.
create unique index page_tests_one_open on page_tests (tenant_id, page_id) where status in ('draft', 'running');
create index page_tests_tenant on page_tests (tenant_id, status, created_at desc);
create trigger page_tests_touch before update on page_tests for each row execute function touch_updated_at();
select apply_tenant_policy('page_tests');

create table page_test_versions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  test_id     uuid not null,
  key         text not null check (key in ('a', 'b', 'c')),
  name        text not null default '' check (length(name) <= 60),
  -- A has no doc until the test starts; then it's a copy of the live page.
  doc         jsonb check (doc is null or (jsonb_typeof(doc) = 'object' and pg_column_size(doc) < 200000)),
  -- Share of visitors, in percent. The versions of a test add up to 100.
  weight      int not null default 50 check (weight between 0 and 100),
  -- Totals kept when the test ends, so they outlive the daily visit rows.
  visitors    int not null default 0 check (visitors >= 0),
  conversions int not null default 0 check (conversions >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, test_id, id),
  unique (tenant_id, test_id, key),
  foreign key (tenant_id, test_id) references page_tests (tenant_id, id) on delete cascade,
  check (key = 'a' or doc is not null)
);
create trigger page_test_versions_touch before update on page_test_versions for each row execute function touch_updated_at();
select apply_tenant_policy('page_test_versions');

-- The kept version has to be one of this test's own versions.
alter table page_tests add foreign key (tenant_id, id, kept_variant_id) references page_test_versions (tenant_id, test_id, id) on delete set null (kept_variant_id);

create table page_test_visits (
  tenant_id    uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  test_id      uuid not null,
  version_id   uuid not null,
  day          date not null,
  -- The day's visitor hash (base64url HMAC). Means nothing once that day's salt is gone.
  visitor      text not null check (length(visitor) between 16 and 64),
  -- Did the goal that day. A yes, not a time, so it can't be lined up with a form send.
  converted    boolean not null default false,
  primary key (tenant_id, test_id, day, visitor),
  foreign key (tenant_id, test_id) references page_tests (tenant_id, id) on delete cascade,
  -- The version has to belong to the same test.
  foreign key (tenant_id, test_id, version_id) references page_test_versions (tenant_id, test_id, id) on delete cascade
);
create index page_test_visits_version on page_test_visits (tenant_id, test_id, version_id, day);
select apply_tenant_policy('page_test_visits');

-- A random salt per company per day for the visitor hash. Today's and
-- yesterday's are kept (a visit late at night can still count a send just
-- after midnight); older ones are deleted.
create table page_test_salts (
  tenant_id  uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  day        date not null,
  salt       bytea not null check (length(salt) = 32),
  primary key (tenant_id, day)
);
select apply_tenant_policy('page_test_salts');

-- The page test job: companies with a test set to end on its own, or visit
-- rows or salts to clear out (whatever the company's status). Ids only.
create or replace function due_page_test_tenants(p_limit int default 200)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct t.id from tenants t
  where (t.status = 'active' and exists (select 1 from page_tests p where p.tenant_id = t.id and p.status = 'running' and p.auto_end))
    or exists (select 1 from page_tests p where p.tenant_id = t.id and p.status = 'ended' and p.ended_at < now() - interval '30 days'
               and exists (select 1 from page_test_visits v where v.tenant_id = t.id and v.test_id = p.id))
    or exists (select 1 from page_test_salts s where s.tenant_id = t.id and s.day < current_date - 1)
  limit p_limit
$$;
revoke execute on function due_page_test_tenants(int) from public;

grant select, insert, update, delete on page_tests, page_test_versions, page_test_visits to bisonops_app;
grant select, insert, delete on page_test_salts to bisonops_app;
grant execute on function due_page_test_tenants(int) to bisonops_app;
