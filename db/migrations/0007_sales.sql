-- 0007_sales
-- Everything behind Sales: settings, the product catalog, carts, orders,
-- estimates and their history, discount codes and what used them, trade
-- accounts, and shared contact pages.
--
-- Same rules as every tenant table: tenant_id defaults to the transaction's
-- tenant, RLS with the one tenant_isolation policy, same-tenant foreign keys.
-- Money is in the smallest unit of the company's currency (cents), as integers.

-- ── Sales settings (one row per tenant) ─────────────────────────────────────
-- Each column is a JSON document checked by the app (src/lib/sales/settings.ts).

create table sales_settings (
  tenant_id  uuid primary key default app_tenant_id() references tenants (id) on delete cascade,
  store      jsonb not null default '{}' check (jsonb_typeof(store) = 'object' and pg_column_size(store) < 40000),
  shipping   jsonb not null default '{}' check (jsonb_typeof(shipping) = 'object' and pg_column_size(shipping) < 40000),
  trade      jsonb not null default '{}' check (jsonb_typeof(trade) = 'object' and pg_column_size(trade) < 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sales_settings_touch before update on sales_settings for each row execute function touch_updated_at();
select apply_tenant_policy('sales_settings');

-- Product photos are uploads too.
alter table files drop constraint files_kind_check;
alter table files add constraint files_kind_check check (kind in ('logo', 'email-image', 'product-image'));

-- ── Products ────────────────────────────────────────────────────────────────

create table products (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name        text not null check (length(name) between 1 and 160),
  description text not null default '' check (length(description) <= 20000),
  status      text not null default 'draft' check (status in ('active', 'draft', 'archived')),
  -- Up to three options, like [{"name": "Size", "values": ["25 lb", "50 lb"]}].
  options     jsonb not null default '[]' check (jsonb_typeof(options) = 'array' and pg_column_size(options) < 20000),
  -- [{"src": "/f/<id>" or "https://...", "alt": "..."}], up to 12.
  photos      jsonb not null default '[]' check (jsonb_typeof(photos) = 'array' and pg_column_size(photos) < 20000),
  category    text not null default '' check (length(category) <= 80),
  -- A Stripe tax code (txcd_...), or empty for the account's default.
  tax_code    text not null default '' check (tax_code ~ '^(txcd_[0-9]{8})?$'),
  seo         jsonb not null default '{}' check (jsonb_typeof(seo) = 'object' and pg_column_size(seo) < 4000),
  source      text not null default 'manual' check (source in ('manual', 'csv', 'shopify', 'feed')),
  source_id   text not null default '' check (length(source_id) <= 200),
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, id)
);
create index products_tenant_status on products (tenant_id, status, position, name);
create index products_source on products (tenant_id, source, source_id) where source_id <> '';
create trigger products_touch before update on products for each row execute function touch_updated_at();
select apply_tenant_policy('products');

-- Every product has at least one variant; a product without options has exactly one.
create table product_variants (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  product_id       uuid not null,
  -- The option values this variant stands for, like {"Size": "50 lb"}. Empty for the only variant.
  options          jsonb not null default '{}' check (jsonb_typeof(options) = 'object' and pg_column_size(options) < 2000),
  sku              text not null default '' check (length(sku) <= 64),
  price_cents      int not null check (price_cents between 0 and 100000000),
  -- The "was" price, shown struck through when it's higher than the price.
  compare_at_cents int check (compare_at_cents is null or compare_at_cents between 1 and 100000000),
  -- Shipping: weight in ounces, which box it ships in and how many fit, or its own box,
  -- or a flat charge per unit in place of a carrier rate.
  weight_oz        numeric(10, 2) not null default 0 check (weight_oz between 0 and 160000),
  box              text not null default '' check (box ~ '^[a-z0-9-]{0,40}$'),
  units_per_box    int not null default 1 check (units_per_box between 1 and 1000),
  ships_alone      boolean not null default false,
  flat_ship_cents  int check (flat_ship_cents is null or flat_ship_cents between 0 and 10000000),
  active           boolean not null default true,
  position         int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, product_id) references products (tenant_id, id) on delete cascade
);
create index product_variants_product on product_variants (tenant_id, product_id, position);
create unique index product_variants_sku on product_variants (tenant_id, lower(sku)) where sku <> '';
create trigger product_variants_touch before update on product_variants for each row execute function touch_updated_at();
select apply_tenant_policy('product_variants');

