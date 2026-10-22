# Decisions

Two lists. The first is what I decided while building Phase 0 that the brief didn't specify. The second is what I need from you, each with a recommendation.

## Decided while building (tell me if any of these are wrong)

1. **Next.js 16 with Cache Components on.** It's the current default. Every session read sits behind a `<Suspense>` boundary, so the black frame and nav paint first and data streams in. Middleware is now `src/proxy.ts` (Next 16 renamed it).
2. **Kysely and hand-written SQL migrations instead of an ORM.** RLS policies are the most important code in the app, so they live in plain SQL where they're easy to read and review. Kysely gives typed queries without hiding the SQL.
3. **RLS enabled, not forced, with two roles.** Migrations run as the owner role; the app runs as `bisonops_app`, which can't bypass RLS, belongs to no role and owns nothing. Forcing RLS on the owner would break the small lookup functions webhooks need. A test fails the build if the app role ever gains bypass powers or a table ships without the policy.
4. **Roles live in Bison Ops, not in Clerk.** Clerk handles sign-in and organization membership. Owner, Admin, Sales, Marketing and Viewer are stored in `members`. This avoids Clerk custom-role setup per environment and keeps roles working if the auth provider ever changes.
5. **Stand-ins so the whole thing runs without accounts.** A dev sign-in (four made-up people at two made-up companies) replaces Clerk locally and in tests, and is refused on Vercel production. A test billing provider turns items on without Stripe. Real Clerk and Stripe switch on with env vars.
6. **Trials are app-side.** Stripe trials apply to a whole subscription, not one item, so a 14-day trial of one module is an entitlement row with an end date. No card needed. One trial per item per tenant.
7. **Shared contact pages are in Sales and also sold alone.** The brief lists contact sharing under Sales and as an add-on. Both grant the same feature.
8. **Sample data is on for new tenants, generated, never stored.** It's built from a seeded random generator keyed to the tenant, so it's stable and different for every company. Writes refuse while it's on.
9. **Events are partitioned by month.** A daily cron keeps partitions two months ahead and drops data past each tenant's retention (`/api/cron/daily`, scheduled in `vercel.json`).
10. **Webhooks are deduped in the same transaction as the work,** so a failed run can be retried by Stripe without double-processing.
11. **Plain CSS with tokens, no Tailwind.** Brand values are custom properties in `src/app/tokens.css`, so white-label is a token swap. The look is modern and light by default, with a full dark theme that follows the device or a per-person choice (Match my device, Light, Dark) saved in the browser and applied before the page paints. Fonts are Mona Sans (text and numbers, with tabular figures) and Geist Mono (paths and keys), self-hosted from npm. Icons are Lucide.
12. **Last mode is remembered in a cookie set by the browser,** not by the server, so link prefetching can't change it.
13. **Marketing and Sales show a short "being built" overview** when unlocked, until Phases 2 and 3 replace it.
14. **Postgres 16** locally and in tests. Neon runs 16 and 17; nothing here depends on 17.
15. **Domains are unique only once verified.** Anyone can add a domain to their account, but only one account can verify it (DNS check, Phase 1). Nobody can lock a competitor out, and the app never says which domains belong to customers.
16. **New Clerk members wait for approval.** Only invites made in Bison Ops activate on their own. Everyone else is `pending` until an owner or admin approves them (the approve button ships with team management in Phase 1).
17. **Billing and dev sign-in fail closed.** Test billing and the dev sign-in refuse to run on Vercel production, and need an explicit flag in any other production build.
18. **An independent security review** of tenancy, auth and billing ran before this was pushed. Every finding was fixed and has a test.
19. **A public demo mode.** `DEMO_MODE=1` with no `DATABASE_URL` runs the portal with the made-up companies and people, sample data, and every save refused. It needs no database, Clerk or Stripe, so a Vercel deploy shows the product in a minute. It refuses to turn on if a database is configured.
20. **Landing page previews load the real page in a sandboxed frame.** It's live and free, and it's what heatmaps will paint over. Some sites block framing; for those, scheduled screenshots (Phase 1) fill in. Sample mode previews made-up sample sites instead of whatever lives at the sample domain.

## Needed from you

| # | Decision | My recommendation |
|---|---|---|
| 1 | **Prices.** Placeholders now: Base $0, Sales $149, Marketing $99, AI Assistant $99, add-ons $9 to $49 a month. All in `src/config/catalog.ts`. | Keep Base free to make the script tag an easy yes. Price modules on value to a small business: Sales $129 to $199 (it touches revenue), Marketing $79 to $99, Assistant $99 with usage included. Offer two months free on annual. |
| 2 | **Free plan limits.** Placeholder: 1 site, 5 seats, 100,000 events a month, 400 days of history. | Keep those, and make the event limit soft: keep counting, show a banner at 100%, stop storing new detail (not totals) at 150%. Never break the tenant's site. |
| 3 | **What happens at a usage limit** for assistant answers, translations and email sends. | Soft limit at 100% with a notice, hard stop at 120%. The assistant falls back to FAQ answers, as the brief says. |
| 4 | **Domains.** I assumed `bisonops.com`, `cdn.bisonops.com`, `api.bisonops.com` and a reply domain. | Confirm you own `bisonops.com`. Use `reply.bisonops.com` for email threads and `app.bisonops.com` for the dashboard. |
| 5 | **Where AI Assistant screens live.** The brief has three modes and doesn't place Chats or coaching. | Chats and Insights under Analyze (every role sees Analyze, and Sales people need the leads). Coaching and the assistant's name and voice under Settings. |
| 6 | **Sample data switching off.** Today the tenant turns it off. | When the first real page view arrives, show "Your own data is coming in. Switch to it?" with one button. Don't switch silently. |
| 7 | **Default accent color.** Now an electric cobalt, `#3b5bff`, chosen to read well in both light and dark. Tenants can recolor; text on the accent switches between white and black automatically. | Confirm, or swap in Bison's brand color when it's set. |
| 8 | **Refunds for the Sales role.** Today Sales can issue refunds. | Keep it, but log every refund to the audit log and alert the owner. Turn it off per tenant in Phase 2 if anyone asks. |
| 9 | **Extra seats.** Base includes 5 people. | $5 to $10 a seat after that, or unlimited seats on any paid module. Unlimited is simpler to sell. |
| 10 | **Hosting region.** | Put Vercel functions and Neon in the same US region (Washington DC, `iad1` / `us-east-1`) for the lowest database latency. Revisit if EU tenants need data kept in the EU. |
| 11 | **Privacy rules review.** The cookie-free counting and EU/UK time zone rule come from the Element Glo build. | Have a privacy lawyer read the generated privacy section before the first non-US tenant signs up. |
| 12 | **Stripe Connect account type for tenants (Phase 2).** The brief says Standard accounts. | Confirm in Phase 2 against Stripe's current options. Standard keeps Bison Ops out of the tenant's disputes and payouts, which is what you want. |
| 13 | **How a tenant proves they own their domain.** | A DNS TXT record as the main way, with "first page view arrives from that domain with your site key" shown as proof the tag works (not proof of ownership). |
