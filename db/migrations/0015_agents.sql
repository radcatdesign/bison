-- 0015_agents
-- Agents: a small team that gets work ready for a company. Each agent looks at
-- the company's own records and drafts work (a follow-up to a new lead, a
-- nudge for someone who didn't finish joining, a newsletter, a campaign plan,
-- a weekly read). Nothing goes out to a customer until someone on the team
-- approves it. One row per piece of work; the same lead or cart never gets two.

create table agent_tasks (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  agent        text not null check (agent in ('frontdesk', 'memberships', 'marketing', 'coach')),
  kind         text not null check (kind ~ '^[a-z][a-z-]{1,39}$'),
  -- What it's about (a contact, a cart, a page, a week), so it's drafted once.
  ref          text not null check (length(ref) between 1 and 120),
  title        text not null check (length(title) between 1 and 160),
  summary      text not null default '' check (length(summary) <= 2000),
  -- The drafted work: an email's to, subject and body, a campaign plan, links. Checked in src/lib/agents.
  draft        jsonb not null default '{}' check (jsonb_typeof(draft) = 'object' and pg_column_size(draft) < 60000),
  status       text not null default 'open' check (status in ('open', 'done', 'dismissed', 'failed')),
  -- What happened when it was approved, in words.
  result       text not null default '' check (length(result) <= 1000),
  decided_by   text not null default '' check (length(decided_by) <= 120),
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, kind, ref),
  check ((status = 'open') = (decided_at is null))
);
create index agent_tasks_open on agent_tasks (tenant_id, status, created_at desc);
create trigger agent_tasks_touch before update on agent_tasks for each row execute function touch_updated_at();
select apply_tenant_policy('agent_tasks');

grant select, insert, update on agent_tasks to bisonops_app;