-- ── Trade accounts ──────────────────────────────────────────────────────────

create table trade_accounts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  company         text not null check (length(company) between 1 and 160),
  contact_name    text not null default '' check (length(contact_name) <= 120),
  email           text not null check (email = lower(email) and position('@' in email) > 1 and length(email) <= 254),
  phone           text not null default '' check (length(phone) <= 40),
  website         text not null default '' check (length(website) <= 200),
  -- Answers from the application: business type, resale number, expected volume, message.
  details         jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and pg_column_size(details) < 10000),
  status          text not null default 'applied' check (status in ('applied', 'approved', 'declined', 'paused')),
  -- A tier key from the trade settings that beats the volume-based tier. Empty uses volume.
  tier_override   text not null default '' check (tier_override ~ '^[a-z0-9-]{0,40}$'),
  note            text not null default '' check (length(note) <= 2000),
  contact_id      uuid,
  decided_at      timestamptz,
  decided_by      text not null default '',
  -- Bumped to sign the buyer out everywhere: their sign-in links and sessions carry it.
  session_version int not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, email),
  unique (tenant_id, id),
  foreign key (tenant_id, contact_id) references contacts (tenant_id, id) on delete set null (contact_id)
);
create index trade_accounts_tenant_status on trade_accounts (tenant_id, status, created_at desc);
create trigger trade_accounts_touch before update on trade_accounts for each row execute function touch_updated_at();
select apply_tenant_policy('trade_accounts');

-- ── Discount codes ──────────────────────────────────────────────────────────
-- Private codes checked by Bison Ops, never public Stripe promotion codes.

create table discounts (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  code             text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{2,39}$'),
  percent_off      numeric(5, 2) check (percent_off is null or (percent_off > 0 and percent_off <= 100)),
  amount_off_cents int check (amount_off_cents is null or amount_off_cents between 1 and 100000000),
  -- unlimited: anyone, any number of times. single_use: once, then it's done.
  -- per_account: once for each buyer (by email, or trade account).
  usage            text not null default 'unlimited' check (usage in ('unlimited', 'single_use', 'per_account')),
  -- Only this trade account can use it, when set.
  trade_account_id uuid,
  max_uses         int check (max_uses is null or max_uses between 1 and 1000000),
  min_order_cents  int check (min_order_cents is null or min_order_cents between 1 and 100000000),
  starts_at        timestamptz,
  expires_at       timestamptz,
  note             text not null default '' check (length(note) <= 500),
  active           boolean not null default true,
  created_by       text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, id),
  check ((percent_off is null) <> (amount_off_cents is null)),
  check (expires_at is null or starts_at is null or expires_at > starts_at),
  foreign key (tenant_id, trade_account_id) references trade_accounts (tenant_id, id) on delete cascade
);
create trigger discounts_touch before update on discounts for each row execute function touch_updated_at();
select apply_tenant_policy('discounts');

-- ── Carts ───────────────────────────────────────────────────────────────────
-- The cart id is random and is the only thing the shopper's browser holds.

create table carts (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  status              text not null default 'open' check (status in ('open', 'checkout', 'ordered', 'abandoned', 'inquiry')),
  -- [{"variantId": "...", "qty": 2}]
  items               jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and pg_column_size(items) < 40000),
  email               text check (email is null or (email = lower(email) and position('@' in email) > 1 and length(email) <= 254)),
  name                text not null default '' check (length(name) <= 120),
  contact_id          uuid,
  trade_account_id    uuid,
  discount_code       text not null default '' check (length(discount_code) <= 40),
  -- The last priced view of the cart, so an abandoned cart reads right after prices change.
  priced              jsonb not null default '{}' check (jsonb_typeof(priced) = 'object' and pg_column_size(priced) < 60000),
  checkout_session_id text unique,
  last_active_at      timestamptz not null default now(),
  abandoned_at        timestamptz,
  order_id            uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, contact_id) references contacts (tenant_id, id) on delete set null (contact_id),
  foreign key (tenant_id, trade_account_id) references trade_accounts (tenant_id, id) on delete set null (trade_account_id)
);
create index carts_tenant_status on carts (tenant_id, status, last_active_at desc);
create index carts_email on carts (tenant_id, email) where email is not null;
create index carts_waiting on carts (last_active_at) where status in ('open', 'checkout') and email is not null;
create trigger carts_touch before update on carts for each row execute function touch_updated_at();
select apply_tenant_policy('carts');

-- ── Estimates ───────────────────────────────────────────────────────────────

