# Bison Ops architecture

Status: Phase 0 (foundation), Sales (Phase 2) and Marketing (Phase 3) built, in two editions (Bison Ops and Fit Funnels). This document covers the whole platform so later phases fit the same frame. Sections marked **Planned** are designed but not built yet.

## The shape of it

```
 Tenant's website                         Bison Ops (Vercel)                         Outside services
 ────────────────                         ─────────────────                          ────────────────
 <script bo.js>  ── collect, forms ──▶   Public API  /v1/*   ─┐
   widgets (lazy)  ◀── site config ───                         │
                                                              ├──▶ Postgres (Neon), RLS per tenant
 Tenant's team   ── browser / PWA ──▶    Portal (Next.js)    ─┤
                                         App API, actions     │
                                                              ├──▶ Stripe Billing (Bison Ops bills tenants)
 Stripe, Resend, ── signed webhooks ──▶  /api/webhooks/*     ─┤    Stripe Connect (tenant's own checkout)
 Clerk, shipping                                              │    Resend, Anthropic, ShipStation, UPS
                                         Cron + queue table  ─┘
```

One Next.js app serves the portal, the tenant-facing API and the webhooks. The SDK is a separate, framework-free bundle served from a CDN path. One Postgres database holds every tenant, isolated by row-level security.

## Stack (as built)

| Piece | Choice | Notes |
|---|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript | Cache Components on. Every session read sits behind a `<Suspense>` boundary, so the static frame paints first. |
| Request gate | `src/proxy.ts` (Next 16 renamed middleware to proxy) | Only checks "signed in at all". Real checks happen in the data access layer. |
| Database | Postgres 16 (Neon in production, local Postgres for dev and tests) | Plain SQL migrations in `db/migrations`, run by `pnpm db:migrate`. |
| Query layer | Kysely over `pg` | Typed queries, no codegen. Tables and policies stay in hand-written SQL so RLS is easy to review. |
| Auth | Clerk with Organizations, plus a dev stand-in | `AUTH_PROVIDER=clerk` in production. `dev` gives a seeded people picker for local work and tests. |
| Billing | Stripe Billing behind a `BillingProvider` interface | `fake` provider grants items directly so the whole unlock flow works without Stripe keys. |
| Secrets | AES-256-GCM, versioned keys | `src/lib/crypto/secrets.ts`. Key rotation by version prefix. |
| Styling | Plain CSS with design tokens (`src/app/tokens.css`) | No Tailwind. Brand values live in custom properties so white-label is a token swap. |
| Tests | Vitest (unit + database) and Playwright (390 px and 1440 px) | Database tests run as the real app role, so RLS is what's tested. |

## Tenancy and isolation

**One database, one schema, `tenant_id` on every row.** The guarantee comes from Postgres, not app code.

