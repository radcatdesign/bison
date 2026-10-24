-- 0012_kiosk_pair_attempts
-- Wrong pairing codes, counted in the database so the limit holds across every
-- server: 10 per address and 300 overall in any 10 minutes. Addresses are
-- stored as an HMAC, never as typed, and rows are gone after an hour.
-- A system table: no club's data, and the app role can't read or write it
-- except through the two functions below.

create table kiosk_pair_attempts (
  at       timestamptz not null default now(),
  address  text not null check (address ~ '^[0-9a-f]{64}$')
);
create index kiosk_pair_attempts_at on kiosk_pair_attempts (at);
create index kiosk_pair_attempts_address on kiosk_pair_attempts (address, at);

create or replace function kiosk_pair_allowed(p_address text)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
begin
  delete from kiosk_pair_attempts where at < now() - interval '1 hour';
  return (select count(*) from kiosk_pair_attempts where address = p_address and at > now() - interval '10 minutes') < 10
     and (select count(*) from kiosk_pair_attempts where at > now() - interval '10 minutes') < 300;
end $$;

create or replace function kiosk_pair_failed(p_address text)
returns void
language sql volatile security definer set search_path = public, pg_temp
as $$
  insert into kiosk_pair_attempts (address) values (p_address)
$$;

revoke all on kiosk_pair_attempts from public;
revoke execute on function kiosk_pair_allowed(text) from public;
revoke execute on function kiosk_pair_failed(text) from public;
grant execute on function kiosk_pair_allowed(text), kiosk_pair_failed(text) to bisonops_app;
