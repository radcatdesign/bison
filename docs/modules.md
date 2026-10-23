# Modules

What each part of Bison Ops does, what grants it, and how far it's built. Feature keys are in `src/config/features.ts`.

## Platform (Phase 0, built)

- **Tenancy.** One database, `tenant_id` on every row, row-level security on every table. See `architecture.md`.
- **Sign-in and roles.** Clerk Organizations in production, a dev picker locally. Roles: Owner, Admin, Sales, Marketing, Viewer.
- **Entitlements.** `can(tenant, feature)` decides access. Locked modes show the module's pitch and an Unlock button.
- **Billing skeleton.** 14-day trials, test billing, Stripe Checkout for the first item, added items with proration, and a verified, deduped Stripe webhook that writes entitlements.
- **Sample data.** Every screen reads through a repository with a database version and a sample version.
- **Portal shell.** Analyze, Marketing and Sales modes, Updates, Settings, phone dock and menu, pull to refresh, home-screen install, "?" on every number.
- **Audit log, encrypted secrets, daily cron** for event partitions and retention.

## Analytics (Base, Phase 1)

Cookie-free counting, live view, pages and heatmaps, audience, key actions, visitors and person pages, benchmarks. Built so far:

- **Overview:** visitors, page views, visits, bounce rate, average active visit, pages per visit, returning share, daily chart, top pages, reading real `events` or sample data.
- **Landing pages** (`/analyze/pages`): every page people arrive on (the first page of a visit), with entries, share, bounce rate, average active time and form sends. Each page shows a live preview of the tenant's real page in a sandboxed frame, at desktop (1440), tablet (820) or phone (390) width. In sample mode the previews load made-up sample sites (`/sample-site/<industry>/...`) so nothing points at a real domain. Each preview shows a loading state until the page has loaded, then fades in, so a slow site never reads as a blank page. Sites that refuse to be framed show blank until scheduled screenshots arrive with the tracking script; click, scroll and cursor heatmaps will paint over the same preview.

Phase 1 adds the tracking script and everything else.

## Contacts (Base, Phase 1)

Form capture with the invisible human check, the inbox with filters and lists, the contact panel, team alerts with delivery tracking, and email threads. Built in Phase 0: the contact list, the slide-over panel and status changes, with sample mode refusing writes.

## Sales (module, Phase 2)

Products, checkout through the tenant's own Stripe account, estimates and invoices, trade accounts, discount codes, orders, abandoned carts. Phase 0: the mode, its Unlock screen and a "being built" overview.

## Marketing (module, Phase 3)

Newsletters, brand kit, email series, subscribers and unsubscribes, signup forms, welcome offer, search pack. Built so far:

- **Pages** (`/marketing/pages`, feature `marketing.pages`): a landing page maker with an agent. Describe a page and the agent builds it section by section in a live preview at desktop, tablet or phone width; ask for changes in plain words, or edit any section, the order and the style by hand. Eight templates to start from (quote request, product launch, seasonal sale, consultation, event, trade program, free guide, simple contact), previewed at desktop or phone size and built with the company's name and, by default, its brand color (`src/lib/pages/page-templates.ts`). Undo, autosave, yellow placeholders for facts only the company knows (publishing waits until they're filled), publish to `/p/<company>/<page>`, and forms that send to Contacts with bot filtering. The agent runs on Claude with an `ANTHROPIC_API_KEY`, otherwise an offline helper. Plan limit: 300 agent requests a month (placeholder). Owners, admins and the Marketing role can build and publish.

The rest of the mode shows a "being built" overview.

## AI Assistant (module, Phase 4)

The on-site assistant, coaching, chats and insights, usage limits. Phase 0: catalog entry, features and limits.

## Add-ons (Phase 5)

Quote calculator, visual configurator, document library, project gallery, site translation (behind a preview flag first), push notifications, shared contact pages. Phase 0: catalog entries, features, trials and test billing.
