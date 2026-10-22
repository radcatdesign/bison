# Settings and environment variables

## Environment variables

Copy `.env.example` to `.env.local` for local work. Tests use `.env.test` (committed, local values only). On Vercel, set these per environment.

### Database

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | Yes | Runtime connection. Must use the `bisonops_app` role (the app refuses to run otherwise) with a password of 16 characters or more. On Neon, use the pooled connection string. |
| `DATABASE_MIGRATE_URL` | For migrations | Schema owner connection. Used by `pnpm db:migrate`, `db:setup` and `db:reset`. Never used by the running app. On Neon, the direct (unpooled) owner string. |
| `DATABASE_POOL_MAX` | No | Connections per server instance. Default 5. |

### Auth

| Variable | Required | What it does |
|---|---|---|
| `AUTH_PROVIDER` | No | `clerk` or `dev`. Defaults to `clerk` when `CLERK_SECRET_KEY` is set, otherwise `dev`. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | With Clerk | From the Clerk dashboard. |
| `CLERK_SECRET_KEY` | With Clerk | From the Clerk dashboard. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | With Clerk | Signing secret for the `/api/webhooks/clerk` endpoint. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | With Clerk | Set to `/sign-in`. |
| `DEV_AUTH_SECRET` | With dev sign-in | Signs the dev session cookie. 16 characters or more. |
| `ALLOW_DEV_AUTH` | No | `1` lets the dev sign-in run under `next start` on your own machine (tests). It never runs on any Vercel deployment, previews included, whatever this says. Never reuse the committed test secret anywhere real. |

### Billing (Bison Ops billing its tenants)

| Variable | Required | What it does |
|---|---|---|
| `BILLING_PROVIDER` | No | `stripe` or `fake`. Defaults to `stripe` when `STRIPE_SECRET_KEY` is set. `fake` turns items on without charging, so it fails closed: refused on Vercel production, and in other production builds unless `ALLOW_FAKE_BILLING=1`. |
| `ALLOW_FAKE_BILLING` | No | `1` allows test billing in a local production build (end-to-end tests) or a Vercel preview. |
| `STRIPE_SECRET_KEY` | With Stripe | Bison Ops' own Stripe account. |
| `STRIPE_WEBHOOK_SECRET` | With Stripe | Signing secret for `/api/webhooks/stripe`. Listen for `customer.subscription.created`, `.updated` and `.deleted`. |
| `STRIPE_PRICE_SALES`, `STRIPE_PRICE_MARKETING`, `STRIPE_PRICE_ASSISTANT` | With Stripe | Monthly price ids for the modules. |
| `STRIPE_PRICE_CALCULATOR`, `STRIPE_PRICE_CONFIGURATOR`, `STRIPE_PRICE_KNOWLEDGE_BASE`, `STRIPE_PRICE_GALLERY`, `STRIPE_PRICE_TRANSLATION`, `STRIPE_PRICE_PUSH`, `STRIPE_PRICE_CONTACT_SHARING` | With Stripe | Monthly price ids for the add-ons. An item without a price id says so on its Unlock page instead of failing. |

### Secrets at rest

| Variable | Required | What it does |
|---|---|---|
| `SECRETS_KEYS` | Yes | Comma-separated `version:base64key` pairs, 32 bytes each. Tenant API keys and tokens are encrypted with these. |
| `SECRETS_ACTIVE_KEY` | Yes | Which version encrypts new values. To rotate: add a key, make it active, re-encrypt stored values with `rotateSecret`, then remove the old key. |

### Jobs and app

| Variable | Required | What it does |
|---|---|---|
| `CRON_SECRET` | On Vercel | Vercel Cron sends it as a bearer token to `/api/cron/daily`. The job briefly locks the events table while it adds or drops a month, so it runs at 2:17 AM Pacific. |
| `APP_URL` | Yes | The dashboard's public URL, used in Stripe return links. |
| `PW_CHROMIUM_PATH` | No | Points Playwright at a Chromium other than its own download. |
| `E2E_PORT` | No | Port for the end-to-end test server. Default 3100. |

## Tenant settings (stored per tenant)

| Setting | Where | Default | Notes |
|---|---|---|---|
| Sample data | Settings, Data | On | Generated, never stored. Writes refuse while on. |
| Accent color | Settings, Look | `#7df9ff` | Recolors the one glow in the dashboard. |
| Time zone | `settings.timezone` | America/Los_Angeles | Day boundaries for charts. Editable in Phase 1. |
| Retention | `tenants.retention_days` | 400 days | Daily job removes older events. |
| Privacy rules | `settings.privacy` | Empty (defaults apply) | Filled in Phase 1 with the EU/UK and Global Privacy Control rules. |

## Product config (in code, no deploy needed to read, one deploy to change)

| File | What's in it |
|---|---|
| `src/config/catalog.ts` | Every plan, module and add-on: name, pitch, placeholder price, limits, trial length, Stripe price variable. |
| `src/config/features.ts` | Every gated feature and the items that grant it. |
| `src/config/roles.ts` | What each role sees and may do. |
| `src/config/modes.ts` | The three modes and their pages. |
| `src/config/releases.ts` | The Updates page. |
| `src/config/brand.ts` | Product name and default colors, for white-label later. |
| `src/lib/sample/industries.ts` | What sample data looks like per industry. |
