-- A connected Stripe account belongs to one company. The webhook finds the
-- company from the account id, so make that one-to-one in the database too.
drop index if exists integrations_connect_account;
create unique index integrations_connect_account on integrations ((public_config ->> 'accountId'))
  where provider = 'stripe' and public_config ->> 'accountId' is not null;
