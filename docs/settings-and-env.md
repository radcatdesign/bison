# Settings and environment variables

## Environment variables

Copy `.env.example` to `.env.local` for local work. Tests use `.env.test` (committed, local values only). On Vercel, set these per environment.

### Database

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | Yes | Runtime connection. Must use the `bisonops_app` role (the app refuses to run otherwise) with a password of 16 characters or more. On Neon, use the pooled connection string. |
| `DATABASE_MIGRATE_URL` | For migrations | Schema owner connection. Used by `pnpm db:migrate`, `db:setup` and `db:reset`. Never used by the running app. On Neon, the direct (unpooled) owner string. |
| `DATABASE_POOL_MAX` | No | Connections per server instance. Default 5. |

### Demo

| Variable | Required | What it does |
|---|---|---|
| `DEMO_MODE` | For a demo deploy | `1` runs the public demo: two made-up companies, four made-up people, sample data everywhere, nothing saved on the server. Owners can still unlock modules with a trial or subscription; that's kept in the visitor's browser (`bo_demo_unlocks` cookie). It only turns on when `DATABASE_URL` is **not** set, so it can't be switched on in a deployment that holds real data. No other variables are needed. |

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
| `ALLOW_FAKE_BILLING` | No | `1` allows test billing in a local production build (end-to-end tests) or a Vercel preview, and the payments and shipping stand-ins in a local production build (never on Vercel). |
| `STRIPE_SECRET_KEY` | With Stripe | Bison Ops' own Stripe account. |
| `STRIPE_WEBHOOK_SECRET` | With Stripe | Signing secret for `/api/webhooks/stripe`. Listen for `customer.subscription.created`, `.updated` and `.deleted`. |
| `STRIPE_PRICE_SALES`, `STRIPE_PRICE_MARKETING`, `STRIPE_PRICE_ASSISTANT` | With Stripe | Monthly price ids for the modules. |
| `STRIPE_PRICE_CALCULATOR`, `STRIPE_PRICE_CONFIGURATOR`, `STRIPE_PRICE_KNOWLEDGE_BASE`, `STRIPE_PRICE_GALLERY`, `STRIPE_PRICE_TRANSLATION`, `STRIPE_PRICE_PUSH`, `STRIPE_PRICE_CONTACT_SHARING` | With Stripe | Monthly price ids for the add-ons. An item without a price id says so on its Unlock page instead of failing. |

### Secrets at rest

| Variable | Required | What it does |
|---|---|---|
| `SECRETS_KEYS` | Yes | Comma-separated `version:base64key` pairs, 32 bytes each. Tenant API keys and tokens are encrypted with these. |
| `SECRETS_ACTIVE_KEY` | Yes | Which version encrypts new values and signs landing page form tokens. To rotate: add a key, make it active, re-encrypt stored values with `rotateSecret`, then remove the old key. |

### Page agent

| Variable | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | For the Claude agent | Marketing > Pages builds with Claude when set. Without it, an offline helper answers that builds from a brief and follows short, direct changes. For the public demo, use a key from its own workspace with a monthly spend limit; that limit is the real cap. The demo also slows each visitor to 20 requests an hour and 300 a day overall, counted per server instance, so it's a speed bump rather than a guarantee. |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-sonnet-5-5`. |
| `PAGE_AGENT` | No | `stand-in` forces the offline helper even when a key is set. Tests use it so they never call Claude. |

### Email (Marketing)

| Variable | Required | What it does |
|---|---|---|
| `RESEND_API_KEY` | To send email | One Resend account sends for every company, each From its own verified domain. Without it, nothing sends: Marketing still builds and saves, and sending screens say email isn't set up yet. |
| `RESEND_WEBHOOK_SECRET` | With Resend | The signing secret (`whsec_...`) of the Resend webhook pointed at `/api/webhooks/resend`. Turn on `email.delivered`, `email.bounced`, `email.complained` and `email.suppressed`. Bounces and complaints go on the do-not-email list from these. |
| `EMAIL_FALLBACK_FROM` | No | A From address on a domain verified in Bison Ops' own Resend account, like `Bison Ops <test@mail.bisonops.com>`. Lets companies send themselves a test before their own domain is verified. Only tests ever use it. |
| `EMAIL_PROVIDER` | No | `stand-in` keeps every email in memory and shows it at `/api/dev/outbox` (tests and local work). Refused on Vercel production, so real email can never quietly go nowhere. |

Unsubscribe links are signed with `SECRETS_KEYS`. Keep old key versions in the list after rotating, or unsubscribe links in emails already sent stop working.

### Sales (each company's own Stripe account and carriers)

| Variable | Required | What it does |
|---|---|---|
| `STRIPE_SECRET_KEY` | For Sales payments | The same Bison Ops Stripe key, with Connect turned on. Companies' accounts are made and used through it; their money never touches the Bison Ops balance. Without it, Sales still builds and saves, and checkout and invoices say payments aren't switched on yet. |
| `STRIPE_PUBLISHABLE_KEY` | For Sales payments | Bison Ops' publishable key. The shop's checkout page loads Stripe's payment form with it, on the company's own account. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | For Sales payments | Signing secret of a Connect webhook (events on connected accounts) at `/api/webhooks/stripe-connect`. Turn on `account.updated`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `invoice.paid` and `charge.refunded`. |
| `PAYMENTS_PROVIDER` | No | `stand-in` plays Stripe in memory for tests and local work, with pages at `/api/dev/payments` for onboarding, paying a checkout and paying an invoice. It fails closed: never on any Vercel deployment, and in other production builds only with `ALLOW_FAKE_BILLING=1`. |
| `SHIPPING_PROVIDER` | No | `stand-in` answers for ShipStation and UPS (rates and orders) in tests and local work, under the same rule. Real carrier keys are each company's own, entered in Settings, Shipping, and encrypted. |

