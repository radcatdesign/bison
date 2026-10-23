-- 0004_page_agent_runs
-- 1. Agent requests are counted in their own table, recorded when a run starts.
--    No foreign key to pages and no update or delete for the app, so deleting a
--    page (or anything else) can't give a tenant its requests back.
-- 2. A published page only shows while the tenant has Marketing. When a trial
--    lapses, its pages go offline on their own.

create table page_agent_runs (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  page_id    uuid,
  actor      text not null default '',
  created_at timestamptz not null default now()
);
create index page_agent_runs_month on page_agent_runs (tenant_id, created_at);
select apply_tenant_policy('page_agent_runs');
grant select, insert on page_agent_runs to bisonops_app;

drop index if exists page_revisions_agent;

-- Same rule as the app's entitlement check (src/lib/access/entitlements.ts):
-- an active or past-due row for module:marketing that has started and not ended.
create or replace function resolve_published_page(p_tenant_slug text, p_page_slug text)
returns table (tenant_id uuid, page_id uuid)
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.tenant_id, p.id
  from pages p join tenants t on t.id = p.tenant_id
  where t.slug = p_tenant_slug and p.slug = p_page_slug
    and t.status = 'active' and p.published_doc is not null
    and exists (
      select 1 from entitlements e
      where e.tenant_id = p.tenant_id and e.item_key = 'module:marketing'
        and e.status in ('active', 'past_due')
        and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())
    )
$$;
revoke execute on function resolve_published_page(text, text) from public;
grant execute on function resolve_published_page(text, text) to bisonops_app;
