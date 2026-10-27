-- 0016_boosts
-- Boosts: club tools a Fit Funnels club switches on one at a time, like
-- "we miss you" nudges, milestone shout-outs at the kiosk or instant lead
-- alerts. One row per boost a club has touched; no row means off.

create table club_boosts (
  tenant_id     uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  key           text not null check (key ~ '^[a-z][a-z-]{1,39}$'),
  on_now        boolean not null default false,
  -- The boost's own settings, checked by src/lib/boosts/catalog.ts.
  settings      jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 4000),
  -- First switched on, for XP and the "on since" line.
  first_on_at   timestamptz,
  changed_by    text not null default '' check (length(changed_by) <= 120),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (tenant_id, key)
);
create trigger club_boosts_touch before update on club_boosts for each row execute function touch_updated_at();
select apply_tenant_policy('club_boosts');

grant select, insert, update on club_boosts to bisonops_app;
