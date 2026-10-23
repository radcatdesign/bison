# Bison Ops

A multi-tenant platform from Bison (by RADCAT) that plugs into any company's website: analytics, a contacts inbox, and paid modules for sales, marketing and an AI assistant.

**Status:** Phase 0 (foundation) is built and tested. See `docs/architecture.md` for how it fits together and `docs/decisions.md` for open questions.

## Run it locally

You need Node 22+, pnpm and Postgres 16+.

```bash
pnpm install
cp .env.example .env.local          # fill in the two database URLs and a SECRETS_KEYS value

# Once per database, as a Postgres superuser: an owner role that can create roles.
psql -c "create role bisonops_owner login password 'owner' createrole"
psql -c "create database bisonops owner bisonops_owner"
psql -c "create database bisonops_test owner bisonops_owner"

pnpm db:setup        # creates the bisonops_app role from DATABASE_URL
pnpm db:reset        # migrates and seeds two test companies
pnpm dev
```

`DATABASE_URL` needs a bisonops_app password of 16 characters or more. Open http://localhost:3000 and pick a person on the sign-in page. Ada and Cora are owners at two different companies, Ben is in Sales, Dana is a Viewer.

## Tests

```bash
NODE_ENV=test pnpm db:setup         # once, for the test database
pnpm test                           # unit and database tests (wipes bisonops_test)
pnpm exec playwright install chromium
pnpm test:e2e                       # builds, starts and tests at 390 px and 1440 px
pnpm check                          # all of the above plus typecheck and lint
```

Database tests connect as the real app role, so they test row-level security itself. The end-to-end tests use the dev sign-in and test billing, so they never touch Clerk or Stripe.

## Demo deploy (no database)

Set one environment variable on the Vercel project, `DEMO_MODE=1`, and leave `DATABASE_URL` unset. The site shows two made-up companies with sample data, a picker to sign in as any of four made-up people, and saves nothing on the server. Owners can unlock Marketing, Sales and add-ons with a trial or subscription to see them open up, and build landing pages in Marketing > Pages; both stay in their own browser. Add `ANTHROPIC_API_KEY` (with a spend limit) to let the demo's page agent use Claude. `pnpm test:e2e:demo` tests it.

## Deploy (Vercel + Neon)

1. Create a Neon project. Use the owner connection string as `DATABASE_MIGRATE_URL`.
2. Pick a password for the app role and set `DATABASE_URL` to the **pooled** string with user `bisonops_app`. Run `pnpm db:setup`, then `pnpm db:migrate`, then `pnpm db:check`. Create the app role with the script, not in the Neon console.
3. In Clerk, turn on Organizations. Set the Clerk keys, and add a webhook to `/api/webhooks/clerk` for `organizationMembership.created` and `.deleted`.
4. In Stripe, create a monthly price for each module and add-on, set the `STRIPE_PRICE_*` variables, and add a webhook to `/api/webhooks/stripe` for `customer.subscription.created`, `.updated` and `.deleted`.
5. Set `SECRETS_KEYS`, `SECRETS_ACTIVE_KEY`, `CRON_SECRET` and `APP_URL`. Every variable is explained in `docs/settings-and-env.md`.
6. For the page agent in Marketing > Pages, set `ANTHROPIC_API_KEY`. Without it, an offline helper answers instead.

## Where things are

```
db/migrations/        SQL migrations (tables, RLS policies, system functions)
scripts/              db setup, migrate, reset, seed, check
src/config/           catalog and prices, features, roles, modes, releases, brand
src/lib/db/           connection, withTenant(), row types
src/lib/access/       can(tenant, feature)
src/lib/billing/      trials, subscriptions, Stripe webhook sync
src/lib/repo/         what screens read: database and sample versions
src/lib/sample/       sample data generator
src/app/(portal)/     the dashboard
src/proxy.ts          sign-in gate (Next 16's name for middleware)
tests/unit|db|e2e     tests
docs/                 architecture, decisions, modules, settings, tenant guide
```
