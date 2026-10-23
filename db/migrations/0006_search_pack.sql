-- 0006_search_pack
-- The dashboard's own robots.txt is shared by every company's landing pages
-- (they live under /p/<company>/). Companies that turned off AI crawlers in
-- their search pack are listed there by address. This returns those addresses
-- and nothing else.

create or replace function ai_blocked_tenant_slugs()
returns setof text
language sql stable security definer set search_path = public, pg_temp
as $$
  select t.slug from tenants t join marketing_settings m on m.tenant_id = t.id
  where t.status = 'active' and m.search ->> 'allowAi' = 'false'
  order by t.slug
  limit 5000
$$;
revoke execute on function ai_blocked_tenant_slugs() from public;
grant execute on function ai_blocked_tenant_slugs() to bisonops_app;
