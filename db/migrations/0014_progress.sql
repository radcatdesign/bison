-- 0014_progress
-- XP, levels and achievements. XP is earned once per thing done: a campaign
-- made, a page published, a newsletter sent, and so on. Awards are worked out
-- from the company's own records (src/lib/progress), so nothing has to be
-- remembered at the moment it happens, and once earned they're kept even if
-- the thing is later deleted. A level is every 10 XP.

create table xp_awards (
  tenant_id  uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  -- What it was for, like 'campaign' or 'newsletter-sent'.
  kind       text not null check (kind ~ '^[a-z][a-z-]{1,39}$'),
  -- Which one: a record's id, so the same thing never earns twice.
  ref        text not null check (length(ref) between 1 and 80),
  points     int not null check (points between 1 and 100),
  -- What it was, in words, as it read when earned.
  label      text not null default '' check (length(label) <= 160),
  earned_at  timestamptz not null default now(),
  primary key (tenant_id, kind, ref)
);
create index xp_awards_recent on xp_awards (tenant_id, earned_at desc);
select apply_tenant_policy('xp_awards');

create table achievements (
  tenant_id  uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  key        text not null check (key ~ '^[a-z][a-z0-9-]{1,39}$'),
  earned_at  timestamptz not null default now(),
  primary key (tenant_id, key)
);
select apply_tenant_policy('achievements');

-- Earned is earned: the app can add awards but not change or take them away.
grant select, insert on xp_awards, achievements to bisonops_app;