Estimate links, trade sign-in links and shared contact links are signed with `SECRETS_KEYS`, like unsubscribe links.

### Jobs and app

| Variable | Required | What it does |
|---|---|---|
| `CRON_SECRET` | On Vercel | Vercel Cron sends it as a bearer token to `/api/cron/daily` and `/api/cron/email`. The daily job briefly locks the events table while it adds or drops a month, so it runs at 2:17 AM Pacific; it runs the email job too, as a backstop. `/api/cron/email` sends scheduled newsletters and series emails, and runs the sales job (left-behind carts, code holds, ShipStation retries); it should run every 5 minutes: on Vercel Pro add it to `vercel.json`, on the free plan point an outside scheduler at it with the same bearer token. |
| `APP_URL` | Yes | The dashboard's public URL, used in Stripe return links and in published page addresses (`/p/<company>/<page>`). |
| `PW_CHROMIUM_PATH` | No | Points Playwright at a Chromium other than its own download. |
| `E2E_PORT` | No | Port for the end-to-end test server. Default 3100. |

## Tenant settings (stored per tenant)

| Setting | Where | Default | Notes |
|---|---|---|---|
| Sample data | Settings, Data | On | Generated, never stored. Writes refuse while on. |
| Accent color | Settings, Appearance | `#3b5bff` | Recolors buttons, the active page, charts and highlights for the whole team. |
| Light or dark | Sidebar (phone: Menu) | Match my device | Per person, saved in their browser. |
| Time zone | `settings.timezone` | America/Los_Angeles | Day boundaries for charts. Editable in Phase 1. |
| Retention | `tenants.retention_days` | 400 days | Daily job removes older events. |
| Privacy rules | `settings.privacy` | Empty (defaults apply) | Filled in Phase 1 with the EU/UK and Global Privacy Control rules. |
| Email sending | Settings, Email sending | None | The company's own sending domain (a subdomain is suggested), its From name and address, and Reply-To. Owners and admins. Stored in the `integrations` row for `resend` (nothing secret: the Resend key is Bison Ops' own). Reply-To and From name are in the brand kit. |
| Brand kit | Marketing, Brand kit | Accent color, Arial | Logo, colors, email fonts, button shape, footer address and social links. Every email and new page uses it. The address is required before anything sends. |
| Subscriber types | Marketing, Subscribers | Three per industry | The "I am a..." question and its choices on signup forms. |
| Welcome offer | Marketing, Welcome offer | Off | Percent or amount off, days it lasts, code prefix and fine print. Codes go out in the welcome email. |
| Search pack | Marketing, Search pack | Built from business details | Business summary, services, areas served, contact details, and whether AI crawlers may read the pages. |
| Setup progress | Worked out on each visit | Nothing done | Every step ticks off from what's saved or verified. The one exception, submitting the sitemap to Google and Bing, is a "Mark as done" saved in `marketing_settings.search`. |
| Payments | Settings, Payments | Not connected | The company's own Stripe account through Connect. Owners and admins connect it; only an owner can disconnect. The account id is in the `integrations` row for `stripe`. |
| Shipping | Settings, Shipping | Flat, free | Ship-from address, boxes (three to start), rates from a carrier, flat or free, handling, free over an amount, and ShipStation for fulfillment. Carrier keys are encrypted and can't be read back. Stored in `sales_settings.shipping` and `integrations`. |
| Store and checkout | Sales, Checkout | USD, shop on | Currency, whether the shop list shows, who gets order emails (owners and admins until set), countries, phone, Stripe Tax, a note under Pay, the order limit that turns checkout into a quote request, estimate terms and how long they're good, and when a cart counts as left behind (4 hours). Stored in `sales_settings.store`. |
| Trade program | Sales, Trade accounts | Open, three tiers | Whether new applications are taken, a few lines for the application page, and tiers by 12-month spend (Trade 10%, Pro 15% from $5,000, Partner 20% from $20,000). Stored in `sales_settings.trade`. |

## Product config (in code, no deploy needed to read, one deploy to change)

| File | What's in it |
|---|---|
| `src/config/catalog.ts` | Every plan, module and add-on: name, pitch, placeholder price, limits, trial length, Stripe price variable. |
| `src/config/features.ts` | Every gated feature and the items that grant it. |
| `src/config/roles.ts` | What each role sees and may do. |
| `src/config/modes.ts` | The three modes and their pages. |
| `src/config/releases.ts` | The Updates page. |
| `src/lib/marketing/setup-steps.ts` | Every Marketing setup step, its words and what marks it done. |
| `src/lib/sales/setup-steps.ts` | Every Sales setup step, its words and what marks it done. |
| `src/lib/email/templates.ts` | Newsletter and series templates. |
| `src/config/brand.ts` | Product name and default colors, for white-label later. |
| `src/lib/sample/industries.ts` | What sample data looks like per industry. |
