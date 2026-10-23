# Bison Ops architecture

Status: Phase 0 (foundation) built. This document covers the whole platform so later phases fit the same frame. Sections marked **Planned** are designed but not built yet.

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

## Sample data mode

`settings.sample_data` per tenant, on for new tenants. Every screen reads through a repository (`src/lib/repo`) that has two implementations with the same interface: database and sample. The sample one generates realistic data from a seeded random generator keyed on the tenant id, the company name and its domain, so it's stable across reloads and different for every tenant. Writes check sample mode first and refuse with a plain message, so nothing is saved while it's on.

## Data model

Built in Phase 0 (all with RLS):

| Table | Purpose | Key columns |
|---|---|---|
| `tenants` | One customer company | `name`, `slug`, `industry`, `clerk_org_id`, `stripe_customer_id`, `status`, `retention_days` |
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

**Planned**, added in the phase that needs them, each with the same RLS pattern: `visits`, `heat_points`, `lists`, `list_items`, `messages`, `files` (Phase 1); `products`, `estimates`, `orders`, `discounts`, `trade_accounts` (Phase 2); `newsletters`, `newsletter_sends`, `sequences`, `sequence_steps`, `sequence_runs`, `subscribers`, `unsubscribes` (Phase 3); `assistant_chats`, `assistant_lessons`, `usage_counters` (Phase 4); `translations`, `push_subscriptions` (Phase 5); `jobs` (queue table, Phase 1).

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
- **Agent** (`POST /api/pages/agent`): takes the document as the editor has it plus a request, and streams back newline-delimited JSON: one `op` event per change (with the full document), then `done`. On Claude, the model edits only through six tools (`add_section`, `update_section`, `remove_section`, `move_section`, `set_theme`, `set_seo`). Each tool call is applied the moment its block finishes streaming, so the preview fills in while the model is still writing; errors go back to the model as tool results so it can fix them. At most six rounds. Without `ANTHROPIC_API_KEY`, an offline stand-in (`stand-in.ts`) builds from a brief and follows short, direct changes. The route checks role and plan, then counts the request in `page_agent_runs` before it runs (under a per-tenant advisory lock, so simultaneous requests can't all slip under the limit, and stopped or failed runs still count). The app can't update or delete those rows, and they don't cascade from pages. The result is saved with the request in `page_revisions`. The page JSON is sent with prompt caching so later rounds don't pay for it again.
- **Facts**: the agent is told never to invent quotes, reviews, numbers, prices or dates, and to write `[Add ...]` placeholders instead. Publishing refuses while any are left.
- **Publishing**: copies `doc` to `published_doc`. Visitors see `/p/<tenant-slug>/<page-slug>`, found with the `resolve_published_page` SECURITY DEFINER function and then read under that tenant's RLS. The function only returns pages of active tenants that have Marketing right now, so pages go offline on their own when a trial lapses. Drafts are never public. Taking a page offline and deleting it work without the plan.
- **Forms**: `POST /p/<tenant>/<page>/submit` accepts only the fields that page's form has, upserts a contact and records a submission (`form_type = landing-page`). The page carries a server-signed token (HMAC with the `SECRETS_KEYS` active key) saying when the form was shown; a filled hidden field, a missing or forged token, or a send under 1.5 seconds is kept as spam with no contact. A public send fills in a contact's name and phone only when they're empty. Bodies are capped at 20 KB as they're read, and sends are rate-limited per visitor and per page (in memory per server instance for now).
- **Framing**: every route sends `frame-ancestors 'self'`, so no other site can frame the dashboard or a published page.
- **Sample mode doesn't apply**: pages are content a company makes, not data it measures, so they save whether sample data is on or off. The public demo keeps pages in the visitor's browser instead.

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
- Tenant checkout and invoices (Phase 2) use Stripe Connect Standard accounts and never touch the Bison Ops Stripe account.

## Environment

See `docs/settings-and-env.md` for every variable.