create table estimates (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  number             int not null check (number > 0),
  status             text not null default 'draft' check (status in ('draft', 'sent', 'viewed', 'changes_requested', 'approved', 'declined', 'invoiced', 'paid', 'void')),
  source             text not null default 'team' check (source in ('team', 'inquiry')),
  title              text not null default '' check (length(title) <= 160),
  -- name, email, company, phone, address {line1, line2, city, state, postal, country}
  client             jsonb not null default '{}' check (jsonb_typeof(client) = 'object' and pg_column_size(client) < 4000),
  contact_id         uuid,
  trade_account_id   uuid,
  -- [{"id", "productId", "variantId", "name", "detail", "qty", "unitCents"}]
  items              jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and pg_column_size(items) < 100000),
  -- {"kind": "percent" | "amount", "value": n} or {}
  discount           jsonb not null default '{}' check (jsonb_typeof(discount) = 'object'),
  shipping_cents     int not null default 0 check (shipping_cents between 0 and 100000000),
  subtotal_cents     int not null default 0 check (subtotal_cents between 0 and 1000000000),
  discount_cents     int not null default 0 check (discount_cents between 0 and 1000000000),
  total_cents        int not null default 0 check (total_cents between 0 and 1000000000),
  currency           text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  notes              text not null default '' check (length(notes) <= 5000),
  internal_note      text not null default '' check (length(internal_note) <= 5000),
  valid_until        date,
  -- Bumped to retire every link sent so far (when it's voided, or sent again on purpose).
  link_version       int not null default 1,
  sent_at            timestamptz,
  viewed_at          timestamptz,
  responded_at       timestamptz,
  approved_name      text not null default '' check (length(approved_name) <= 120),
  change_request     text not null default '' check (length(change_request) <= 5000),
  -- Who it went to and when, the provider's id, or the exact error.
  delivery           jsonb not null default '{}' check (jsonb_typeof(delivery) = 'object'),
  stripe_customer_id text,
  stripe_invoice_id  text unique,
  invoice_url        text,
  invoiced_at        timestamptz,
  paid_at            timestamptz,
  order_id           uuid,
  created_by         text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, number),
  unique (tenant_id, id),
  foreign key (tenant_id, contact_id) references contacts (tenant_id, id) on delete set null (contact_id),
  foreign key (tenant_id, trade_account_id) references trade_accounts (tenant_id, id) on delete set null (trade_account_id)
);
create index estimates_tenant_status on estimates (tenant_id, status, updated_at desc);
create index estimates_contact on estimates (tenant_id, contact_id);
-- Only drafts can be deleted. Anything a client has seen is voided instead.
create or replace function estimates_delete_draft_only() returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' then
    raise exception 'Only draft estimates can be deleted. Void it instead.' using errcode = 'check_violation';
  end if;
  return old;
end $$;
create trigger estimates_delete_draft_only before delete on estimates for each row execute function estimates_delete_draft_only();
create trigger estimates_touch before update on estimates for each row execute function touch_updated_at();
select apply_tenant_policy('estimates');

create table estimate_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  estimate_id uuid not null,
  kind        text not null check (kind in ('created', 'edited', 'sent', 'email_failed', 'viewed', 'changes_requested', 'approved', 'declined', 'invoiced', 'invoice_failed', 'paid', 'void', 'reopened')),
  actor       text not null default '' check (length(actor) <= 120),
  detail      text not null default '' check (length(detail) <= 5000),
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, estimate_id) references estimates (tenant_id, id) on delete cascade
);
create index estimate_events_estimate on estimate_events (tenant_id, estimate_id, created_at);
select apply_tenant_policy('estimate_events');

-- ── Orders ──────────────────────────────────────────────────────────────────

