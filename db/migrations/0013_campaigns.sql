-- 0013_campaigns
-- Campaigns: folders a team files its landing pages, emails (newsletters and
-- series) and graphics into, like "Spring launch" or "New Year challenge".
-- Filing never changes or deletes what's filed. Each page, newsletter, series
-- and graphic sits in one campaign at most.

create table campaigns (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  name         text not null check (length(name) between 1 and 80),
  notes        text not null default '' check (length(notes) <= 1000),
  -- One of a few named colors from the design tokens, so the folder is easy to spot.
  color        text not null default 'blue' check (color in ('blue', 'green', 'orange', 'pink', 'purple', 'gray')),
  starts_on    date,
  ends_on      date,
  archived_at  timestamptz,
  created_by   text not null default '' check (length(created_by) <= 120),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
-- Two campaigns can't share a name, ignoring case.
create unique index campaigns_name on campaigns (tenant_id, lower(name));
create index campaigns_recent on campaigns (tenant_id, archived_at nulls first, created_at desc);
create trigger campaigns_touch before update on campaigns for each row execute function touch_updated_at();
select apply_tenant_policy('campaigns');

alter table pages add column campaign_id uuid;
alter table pages add foreign key (tenant_id, campaign_id) references campaigns (tenant_id, id) on delete set null (campaign_id);
create index pages_campaign on pages (tenant_id, campaign_id) where campaign_id is not null;

alter table newsletters add column campaign_id uuid;
alter table newsletters add foreign key (tenant_id, campaign_id) references campaigns (tenant_id, id) on delete set null (campaign_id);
create index newsletters_campaign on newsletters (tenant_id, campaign_id) where campaign_id is not null;

alter table sequences add column campaign_id uuid;
alter table sequences add foreign key (tenant_id, campaign_id) references campaigns (tenant_id, id) on delete set null (campaign_id);
create index sequences_campaign on sequences (tenant_id, campaign_id) where campaign_id is not null;

-- Graphics are uploads, re-encoded like every image (kind 'graphic' in files).
alter table files drop constraint files_kind_check;
alter table files add constraint files_kind_check check (kind in ('logo', 'email-image', 'product-image', 'graphic'));

-- A graphic in a campaign. The file can be used in emails and pages like any
-- upload; removing it from the campaign doesn't take it down.
create table campaign_graphics (
  tenant_id    uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  campaign_id  uuid not null,
  file_id      uuid not null,
  name         text not null default '' check (length(name) <= 120),
  added_by     text not null default '' check (length(added_by) <= 120),
  added_at     timestamptz not null default now(),
  primary key (tenant_id, file_id),
  foreign key (tenant_id, campaign_id) references campaigns (tenant_id, id) on delete cascade,
  foreign key (tenant_id, file_id) references files (tenant_id, id) on delete cascade
);
create index campaign_graphics_campaign on campaign_graphics (tenant_id, campaign_id, added_at desc);
select apply_tenant_policy('campaign_graphics');

grant select, insert, update, delete on campaigns, campaign_graphics to bisonops_app;
