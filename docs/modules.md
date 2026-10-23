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

## Sales (module, Phase 2, built)

Every tool has a step-by-step setup (`src/lib/sales/setup-steps.ts`): a Setup page (`/sales/setup`) for all of them in order, and the same steps at the top of each tool until done. The overview shows 30-day revenue and orders, open estimates, what needs the team, and the latest orders.

- **Payments** (`/settings/payments`, owners and admins): connect the company's own Stripe account through Connect, check it can take payments, and Stripe Tax status. No keys pasted, no Bison Ops fee.
- **Products** (`/sales/products`, `sales.products`): options with a version per combination, price, was price, SKU, weight, box, units per box, ships alone, own flat shipping, photos, category, tax code, search title and description, status. Imports from CSV, a Shopify export, a Shopify store's address or a product feed. Limit: 2,000 products (placeholder).
- **Shop** (`/p/<company>/shop`): a product list by category, a page per product with photos, versions, share buttons (copy, the phone's share sheet, email, Pinterest, Facebook) and Product structured data, a cart drawer, and a product feed at `/p/<company>/products.xml`. Products join the sitemap and llms.txt.
- **Checkout** (`/p/<company>/checkout`, `sales.checkout`; settings at `/sales/checkout` and `/settings/shipping`): Stripe's payment form on the company's account, live shipping from ShipStation or UPS with packing by weight and box, or flat or free rates, Stripe Tax, discount codes, free orders when a code covers everything, and quote requests over the order limit. Paid orders email the team and go to ShipStation.
- **Orders** (`/sales/orders`, `sales.orders`): every paid order with items, totals, ship-to, the payment in Stripe, the team email and ShipStation (send either again), mark shipped with tracking, and refunds (owners, admins and Sales).
- **Estimates** (`/sales/estimates`, `sales.estimates`): a builder that saves as you type, lines from the catalog (at trade prices for a trade account) or typed in, discount, shipping, notes, dates and a team note. Send it, and the client approves by typing their name, asks for changes or declines on their own page (`/e/<token>`). Approval sends a Stripe invoice with a Pay link; paying makes an order. Statuses: Draft, Sent, Viewed, Changes requested, Approved, Declined, Invoiced, Paid, Void, with a full history.
- **Discount codes** (`/sales/discounts`, `sales.discounts`): percent or amount off, unlimited, once per buyer or once ever, a total limit, minimum order, dates, one trade account and a team note, spelled out in a sentence. Welcome codes from Marketing work at checkout too.
- **Trade accounts** (`/sales/trade`, `sales.trade`): applications at `/p/<company>/trade`, approve, decline or pause, sign-in by emailed link, tiers by 12-month spend or set by hand, and the program's settings. Limit: 500 accounts (placeholder).
- **Carts** (`/sales/carts`, `sales.abandoned`): carts with an email, left behind first, and the Marketing series that follows up.
- **Sharing a contact** (`contacts.share`, also sold alone): a read-only page of one person at a link that expires, made from the contact panel, which also shows their orders, estimates and carts.

Owners, admins and the Sales role can use all of it; payments and shipping setup are owners and admins. In the demo, Sales shows sample data and the shop works with a made-up catalog up to paying.

Not built yet: the shop on the company's own domain (Needed 31), Apple Pay and Google Pay with live shipping (Needed 29), and cart and checkout widgets for the company's own site (with the SDK, Phase 1).

## Marketing (module, Phase 3, built)

Every tool has a step-by-step setup that ticks off from what's really saved or verified (`src/lib/marketing/setup-steps.ts`): a Setup page (`/marketing/setup`) for all of them in order, and the same steps at the top of each tool until done. The overview shows sending status, the month's email count and the next setup step.

- **Email sending** (`/settings/email`, owners and admins): add a domain (a subdomain is suggested), copy three DNS records with steps for common DNS hosts, automatic checks every 20 seconds while open, From name and address, Reply-To, and a test to yourself. One Resend account for all companies; nobody pastes a key.
- **Brand kit** (`/marketing/brand`, `marketing.brand-kit`): logo (re-encoded, metadata stripped), colors (button text switches between black and white to stay readable), email-safe fonts, button shape, footer address (required to send), sign-off and social links, with a live email preview. New landing pages use it too.
- **Subscribers** (`/marketing/subscribers`, `marketing.subscribers`): search and filter, add by hand, CSV import that finds the columns by their headings, with a consent check, CSV export, lists, the "I am a..." signup question, a person panel with their series and recent emails, and the do-not-email list (unsubscribes, hard bounces, spam complaints). Signup forms are landing page forms with "Add to email list" on. Limit: 5,000 subscribers (placeholder); signups are never refused.
- **Newsletters** (`/marketing/newsletters`, `marketing.newsletters`): a click-to-edit builder on the email itself, nine section types (header, text, image, button, two columns, divider, spacer, social, welcome offer code), templates, saved templates, merge tags, yellow placeholders that block sending, desktop and phone preview, tests to anyone on the team, send now or schedule up to 30 days ahead to everyone or a list, cancel a scheduled send, and results (sent, delivered, bounced, unsubscribed). Limit: 10,000 emails a month (placeholder), tests included.
- **Email series** (`/marketing/series`, `marketing.sequences`): up to 12 emails on day offsets, triggered by joining the list, sending a form, getting an estimate or leaving a cart (both with Sales), or started by hand for a list. A starter welcome series, pause and resume without bunching, per-person progress, and nobody gets the same series twice.
- **Welcome offer** (`/marketing/offer`, `marketing.welcome-offer`): percent or amount off, days it lasts, code prefix and fine print. One code per new subscriber, shown in their own "Welcome offer code" section. With Sales, codes are checked at checkout; without it, look up and mark used by hand.
- **Search pack** (`/marketing/search`, `marketing.seo`): business summary, services, areas, contact details and hours, an AI crawler switch, and live `sitemap.xml`, `llms.txt` and `llms-full.txt` at `/p/<company>/`. Published pages get titles, descriptions, social cards (`opengraph-image`), canonical links and LocalBusiness structured data. Copy-ready robots.txt lines and a structured data snippet for the company's own site. Products from Sales are in the sitemap and llms.txt, with a product feed.
- **Pages** (`/marketing/pages`, `marketing.pages`): a landing page maker with an agent. Describe a page and the agent builds it section by section in a live preview at desktop, tablet or phone width; ask for changes in plain words, or edit any section, the order and the style by hand. Eight templates to start from (quote request, product launch, seasonal sale, consultation, event, trade program, free guide, simple contact), previewed at desktop or phone size and built with the company's name and, by default, its brand color (`src/lib/pages/page-templates.ts`). Undo, autosave, yellow placeholders for facts only the company knows (publishing waits until they're filled), publish to `/p/<company>/<page>`, and forms that send to Contacts with bot filtering and, when turned on, add people to the email list. The agent runs on Claude with an `ANTHROPIC_API_KEY`, otherwise an offline helper. Plan limit: 300 agent requests a month (placeholder).

Owners, admins and the Marketing role can use all of it; email sending setup is owners and admins. In the demo, Marketing content saves in the visitor's browser and sending is pretend.

Not built yet: double opt-in (Needed 23), open and click tracking (left out on purpose, decision 42), pre-rendered pages for single-page app sites (needs the tenant's own domain first).

## AI Assistant (module, Phase 4)

The on-site assistant, coaching, chats and insights, usage limits. Phase 0: catalog entry, features and limits.

## Add-ons (Phase 5)

Quote calculator, visual configurator, document library, project gallery, site translation (behind a preview flag first), push notifications, shared contact pages. Phase 0: catalog entries, features, trials and test billing.