create table orders (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  number                     int not null check (number > 0),
  source                     text not null check (source in ('checkout', 'estimate', 'free')),
  status                     text not null default 'paid' check (status in ('paid', 'partially_refunded', 'refunded', 'canceled')),
  fulfillment                text not null default 'none' check (fulfillment in ('none', 'pending', 'sent', 'failed', 'shipped')),
  email                      text not null check (email = lower(email) and position('@' in email) > 1 and length(email) <= 254),
  name                       text not null default '' check (length(name) <= 120),
  phone                      text not null default '' check (length(phone) <= 40),
  -- name, line1, line2, city, state, postal, country
  ship_to                    jsonb not null default '{}' check (jsonb_typeof(ship_to) = 'object' and pg_column_size(ship_to) < 4000),
  -- What was bought, as it was priced: [{"productId", "variantId", "name", "options", "sku", "qty", "unitCents", "lineCents"}]
  items                      jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and pg_column_size(items) < 100000),
  subtotal_cents             int not null default 0 check (subtotal_cents >= 0),
  discount_cents             int not null default 0 check (discount_cents >= 0),
  shipping_cents             int not null default 0 check (shipping_cents >= 0),
  tax_cents                  int not null default 0 check (tax_cents >= 0),
  total_cents                int not null default 0 check (total_cents >= 0),
  refunded_cents             int not null default 0 check (refunded_cents >= 0),
  currency                   text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  discount_code              text not null default '' check (length(discount_code) <= 40),
  shipping_service           text not null default '' check (length(shipping_service) <= 120),
  cart_id                    uuid,
  estimate_id                uuid,
  contact_id                 uuid,
  trade_account_id           uuid,
  stripe_account_id          text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text,
  stripe_invoice_id          text unique,
  -- Team alert: who it went to and when, the provider's id, or the exact error.
  alert                      jsonb not null default '{}' check (jsonb_typeof(alert) = 'object'),
  -- Fulfillment: provider, its id, attempts, last error, tracking.
  fulfillment_detail         jsonb not null default '{}' check (jsonb_typeof(fulfillment_detail) = 'object'),
  note                       text not null default '' check (length(note) <= 2000),
  paid_at                    timestamptz not null default now(),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (tenant_id, number),
  unique (tenant_id, id),
  check (refunded_cents <= total_cents),
  foreign key (tenant_id, cart_id) references carts (tenant_id, id) on delete set null (cart_id),
  foreign key (tenant_id, estimate_id) references estimates (tenant_id, id) on delete set null (estimate_id),
  foreign key (tenant_id, contact_id) references contacts (tenant_id, id) on delete set null (contact_id),
  foreign key (tenant_id, trade_account_id) references trade_accounts (tenant_id, id) on delete set null (trade_account_id)
);
create index orders_tenant_recent on orders (tenant_id, paid_at desc);
create index orders_email on orders (tenant_id, email);
create index orders_trade on orders (tenant_id, trade_account_id, paid_at) where trade_account_id is not null;
create index orders_fulfillment on orders (updated_at) where fulfillment in ('pending', 'failed');
create trigger orders_touch before update on orders for each row execute function touch_updated_at();
select apply_tenant_policy('orders');

alter table carts add foreign key (tenant_id, order_id) references orders (tenant_id, id) on delete set null (order_id);
alter table estimates add foreign key (tenant_id, order_id) references orders (tenant_id, id) on delete set null (order_id);

-- Welcome offer codes (Marketing) are spent at checkout too.
alter table offer_codes add unique (tenant_id, id);

-- Every use of a code. A checkout holds its use until it's paid or expires, so
-- a single-use code can't be spent twice by two people checking out at once.
create table discount_redemptions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  discount_id      uuid,
  -- Welcome offer codes from Marketing are checked here too.
  offer_code_id    uuid,
  code             text not null check (length(code) between 1 and 40),
  status           text not null default 'reserved' check (status in ('reserved', 'used', 'released')),
  reserved_until   timestamptz,
  email            text,
  trade_account_id uuid,
  cart_id          uuid,
  order_id         uuid,
  amount_cents     int not null default 0 check (amount_cents >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((discount_id is null) <> (offer_code_id is null)),
  foreign key (tenant_id, discount_id) references discounts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, offer_code_id) references offer_codes (tenant_id, id) on delete cascade,
  foreign key (tenant_id, cart_id) references carts (tenant_id, id) on delete set null (cart_id),
  foreign key (tenant_id, order_id) references orders (tenant_id, id) on delete set null (order_id)
);
create index discount_redemptions_discount on discount_redemptions (tenant_id, discount_id, status);
create index discount_redemptions_offer on discount_redemptions (tenant_id, offer_code_id, status);
-- One hold per cart and code.
create unique index discount_redemptions_cart on discount_redemptions (tenant_id, cart_id, code) where cart_id is not null and status = 'reserved';
create trigger discount_redemptions_touch before update on discount_redemptions for each row execute function touch_updated_at();
select apply_tenant_policy('discount_redemptions');

-- ── Shared contact pages ────────────────────────────────────────────────────