1. **Two roles.** `bisonops_owner` owns the schema and runs migrations. `bisonops_app` is what the app connects as at runtime. The app role is not a superuser, has no `BYPASSRLS`, belongs to no other role, and does not own any table. A test fails the build if any of that changes, and the app itself refuses to run tenant queries on its first connection if `DATABASE_URL` uses any other role.
2. **RLS on every table.** Each tenant table has one policy, `tenant_isolation`, for the app role: `USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())`. The `tenants` table uses `id` instead of `tenant_id`.
3. **Tenant context per transaction.** `app_tenant_id()` reads `app.tenant_id`, set with `set_config(..., true)` inside a transaction. All app queries go through `withTenant(ctx, fn)`, which opens a transaction, sets the tenant and the acting user, runs `fn`, and commits. Transaction-local settings are safe with Neon's pooled (PgBouncer transaction mode) connections. With no context set, every policy matches nothing, so a forgotten `withTenant` returns empty results instead of someone else's data.
4. **`tenant_id` defaults to the context.** Columns are `tenant_id uuid not null default app_tenant_id()`, so inserts can't pick the wrong tenant by accident, and a mismatched value is rejected by `WITH CHECK`.
5. **Same-tenant foreign keys.** Child tables reference `(tenant_id, parent_id)` against a `unique (tenant_id, id)` on the parent, so a row can never point at another tenant's row.
6. **Narrow doors for system work.** Webhooks and the SDK arrive without a tenant. They resolve one through small `SECURITY DEFINER` functions (`resolve_tenant_by_clerk_org`, `resolve_tenant_by_stripe_customer`, `resolve_site_by_key`) that return ids (plus the site's domain, for origin checks) and nothing else, then switch into `withTenant`.
7. **Column-level grants where it matters.** The app can't delete or suspend a tenant, move it to another Clerk org, or mark its own domain as verified. Those are system jobs.
8. **A schema lint test** reads the catalog and fails if any table lacks RLS, lacks the policy, lacks `tenant_id`, or grants the app role access to something on the system list. New tables can't skip isolation quietly.

High-volume `events` is partitioned by month. Each partition gets RLS and the same policy when it's created (`ensure_event_partitions(months_ahead)`), and `purge_expired_events()` drops whole partitions past the longest retention and deletes rows past each tenant's own retention.

## Access: entitlements and roles

Two separate questions, two functions:

- **What has the company paid for?** `can(access, feature)`. Every feature key lives in `src/config/features.ts` with the catalog items that grant it. The catalog (`src/config/catalog.ts`) lists the base plan, the three modules and the add-ons, each with a placeholder price and limits. `getAccess(ctx)` reads the tenant's `entitlements` rows once per request and returns the active set. Base is always active.
- **What may this person do?** `may(role, action)` from `src/config/roles.ts`. Roles: Owner, Admin, Sales, Marketing, Viewer. Roles also decide which modes a person sees.

Entitlement rows have a `source`: `subscription` (synced from Stripe), `trial` (14 days, app-side, one per item per tenant), or `grant` (Bison staff comps). Stripe `past_due` stays active through dunning. Canceled or unpaid turns it off. Turning something off never deletes data.

When a feature is locked, the page renders the module's pitch with an Unlock button that goes to `/settings/billing?item=...`. Nothing 404s.

## Editions: Bison Ops and Fit Funnels

One app, two editions of the product. **Bison Ops** is for businesses that sell from their website; **Fit Funnels** is for gyms, health clubs and fitness studios. They share every tool, table, rule and test; an edition sets the name, the mark, the default accent, the kinds of business offered at signup, nav names, module names and pitches, sample data, page templates and the words on every screen.

- **Per company.** `tenants.edition` (`bison` or `fit`, migration 0010) is set when the company is created and the app role can't change it. `createTenant` takes it, or follows the industry (`gym` and `studio` are Fit Funnels), and starts the company in that edition's accent.
- **Config** (`src/config/editions.ts`, pure): `EDITIONS` with product name, accent, pitch, industries, `pageLabels` (nav names by href) and `items` (module and add-on names and pitches, read with `itemOf`). Words that differ are written where they're used with `say("Bison Ops words", "Fit Funnels words")`: `sayOf(ctx)` in server code (`src/lib/edition.ts`), `useSay()` in browser code (`src/components/edition.tsx`, provided by the portal shell), and an `edition` or `say` parameter for pure functions such as setup steps, emails and sample data. Bison Ops text is the first argument, unchanged.
- **Signed in**, the edition is the company's: the shell shows its mark and names, sets `data-edition` and the accent, and the portal layout's metadata gives Fit Funnels companies their own tab titles, icon (`public/brand/fit-icon.svg`, `fit-apple-icon.png`) and install manifest (`public/brand/fit.webmanifest`). The root layout links Bison Ops' icon and manifest by metadata, not file name, so the portal layout can override them.
- **Before sign-in** (the sign-in page, onboarding), it's `?edition=fit`, then the host name (`FIT_FUNNELS_HOSTS`), then Bison Ops. The dev and demo sign-in has a Bison Ops / Fit Funnels switch listing each edition's made-up companies. Signing out returns to that edition's sign-in.
- **Public pages** (shop, checkout, quotes, corporate accounts, unsubscribe) read the tenant's edition with the tenant info they already load; there's no browser provider outside the portal.
- **Made-up companies**: Brightwater Pools and Ridgeline Roasters (Bison Ops), Summit Strength Club (`gym`, sample data on, Marketing) and Pulse Cycle Studio (`studio`, no modules) for Fit Funnels. Seeded the same way and available in the demo.
- **Accent-derived colors** (`--bo-accent-soft`, `-line`, `-text`, `-vivid`, `--bo-focus`) are worked out again on any element with `data-accent`, so they follow the company's accent instead of the default.

## Sample data mode

`settings.sample_data` per tenant, on for new tenants. Every screen reads through a repository (`src/lib/repo`) that has two implementations with the same interface: database and sample. The sample one generates realistic data from a seeded random generator keyed on the tenant id, the company name and its domain, so it's stable across reloads and different for every tenant. Writes check sample mode first and refuse with a plain message, so nothing is saved while it's on.

## Data model

Built so far (all with RLS):

| Table | Purpose | Key columns |
|---|---|---|
| `tenants` | One customer company | `name`, `slug`, `industry`, `edition` (bison, fit), `clerk_org_id`, `stripe_customer_id`, `status`, `retention_days` |
| `sites` | Domains a tenant installs the tag on | `domain` (unique once verified), `verified_at`, `site_key` (public), `excluded_ips`, `first_event_at` |
| `members` | People on a tenant's team | `user_id` (auth provider id), `email`, `name`, `role`, `status` (active, invited, pending, removed) |
| `entitlements` | What a tenant can use | `item_key`, `source`, `status`, `ends_at`, `stripe_subscription_id`, `stripe_subscription_item_id` |
| `subscriptions` | Mirror of the tenant's Bison Ops subscription | `stripe_subscription_id`, `status`, `current_period_end` |
| `integrations` | Provider connections | `provider`, `status`, `secret_ciphertext` (encrypted), `public_config`, `last_error` |
| `settings` | One row per tenant | `sample_data`, `accent`, `timezone`, `privacy` (json) |
| `audit_log` | Who changed what, when (insert and read only) | `actor_user_id`, `action`, `target_type`, `target_id`, `detail` |
| `contacts` | One per email per tenant | `email`, `name`, `phone`, `status`, `is_new`, `first_seen_at`, `last_seen_at` |
| `submissions` | Every form capture | `contact_id`, `form_key`, `form_type`, `fields`, `status`, `spam_reason`, `alert` |
| `events` | Page views, leaves, actions (partitioned by month) | `occurred_at`, `site_id`, `visit_id`, `browser_id`, `visitor_hash`, `type`, `path`, `name`, `props` |
| `webhook_events` | System table: dedupes inbound webhooks | `provider`, `event_id` (app role may insert only) |
| `pages` | Landing pages built in Marketing > Pages | `slug` (unique per tenant), `title`, `doc` (draft, json), `published_doc`, `published_at` |
| `page_revisions` | Every agent change and every publish | `page_id`, `source` (agent, publish), `doc`, `instruction`, `reply`, `actor` |
| `page_agent_runs` | One row per agent request, for the plan limit (insert and read only, no link to pages) | `page_id`, `actor`, `created_at` |
| `page_tests` | A/B tests on landing pages, one open (draft or running) per page | `page_id`, `name`, `hypothesis`, `goal` (form, click), `status` (draft, running, ended), `auto_end`, `started_at`, `ended_at`, `end_reason`, `kept_variant_id` |
| `page_test_versions` | A, B and C of a test | `test_id`, `key` (a, b, c), `name`, `doc` (A's is copied from the live page at start), `weight` (percent), `visitors` and `conversions` (totals kept at the end) |
| `page_test_visits` | One row per visitor per test per day | `test_id`, `version_id`, `day`, `visitor` (a daily keyed hash), `converted_at` |
| `marketing_settings` | One row per tenant, each column a JSON document checked by `src/lib/marketing/settings.ts` | `brand`, `signup` ("I am a..." choices), `offer`, `search` |
| `files` | Uploaded logos and email images, re-encoded by sharp (no update grant) | `kind`, `content_type`, `bytes` (2 MB max), `width`, `height` |
| `subscribers` | One per email per tenant | `email`, `name`, `kind` (the "I am a..." choice), `status`, `source`, `source_detail`, `subscribed_at`, `unsubscribed_at` |
| `lists`, `list_items` | Lists to send to on their own | `name`; `list_id`, `subscriber_id`, `added_at` |
| `unsubscribes` | The do-not-email list, checked by every send | `email`, `reason` (link, one-click, team, complaint, bounce, suppressed), `detail` |
| `newsletters` | One email to send | `doc` (json), `subject`, `preheader`, `status`, `audience`, `list_id`, `scheduled_for`, `sent_at`, `recipients` |
| `newsletter_templates` | Saved by a team from its own newsletters | `name`, `subject`, `preheader`, `doc` |
| `sequences`, `sequence_steps` | Email series and their emails | `trigger`, `trigger_detail`, `status`, `paused_at`, `starter`; `delay_days`, `subject`, `doc` |
| `sequence_runs` | One person in one series, ever (unique per sequence and email) | `email`, `subscriber_id`, `status`, `last_day`, `next_at`, `locked_until`, `stopped_reason` |
| `offer_codes` | Welcome codes, one per email ever | `code`, `email`, `discount_kind`, `discount`, `expires_at`, `redeemed_at`, `redeemed_note` |
| `email_sends` | Every email to one person, and the send queue (no delete grant) | `kind` (newsletter, series, test), `status`, `attempts`, `next_attempt_at`, `locked_until`, `provider_id` |
| `worker_runs` | System table: when each background job last ran | `name`, `last_run_at`, `last_result` |
| `sales_settings` | One row per tenant, each column a JSON document checked by `src/lib/sales/settings.ts` | `store` (currency, shop on, alert emails, checkout, order limit, estimate terms), `shipping` (from address, boxes, rate source, carrier, flat rates, free-over, fulfillment), `trade` (open, intro, tiers) |
| `products`, `product_variants` | The catalog | `slug` (unique per tenant), `status`, `options`, `photos`, `seo`, `source`; `options`, `sku` (unique per tenant), `price_cents`, `compare_at_cents`, `weight_oz`, `box`, `units_per_box`, `ships_alone`, `flat_ship_cents`, `active` |
| `discounts` | Private codes | `code`, `percent_off` or `amount_off_cents`, `usage` (unlimited, single_use, per_account), `max_uses`, `min_order_cents`, `starts_on`, `ends_on`, `trade_account_id`, `note`, `active` |
| `discount_redemptions` | Every use of a code, held during checkout | `discount_id` or `offer_code_id`, `status` (reserved, used, released), `reserved_until`, `email`, `cart_id`, `order_id` |
| `carts` | A shopper's cart, priced on the server | `items`, `priced` (json), `email`, `discount_code`, `trade_account_id`, `status` (open, checkout, abandoned, ordered, inquiry), `checkout_session_id`, `last_active_at` |
| `orders` | Paid orders from the shop, free orders and paid estimates (no delete grant) | `number` (from 1001), `source`, `status`, `fulfillment`, `items`, totals, `ship_to`, `stripe_account_id`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `stripe_invoice_id`, `alert`, `fulfillment_detail` |
| `estimates`, `estimate_events` | Quotes and their history | `number` (from 101), `status`, `client`, `items`, `discount`, totals, `valid_until`, `link_version`, `approved_name`, `change_request`, `stripe_invoice_id`, `invoice_url`; `kind`, `actor`, `detail` (insert and read only) |
| `trade_accounts` | Wholesale buyers | `company`, `email` (unique per tenant), `status` (applied, approved, declined, paused), `tier_override`, `note`, `details`, `session_version` |
| `contact_shares` | Expiring links to one contact's page | `contact_id`, `expires_at`, `revoked_at`, `created_by` |

**Planned**, added in the phase that needs them, each with the same RLS pattern: `visits`, `heat_points`, contact lists, `messages` (Phase 1); `products`, `estimates`, `orders`, `discounts`, `trade_accounts` (Phase 2); `assistant_chats`, `assistant_lessons`, `usage_counters` (Phase 4); `translations`, `push_subscriptions` (Phase 5); `jobs` (queue table, Phase 1).

## SDK contract (Planned, Phase 1)

The contract is fixed now so the dashboard, API and SDK can be built against it.

**Install**

```html
<script src="https://cdn.bisonops.com/v1/bo.js" data-site="SITE_KEY" async></script>
```

Optional attributes: `data-api` (override the API origin), `data-spa="off"` (stop watching history), `data-debug`.

**Global**

A queue stub lets the tenant call the SDK before it loads:

```js
window.bo = window.bo || function () { (bo.q = bo.q || []).push(arguments) }
```

| Call | Does |
|---|---|
| `bo('track', name, label?, props?)` or `bo.track(...)` | Records a key action. Names are lowercase with dashes. Props are flat strings and numbers, 2 KB max. |
| `bo('page')` | Records a page view by hand, for routers that don't use the History API. |
| `bo('optOut')` / `bo('optIn')` | Stops or restarts all collection for this browser. Stored in localStorage. |
| `bo('ready', fn)` | Runs `fn` once config is loaded and widgets are set up. |
| `bo('on', event, fn)` | Widget events: `form:sent`, `assistant:open`, `cart:change`, `checkout:start`, `order:placed`. |

Forms: add `data-bo-form="quote"` to any `<form>`. Optional `data-bo-type` (form type for alerts and filters) and `data-bo-success` (selector to reveal on success). The SDK takes over submit, runs the human check, posts, then shows the tenant's own success state.

**Endpoints** (all on `api.bisonops.com`, all versioned)

| Endpoint | Method | Body / response |
|---|---|---|
| `/v1/config?site=KEY` | GET | Site config: privacy rules, key action list, enabled widgets and their script URLs, form settings. Edge-cached 60 s. |
| `/v1/collect` | POST (`sendBeacon`, `text/plain` JSON so there's no CORS preflight) | Batch of up to 50 events, 32 KB max. Responds `204` always, even on rejection. |
| `/v1/forms/challenge` | POST | Signed puzzle: `{ id, salt, difficulty: 16, issued_at, sig }`. |
| `/v1/forms/submit` | POST | `{ form, fields, challenge, nonce, honeypot, visit }` → `{ ok, message? }`. Spam is saved with a reason and answered `ok` so bots learn nothing. |

**Event payload**

```json
{ "v": 1, "site": "SITE_KEY", "visit": "v_…", "browser": "b_… or null", "returning": true,
  "events": [ { "t": "pageview", "ts": 1729550000000, "url": "https://…", "path": "/pricing",
                "ref": "https://google.com/", "title": "Pricing", "vw": 1440, "vh": 900,
                "utm": { "source": "", "medium": "", "campaign": "" } },
              { "t": "leave", "ts": 0, "path": "/pricing", "active_ms": 41000, "scroll": 82,
                "heat": { "w": 1440, "clicks": [[x, y]], "moves": [[x, y, n]] } },
              { "t": "action", "ts": 0, "name": "call-tap", "label": "+1 555 0100" } ] }
```

Event types: `pageview`, `leave`, `action`, `heartbeat` (every 15 s while active, drives the Live view).

**Rules the SDK follows**

- Base bundle under 15 KB gzipped. Widgets (assistant, calculator, configurator, checkout, translation) load as separate files only when config says the tenant has them.
- Wrapped in one try/catch per entry point, no globals besides `bo`, no prototype changes, no dependence on the host's framework. If config fails to load, it does nothing.
- No cookies. Visit id in sessionStorage (30 minutes idle). Browser id in localStorage only where the tenant's privacy rules allow it (off for EU/UK time zones and for Global Privacy Control by default).
- Daily visitor count uses `sha256(daily_salt + site + ip + user_agent)` computed on the server. The salt rotates at midnight UTC and is never stored past the day.
- Proof of work runs in a Web Worker built from a `blob:` URL. If the host's CSP blocks that, it falls back to the main thread in small chunks.
- Host CSP needs: `script-src https://cdn.bisonops.com`, `connect-src https://api.bisonops.com`, and `worker-src blob:` for the faster human check.

## Request flow in the portal

1. `proxy.ts` sends signed-out visitors to `/sign-in`.
2. A page renders its static frame, then a `<Suspense>` boundary calls `getPortalContext()`.
3. `getPortalContext()` reads the session (Clerk or dev), resolves the tenant, loads the member row under that tenant's context (RLS confirms membership), loads entitlements and settings, and returns `{ tenant, member, access, settings }`.
4. The page asks `can()` and `may()`, then reads through a repository (database or sample).
5. Server actions repeat step 3. They never trust anything the browser sends about tenant or role.

## Landing pages and the page agent

A page is a small JSON document (`src/lib/pages/schema.ts`): a theme, search details and up to 16 typed sections (hero, features, steps, numbers, quote, offer, questions, form, call to action, text). Everything that edits a page goes through one set of ops (`src/lib/pages/ops.ts`), and every op result is checked against the schema, so a page can't hold a bad link (only https, mailto, tel and `#section` are allowed) or a form without an email field.

- **Editor** (`/marketing/pages/[id]`): a client component holding the document, with undo, autosave through server actions, and a live preview. The preview is an iframe with a blank `srcdoc`, sandboxed without scripts, sized to the device width and scaled to fit. The editor renders the page into it with a React portal and copies its own stylesheets in, so no script ever runs inside the frame and every change shows instantly. Clicking a section in the preview selects it; links and forms do nothing there.
- **Templates** (`src/lib/pages/page-templates.ts`): page documents built per company, with its name in the copy and its accent unless the person keeps the template's colors. Each edition has its own set (`templatesFor(edition)`): Fit Funnels clubs get free trial pass, intro offer, new class, personal training consult, presale, corporate wellness, six-week challenge and tour templates, and creating from a template only finds the company's own edition's set. Gym and studio example pages are in `seeds.ts`. The gallery renders them live in the same script-free preview; creating from one is a server action (or the browser, in the demo) that checks the result against the schema like any other page.
- **Agent** (`POST /api/pages/agent`): takes the document as the editor has it plus a request, and streams back newline-delimited JSON: one `op` event per change (with the full document), then `done`. On Claude, the model edits only through six tools (`add_section`, `update_section`, `remove_section`, `move_section`, `set_theme`, `set_seo`). Each tool call is applied the moment its block finishes streaming, so the preview fills in while the model is still writing; errors go back to the model as tool results so it can fix them. At most six rounds. Without `ANTHROPIC_API_KEY`, an offline stand-in (`stand-in.ts`) builds from a brief and follows short, direct changes. Both take the company's edition: for a club, the prompt names Fit Funnels and the gym or studio, and its facts rule also covers class times, schedules, member counts, results and health promises. The route checks role and plan, then counts the request in `page_agent_runs` before it runs (under a per-tenant advisory lock, so simultaneous requests can't all slip under the limit, and stopped or failed runs still count). The app can't update or delete those rows, and they don't cascade from pages. The result is saved with the request in `page_revisions`. The page JSON is sent with prompt caching so later rounds don't pay for it again.
- **Facts**: the agent is told never to invent quotes, reviews, numbers, prices or dates, and to write `[Add ...]` placeholders instead. Publishing refuses while any are left.
- **Publishing**: copies `doc` to `published_doc`. Visitors see `/p/<tenant-slug>/<page-slug>`, found with the `resolve_published_page` SECURITY DEFINER function and then read under that tenant's RLS. The function only returns pages of active tenants that have Marketing right now, so pages go offline on their own when a trial lapses. Drafts are never public. Taking a page offline and deleting it work without the plan.
- **Forms**: `POST /p/<tenant>/<page>/submit` accepts only the fields that page's form has, upserts a contact and records a submission (`form_type = landing-page`). The page carries a server-signed token (HMAC with the `SECRETS_KEYS` active key) saying when the form was shown; a filled hidden field, a missing or forged token, or a send under 1.5 seconds is kept as spam with no contact. A public send fills in a contact's name and phone only when they're empty. Bodies are capped at 20 KB as they're read, and sends are rate-limited per visitor and per page (in memory per server instance for now).
- **Framing**: every route sends `frame-ancestors 'self'`, so no other site can frame the dashboard or a published page.
- **Sample mode doesn't apply**: pages are content a company makes, not data it measures, so they save whether sample data is on or off. The public demo keeps pages in the visitor's browser instead.

### A/B tests

- **Model** (`src/lib/pages/tests.ts`): a test belongs to one page and has two or three versions. A has no document until the test starts, when the live `published_doc` is copied in, so A holds still. B and C start as copies of the live page and are edited in the same editor at `/marketing/tests/<test>/<version>` (saves go to `page_test_versions`; the agent route takes a `versionId` and saves there instead of the page). Versions, split and goal lock once the test runs. `publishPage` refuses while a test runs; `unpublishPage` ends it keeping A.
- **Serving**: the public page asks `serveVersion` for the running test and picks a version from an HMAC of the test id, network address and browser (keyed with the `SECRETS_KEYS` active key, never stored), against the weights. No cookie. The page renders that version's document; metadata, canonical and structured data stay the published page's, and every version carries the page's search details. The visit is written with `after()` once the response is sent, only for a page open (`isPageView`: `Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`, no prefetch or prerender), and only while the test still runs. One row per test, day and visitor; the visitor is an HMAC of test id, address and browser keyed with that company's salt for the day (`page_test_salts`, random, deleted after two days). Bots (by user agent), browsers sending a Bison Ops session cookie, more than 120 visits an hour from one address (IPv6 by /64) and more than 50,000 a day for one test aren't counted.
- **Goals**: `recordGoal` re-derives the visitor's placed version, requires the version the page sent to match it, and only sets `converted` on that visitor's existing row for today or yesterday. It never inserts, so a request can't add visitors or credit another version. The page form sends its version and the submit route checks the form against that version's document; spam doesn't count. For click goals, a small client component sends one `sendBeacon` per visit to `POST /p/<tenant>/<page>/goal` on a click of any `[data-cta]` link or submit button. That route takes only same-site requests (`Sec-Fetch-Site`, or `Origin`), caps the body at 500 bytes, limits per address and per page, and always answers 204.
- **Results** (`src/lib/pages/test-stats.ts`, pure): rate per version, lift over A, and the chance each beats A from Beta(1+conversions, 1+misses) posteriors with a normal approximation. The verdict needs 7 full days and 100 visitors per version, calls a winner at 99% (Bonferroni-split across B and C), and only when the same call held at the end of each of the last 2 days (`earlierTotals` from the daily counts). It says "no real difference" after 28 days and 1,000 per version. Ended tests are summed up as they finished. `test-view.ts` builds the screen's numbers, a sentence on what each version changes (`test-diff.ts`), notes such as a version copied before the page's latest publish, and cumulative daily rates for the chart.
- **Ending**: locks the page row, then the test (the same order as publishing, starting and taking the page offline, so they can't deadlock), snapshots each version's totals, marks the kept version, and for B or C checks placeholders again and publishes its document with the page's search details (also into the draft unless the draft has unpublished changes) with a `page_revisions` row. Running tests per company are capped by `runningPageTests` in the catalog, checked under an advisory lock.
- **Job** (`runPageTestWork`): `due_page_test_tenants()` (SECURITY DEFINER, ids only) finds companies with a test set to end on its own, old visit rows, or old salts. The daily cron passes `autoEnd`, so tests with a held winner after 7 days end keeping it once a day; every run deletes salts older than yesterday and visit rows 30 days after a test ends.
- **Sample mode** lays made-up results over real tests (`src/lib/sample/page-tests.ts`), seeded per test; tests themselves always save. The demo shows two made-up tests and every action refuses.

## Marketing email

One Resend account sends for every tenant; each tenant sends From its own verified domain. The provider sits behind an `EmailProvider` interface (`src/lib/email/provider.ts`) with a Resend version (REST, batch of up to 100, `Idempotency-Key`, Domains API) and an in-memory stand-in for tests and local work (`EMAIL_PROVIDER=stand-in`, outbox at `/api/dev/outbox`, refused on Vercel).

- **Emails are documents.** A newsletter or series email is JSON (`src/lib/email/schema.ts`): up to 30 sections of nine types (header, text, image, button, two columns, divider, spacer, social, welcome offer code), edited through one set of ops (`ops.ts`) and checked against the schema after every change. Links allow http(s), mailto and tel only; images are the tenant's own uploads or https. `[Add ...]` placeholders block sending.
- **Rendering** (`render.ts`) is pure string building: table-based HTML with inline styles that holds up in Outlook, Gmail and Apple Mail, plus a plain-text version. Everything from a tenant or subscriber is escaped. Merge tags (`{first name}`, `{business name}`) fall back to a friendly word. Links to the tenant's own domain get utm tags. The builder renders the same HTML into a script-free iframe, so what you see is what's sent.
- **Domains.** Settings, Email sending creates the domain in Resend, stores its id and records in the tenant's `integrations` row (`provider = resend`, nothing secret), and rechecks it while the page is open. Sending refuses until it's verified and the brand kit has a postal address.
- **The queue is `email_sends`.** Send now or a due schedule expands the audience into one queued row per address (unique per newsletter and email), skipping anyone on `unsubscribes`. Due series runs get their next step queued (unique per run and step). The job (`src/lib/marketing/worker.ts`) claims rows with a 5-minute lease, renders each email with its own unsubscribe link and offer code, sends in batches of 100 with an idempotency key from the row ids, and retries failures after 2, 4 and 8 minutes. Rows more than 3 days late are canceled rather than sent stale. Network calls happen between short transactions, never inside one. `due_marketing_tenants()` (SECURITY DEFINER) lists only tenants with something due.
- **When it runs.** `after()` runs the job for that tenant right after Send now, a signup or "start for a list" responds. `/api/cron/email` runs it for every tenant (every 5 minutes where the plan allows, see Needed 21), and the daily cron runs it as a backstop.
- **Limits.** The monthly count is the number of `email_sends` rows this month, tests included; the app role has no delete grant, so it can't be lowered. Imports and adding by hand stop at the subscriber limit; signups don't.
- **Unsubscribing.** Every email carries a signed link (`/u/<token>`, HMAC over the send id and time with `SECRETS_KEYS`; no email address in the URL) in its footer and in `List-Unsubscribe` with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. GET shows a page and never unsubscribes on its own; POST does. `resolve_email_send()` finds the tenant from the send id. Unsubscribing adds the email to `unsubscribes`, marks the subscriber, ends every series run and cancels queued sends.
- **Webhooks.** `POST /api/webhooks/resend` checks the Svix signature with `RESEND_WEBHOOK_SECRET`, dedupes in `webhook_events`, finds the tenant with `resolve_email_provider_id()`, and updates the send. Hard bounces, complaints and suppressions go on the do-not-email list.
- **Series.** `sequence_runs` holds each person's place: `last_day` and `next_at`. Starting is idempotent (one run per sequence and email, ever). Turning a series off stamps `sequences.paused_at`; turning it on shifts every run's `next_at` by the time it was off. Steps are matched by `delay_days`, so editing a series moves everyone to the right next email.
- **Signups.** A landing page form with "Add to email list" on calls `signUp()` inside the same submit: subscriber upsert, lists, welcome code if the offer is on, and the "joined" series. A person on the do-not-email list who signs up again is taken off it, since they asked.
- **Images** are served at `/f/<id>` by `resolve_public_file()`, with a one-year immutable cache header and `nosniff`.
- **Sample mode** covers subscribers, codes and results (`src/lib/sample/marketing.ts`); content and settings save either way, and sending to a list is refused while sample data is on.

## Sales

Each company sells through its own Stripe account (Connect). Bison Ops never holds the money, takes no fee on it, and never sees card details.

- **Connecting Stripe.** Settings, Payments makes a connected account with the Accounts v2 API (full Stripe Dashboard, Stripe collects fees and covers losses, the same split as a Standard account) and sends an owner or admin through Stripe's hosted onboarding (`account_onboarding` account links). The account id lives in the tenant's `integrations` row (`provider = stripe`, nothing secret). `account.updated` on the Connect webhook keeps "can take payments" and Stripe Tax status current. Nobody pastes a key.
- **The shop** lives at `/p/<company>/shop` (list), `/shop/<product>` (each product, with Product or ProductGroup structured data, Open Graph tags and share buttons), `/checkout`, `/order` (thank you), `/trade` (apply and sign in) and `/products.xml` (a Google Merchant feed). Products are in the sitemap and `llms.txt` too. `resolve_sales_tenant()` finds the company from the address only while it has Sales. The pages use their own neutral look with the company's accent color (`src/components/shop`).
- **Carts are an id in the browser.** `POST /p/<company>/cart` takes one change (add, set, remove, code, view) and answers the priced cart. Prices, trade pricing, codes and the order limit are worked out on the server (`src/lib/sales/pricing.ts`, pure) every time; the browser never sends a price.
- **Checkout** is a Stripe Checkout Session in `elements` mode on the company's account, shown inside the shop's own page with Stripe.js (`initCheckoutElementsSdk`, loaded with the connected account). The session is made with `permissions.update_shipping_details: server_only`: when the shopper finishes their address, the page asks `/checkout/shipping`, which packs the cart (`packing.ts`: weight per box, ships-alone items, flat-rate items), gets live rates from the company's carrier, and sets the shipping details and options on the session. Stripe Tax is on when the company turns it on and its Stripe account has it active. Codes become a one-off coupon on that session.
- **Recording the order.** `checkout.session.completed` on the Connect webhook (`/api/webhooks/stripe-connect`, verified with `STRIPE_CONNECT_WEBHOOK_SECRET`, tenant found with `resolve_tenant_by_connect_account()`, one company per account by a unique index) reads the session fresh from Stripe, with its line items, and records an order of exactly what Stripe charged for, filled in from the catalog. The cart is never trusted for this, so a cart changed mid-checkout can't change what ships. Starting a new checkout for a cart, or changing the cart, expires the one before. The thank-you page does the same if it gets there first, so nothing waits on the webhook and a missed webhook never loses an order. Either way it's idempotent. Then the team gets an email and, with ShipStation on, the order goes to ShipStation (retried by the sales job up to 5 times).
- **Codes** are private to Bison Ops, not Stripe promotion codes. The code's row is locked (`for update`) while its uses are counted and a use is held for the cart (`discount_redemptions.status = reserved`), all before Stripe is asked for anything, so two checkouts can't both get a single-use code. The hold is spent when the order is recorded (or a used row is written if the hold is gone, so a paid code always counts), and let go when the checkout expires, the cart changes, Stripe refuses, or the sales job finds an old hold. A code that covers everything skips Stripe and places a free order with just an address. Welcome codes from Marketing are checked here too, first purchase only.
- **Order limits.** Over the amount or quantity limit, checkout becomes a quote request (signed timing token, hidden field, per-visitor and per-shop limits): a contact, a submission, a draft estimate with the cart's lines, and an email to the team. The shopper's email only reaches a cart at checkout, so the left-cart series can't be pointed at strangers from the cart endpoint.
- **Carriers** sit behind a `Carrier` interface (`carriers.ts`): ShipStation API v2 (`API-Key`, `/v2/rates`, `/v2/shipments` with `create_sales_order`), UPS (OAuth client credentials, Rating API Shop), and a stand-in (`SHIPPING_PROVIDER=stand-in`). Keys are encrypted in `integrations` and the inputs are write-only once saved. If live rates fail, checkout says so rather than guessing a price.
- **Estimates.** The builder saves as you type. Sending emails a signed link (`/e/<token>`, purpose `estimate:v<link_version>`, 180 days; voiding bumps the version so old links stop). The client page marks it viewed, and the client approves by typing their full name, asks for changes, or declines. Approval checks the page they read is the latest (`seen`), then makes a Stripe invoice on the company's account (`collection_method: send_invoice`, `auto_advance: false`, finalized, so the Pay link works and Stripe sends nothing on its own). `invoice.paid` marks it paid, makes an order, emails the team and sends it to fulfillment. Marking paid by hand voids the open invoice so it can't be paid twice. Every step is a row in `estimate_events`. Only drafts can be deleted, enforced by a trigger.
- **Trade accounts.** Buyers apply at `/p/<company>/trade` (signed timing token, hidden field, rate limit). Approving emails a sign-in link (`/trade/enter?t=`, purpose `trade-link:v<session_version>`, 24 hours). Opening it changes nothing; its Sign in button posts to `/trade/session` (same-site only), which sets an httpOnly cookie for that shop's path only, good for 30 days (`trade-session:v<session_version>`). Applying again with an approved email gets the same answer as anyone else and a sign-in link in that inbox, so the form can't tell anyone who has an account. Every request checks the account is still approved; pausing or declining bumps `session_version`, signing them out everywhere. The tier comes from 12-month spend (`tierFor`) unless the team sets one.
- **Left-behind carts.** The sales job (`runSalesWork`, run by both crons, tenants from `due_sales_tenants()`) marks carts with an email that have been quiet for the company's hours as abandoned, starts the Marketing "Someone leaves a cart" series when the company has Marketing, lets go of old code holds, and retries fulfillment.
- **Sharing a contact.** A row in `contact_shares` and a signed link (`/s/<token>`) that works until `expires_at` (1, 7 or 30 days) or until it's turned off. `resolve_contact_share()` returns the tenant only for a live link, and the page also checks the company still has contact sharing. It shows the person, what they sent, and their orders, estimates and carts, never team notes.
- **Payments stand-in.** `PAYMENTS_PROVIDER=stand-in` plays Stripe in memory for tests and local work: onboarding, checkout (`/api/dev/payments`), invoices (`/api/dev/payments/invoice`) and refunds. It fails closed like test billing: never on any Vercel deployment, and in other production builds only with `ALLOW_FAKE_BILLING=1`. `SHIPPING_PROVIDER=stand-in` follows the same rule.
- **Limits.** Public Sales endpoints count per visitor (never per made-up shop address), and the ones that email the team also have a ceiling per real shop. Counts are per server instance (Needed 19).
- **Sample mode** covers orders, estimates, carts and trade accounts (`src/lib/sample/sales.ts`); the catalog, codes and settings are content and save either way.

## Search pack

Published pages get `generateMetadata` (title, description, canonical, Open Graph and Twitter cards), an `opengraph-image` drawn per page, and LocalBusiness and FAQ structured data from the business details. Per tenant, `/p/<tenant>/sitemap.xml`, `/llms.txt` and `/llms-full.txt` are route handlers built live from published pages and `marketing_settings.search`, found with `resolve_marketing_tenant()` (active tenants with Marketing only). The dashboard's `robots.txt` allows `/p/` only and disallows each AI crawler for the pages of tenants that turned AI off (`ai_blocked_tenant_slugs()`).

## Billing flow

- Unlock → `/settings/billing?item=module:sales` → **Start 14-day trial** (app-side entitlement, no card) or **Subscribe**.
- Subscribe with no subscription yet: Stripe Checkout in subscription mode, `client_reference_id = tenant id`, `metadata.item_key`.
- Subscribe with a subscription: add a subscription item with `proration_behavior: create_prorations`.
- Stripe webhooks (`customer.subscription.created|updated|deleted`) are verified, deduped in `webhook_events`, and then the subscription is **read fresh from Stripe**, so late, repeated or out-of-order events can't turn access back on. Prices map to item keys and land in `entitlements` with `source = subscription`, tagged with the subscription id, so one subscription's changes never cancel another's items.
- Test billing (`BILLING_PROVIDER=fake`) fails closed: it's refused on Vercel production, and in any production build unless `ALLOW_FAKE_BILLING=1`.

## Team membership

- Clerk decides who can sign in; Bison Ops decides what they can see. Joining a Clerk organization never opens a company's data on its own.
- An invite made in Bison Ops (email plus role) becomes active when that email joins the Clerk org. Anyone else lands as `pending` until an owner or admin approves them. Someone removed and added back starts over as `pending`.
- Only a Clerk org admin can set up the Bison Ops account for an organization.
- The dev sign-in never runs on any Vercel deployment (production or preview) and only signs in made-up `dev_` people.
- Tenant checkout and invoices use each tenant's own connected Stripe account and never touch the Bison Ops Stripe account's balance.

## Environment

See `docs/settings-and-env.md` for every variable.
