-- 0011_kiosk
-- The front desk kiosk for Fit Funnels clubs: a tablet at the desk where
-- walk-ins claim a free pass or book a tour, join by scanning a code, members
-- check in, and people sign the club's waiver.
--
-- A tablet becomes a kiosk when staff make a 6-digit code in Settings and type
-- it on the tablet. The tablet then holds a random token in a cookie; only its
-- sha256 is stored. Codes are stored as an HMAC, work for 10 minutes and once.
-- Leaving the kiosk on the tablet takes the club's staff PIN (scrypt hash).

create table kiosk_settings (
  tenant_id       uuid primary key default app_tenant_id() references tenants (id) on delete cascade,
  -- "scrypt$<N>$<r>$<p>$<salt b64url>$<hash b64url>". Null until staff set one.
  pin_hash        text check (pin_hash is null or (length(pin_hash) < 300 and pin_hash like 'scrypt$%')),
  pin_set_at      timestamptz,
  -- What the kiosk shows, checked by src/lib/kiosk/settings.ts.
  config          jsonb not null default '{}' check (jsonb_typeof(config) = 'object' and pg_column_size(config) < 20000),
  waiver_title    text not null default '' check (length(waiver_title) <= 120),
  waiver_body     text not null default '' check (length(waiver_body) <= 20000),
  -- Goes up every time the waiver's words change, so people sign the new one.
  waiver_version  int not null default 0 check (waiver_version >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger kiosk_settings_touch before update on kiosk_settings for each row execute function touch_updated_at();
select apply_tenant_policy('kiosk_settings');

create table kiosk_devices (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  name          text not null check (length(name) between 1 and 60),
  -- sha256 (hex) of the token in the tablet's cookie.
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  paired_by     text not null default '' check (length(paired_by) <= 120),
  paired_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  -- Wrong PINs in a row on this tablet, and when it can try again.
  pin_failures  int not null default 0 check (pin_failures >= 0),
  pin_locked_until timestamptz,
  -- Unpaired from Settings, or left with the PIN. Kept so history still says which tablet.
  revoked_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, id)
);
create index kiosk_devices_tenant on kiosk_devices (tenant_id, paired_at desc);
create trigger kiosk_devices_touch before update on kiosk_devices for each row execute function touch_updated_at();
select apply_tenant_policy('kiosk_devices');

create table kiosk_pair_codes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  -- HMAC (hex) of the 6 digits with the active SECRETS_KEYS key.
  code_hash   text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  -- What the tablet will be called, like "Front desk".
  name        text not null check (length(name) between 1 and 60),
  created_by  text not null default '' check (length(created_by) <= 120),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  device_id   uuid,
  created_at  timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, device_id) references kiosk_devices (tenant_id, id) on delete set null (device_id)
);
-- No two unused codes are the same across every club, so a code can only ever pair with one.
create unique index kiosk_pair_codes_live on kiosk_pair_codes (code_hash) where used_at is null;
select apply_tenant_policy('kiosk_pair_codes');

create table kiosk_check_ins (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  contact_id     uuid not null,
  device_id      uuid,
  checked_in_at  timestamptz not null default now(),
  foreign key (tenant_id, contact_id) references contacts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, device_id) references kiosk_devices (tenant_id, id) on delete set null (device_id)
);
create index kiosk_check_ins_recent on kiosk_check_ins (tenant_id, checked_in_at desc);
create index kiosk_check_ins_contact on kiosk_check_ins (tenant_id, contact_id, checked_in_at desc);
select apply_tenant_policy('kiosk_check_ins');

-- A signed waiver, with a copy of the exact words that were signed.
create table kiosk_waivers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  contact_id      uuid not null,
  device_id       uuid,
  waiver_version  int not null check (waiver_version > 0),
  title           text not null check (length(title) between 1 and 120),
  body            text not null check (length(body) between 1 and 20000),
  signed_name     text not null check (length(signed_name) between 2 and 120),
  -- The signature as an SVG path in a 600 by 200 box: moves and lines, whole numbers only.
  signature       text not null check (length(signature) between 8 and 30000 and signature ~ '^[ML0-9 ]+$'),
  signed_at       timestamptz not null default now(),
  foreign key (tenant_id, contact_id) references contacts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, device_id) references kiosk_devices (tenant_id, id) on delete set null (device_id)
);
create index kiosk_waivers_contact on kiosk_waivers (tenant_id, contact_id, signed_at desc);
create index kiosk_waivers_recent on kiosk_waivers (tenant_id, signed_at desc);
select apply_tenant_policy('kiosk_waivers');

-- A tablet's cookie to its club and tablet. Ids only, and only for a tablet
-- that's still paired at an active club.
create or replace function resolve_kiosk_device(p_token_hash text)
returns table (tenant_id uuid, device_id uuid)
language sql stable security definer set search_path = public, pg_temp
as $$
  select d.tenant_id, d.id from kiosk_devices d join tenants t on t.id = d.tenant_id
  where d.token_hash = p_token_hash and d.revoked_at is null and t.status = 'active'
$$;

-- A typed code to its club. Ids only, for a code that's unused and not expired.
create or replace function resolve_kiosk_code(p_code_hash text)
returns table (tenant_id uuid, code_id uuid)
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.tenant_id, c.id from kiosk_pair_codes c join tenants t on t.id = c.tenant_id
  where c.code_hash = p_code_hash and c.used_at is null and c.expires_at > now() and t.status = 'active'
$$;

-- Clears unused codes that ran out, at every club, so an old one can't hold a
-- number another club's new code needs. Returns nothing.
create or replace function clear_expired_kiosk_codes()
returns void
language sql volatile security definer set search_path = public, pg_temp
as $$
  delete from kiosk_pair_codes where used_at is null and expires_at < now()
$$;

revoke execute on function resolve_kiosk_device(text) from public;
revoke execute on function resolve_kiosk_code(text) from public;
revoke execute on function clear_expired_kiosk_codes() from public;

-- Check-ins and signed waivers are records: the app can add them but not change or delete them.
grant select, insert, update on kiosk_settings, kiosk_devices to bisonops_app;
grant select, insert, update, delete on kiosk_pair_codes to bisonops_app;
grant select, insert on kiosk_check_ins, kiosk_waivers to bisonops_app;
grant execute on function resolve_kiosk_device(text), resolve_kiosk_code(text), clear_expired_kiosk_codes() to bisonops_app;
