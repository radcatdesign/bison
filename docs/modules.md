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

Cookie-free counting, live view, pages and heatmaps, audience, key actions, visitors and person pages, benchmarks. Built in Phase 0: the Overview screen (visitors, page views, visits, bounce rate, average active visit, pages per visit, returning share, daily chart, top pages) reading real `events` or sample data. Phase 1 adds the tracking script and everything else.

## Contacts (Base, Phase 1)

Form capture with the invisible human check, the inbox with filters and lists, the contact panel, team alerts with delivery tracking, and email threads. Built in Phase 0: the contact list, the slide-over panel and status changes, with sample mode refusing writes.

## Sales (module, Phase 2)

Products, checkout through the tenant's own Stripe account, estimates and invoices, trade accounts, discount codes, orders, abandoned carts. Phase 0: the mode, its Unlock screen and a "being built" overview.

## Marketing (module, Phase 3)

Newsletters, brand kit, email series, subscribers and unsubscribes, signup forms, welcome offer, search pack. Phase 0: the mode, its Unlock screen and a "being built" overview.

## AI Assistant (module, Phase 4)

The on-site assistant, coaching, chats and insights, usage limits. Phase 0: catalog entry, features and limits.

## Add-ons (Phase 5)

Quote calculator, visual configurator, document library, project gallery, site translation (behind a preview flag first), push notifications, shared contact pages. Phase 0: catalog entries, features, trials and test billing.
