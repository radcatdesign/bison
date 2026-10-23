-- 0003_pages
-- Landing pages built in Marketing > Pages. The draft lives in `doc`; visitors
-- see `published_doc`. Revisions keep every agent change and every publish.

create table pages (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  slug          text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  title         text not null check (length(title) between 1 and 120),
  doc           jsonb not null check (jsonb_typeof(doc) = 'object' and pg_column_size(doc) < 200000),
  published_doc jsonb check (published_doc is null or (jsonb_typeof(published_doc) = 'object' and pg_column_size(published_doc) < 200000)),
  published_at  timestamptz,
  created_by    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, id)
);
create index pages_tenant_recent on pages (tenant_id, updated_at desc);
create trigger pages_touch before update on pages for each row execute function touch_updated_at();
select apply_tenant_policy('pages');

create table page_revisions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  page_id     uuid not null,
  source      text not null check (source in ('agent', 'publish')),
  doc         jsonb not null check (pg_column_size(doc) < 200000),
  instruction text not null default '' check (length(instruction) <= 4000),
  reply       text not null default '' check (length(reply) <= 4000),
  actor       text not null default '',
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, page_id) references pages (tenant_id, id) on delete cascade
);
create index page_revisions_page on page_revisions (tenant_id, page_id, created_at desc);
-- Counts agent requests per month for the plan limit.
create index page_revisions_agent on page_revisions (tenant_id, created_at) where source = 'agent';
select apply_tenant_policy('page_revisions');

-- Public pages arrive with no session. This finds a published page by its
-- address and returns its ids and nothing else; the read then happens under
-- that tenant's own row-level security.
create or replace function resolve_published_page(p_tenant_slug text, p_page_slug text)
returns table (tenant_id uuid, page_id uuid)
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.tenant_id, p.id
  from pages p join tenants t on t.id = p.tenant_id
  where t.slug = p_tenant_slug and p.slug = p_page_slug
    and t.status = 'active' and p.published_doc is not null
$$;
revoke execute on function resolve_published_page(text, text) from public;

grant select, insert, update, delete on pages to bisonops_app;
grant select, insert, delete on page_revisions to bisonops_app;
grant execute on function resolve_published_page(text, text) to bisonops_app;