create table contact_shares (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default app_tenant_id() references tenants (id) on delete cascade,
  contact_id uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, contact_id) references contacts (tenant_id, id) on delete cascade
);
create index contact_shares_contact on contact_shares (tenant_id, contact_id, created_at desc);
create trigger contact_shares_touch before update on contact_shares for each row execute function touch_updated_at();
select apply_tenant_policy('contact_shares');

-- ── Narrow lookups for requests that arrive without a tenant ────────────────

-- Shop pages, carts, checkout and trade pages: active companies with Sales right now.
create or replace function resolve_sales_tenant(p_tenant_slug text) returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select t.id from tenants t
  where t.slug = p_tenant_slug and t.status = 'active'
    and exists (
      select 1 from entitlements e
      where e.tenant_id = t.id and e.item_key = 'module:sales'
        and e.status in ('active', 'past_due')
        and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())
    )
$$;

-- The search files (sitemap, llms.txt) cover pages (Marketing) and products (Sales).
create or replace function resolve_public_tenant(p_tenant_slug text)
returns table (tenant_id uuid, marketing boolean, sales boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select t.id,
    exists (select 1 from entitlements e where e.tenant_id = t.id and e.item_key = 'module:marketing' and e.status in ('active', 'past_due') and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now())),
    exists (select 1 from entitlements e where e.tenant_id = t.id and e.item_key = 'module:sales' and e.status in ('active', 'past_due') and e.starts_at <= now() and (e.ends_at is null or e.ends_at > now()))
  from tenants t
  where t.slug = p_tenant_slug and t.status = 'active'
$$;

-- Stripe Connect events name the connected account. This finds whose it is.
create or replace function resolve_tenant_by_connect_account(p_account_id text) returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select i.tenant_id from integrations i join tenants t on t.id = i.tenant_id
  where i.provider = 'stripe' and i.public_config ->> 'accountId' = p_account_id and t.status = 'active'
  limit 1
$$;
create index integrations_connect_account on integrations ((public_config ->> 'accountId')) where provider = 'stripe';

-- The client's estimate page. The link's signature is checked before this runs.
create or replace function resolve_estimate(p_estimate_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select e.tenant_id from estimates e join tenants t on t.id = e.tenant_id
  where e.id = p_estimate_id and t.status = 'active' and e.status <> 'draft'
$$;

-- A shared contact page, while it's on and in date. The signature is checked first.
create or replace function resolve_contact_share(p_share_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select s.tenant_id from contact_shares s join tenants t on t.id = s.tenant_id
  where s.id = p_share_id and t.status = 'active' and s.revoked_at is null and s.expires_at > now()
$$;

-- The sales job: companies with carts that have gone quiet, holds to let go,
-- or orders waiting to go to fulfillment. Ids only.
create or replace function due_sales_tenants(p_quiet_before timestamptz, p_limit int default 200)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct t.id from tenants t
  where t.status = 'active' and (
    exists (select 1 from carts c where c.tenant_id = t.id and c.status in ('open', 'checkout') and c.email is not null and c.last_active_at < p_quiet_before)
    or exists (select 1 from discount_redemptions r where r.tenant_id = t.id and r.status = 'reserved' and r.reserved_until < now())
    or exists (select 1 from orders o where o.tenant_id = t.id and o.fulfillment in ('pending', 'failed') and coalesce((o.fulfillment_detail ->> 'attempts')::int, 0) < 5)
  )
  limit p_limit
$$;

revoke execute on function resolve_sales_tenant(text) from public;
revoke execute on function resolve_public_tenant(text) from public;
revoke execute on function resolve_tenant_by_connect_account(text) from public;
revoke execute on function resolve_estimate(uuid) from public;
revoke execute on function resolve_contact_share(uuid) from public;
revoke execute on function due_sales_tenants(timestamptz, int) from public;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Orders, estimate history and code uses are records: the app can't delete them.

grant select, insert, update on sales_settings to bisonops_app;
grant select, insert, update, delete on products, product_variants, discounts, trade_accounts to bisonops_app;
grant select, insert, update on carts, orders, discount_redemptions, contact_shares to bisonops_app;
grant select, insert, update, delete on estimates to bisonops_app;
grant select, insert on estimate_events to bisonops_app;
grant execute on function
  resolve_sales_tenant(text), resolve_public_tenant(text), resolve_tenant_by_connect_account(text),
  resolve_estimate(uuid), resolve_contact_share(uuid), due_sales_tenants(timestamptz, int)
to bisonops_app;
