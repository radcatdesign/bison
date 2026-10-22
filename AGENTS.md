<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Bison Ops rules

Read `docs/architecture.md` before changing anything. These rules are not optional.

**Tenancy**
- Every new table gets `tenant_id uuid not null default app_tenant_id()`, then `select apply_tenant_policy('table');` in its migration. `tests/db/schema.test.ts` fails otherwise. Add it to `TENANT_TABLES` in `tests/db/helpers.ts`.
- App code reads and writes only inside `withTenant(scope, fn)`. Never connect as the owner role from the app.
- Requests without a tenant (webhooks, the SDK) resolve one with a `SECURITY DEFINER` function that returns an id and nothing else, then switch to `withTenant`.
- Never trust tenant, role or entitlement from the browser. Server actions start with `getPortalContext()`.

**Access**
- Gate features with `can(ctx.tenant, "feature.key")`. Add new features to `src/config/features.ts`. Locked features show `<Locked>`, never an error.
- Gate actions by role with `may(role, action)` from `src/config/roles.ts`.
- Prices and limits only change in `src/config/catalog.ts`.

**Screens**
- Screens read through a repository in `src/lib/repo` with a sample version. Sample writes throw `SampleModeError`.
- Session reads sit behind `<Suspense>`. Every number gets a `<Help>` explaining how it's measured.
- Colors, type and spacing come from `src/app/tokens.css`. No hard-coded brand values.

**Copy**
- Plain, direct, human. No em dashes. No "seamless", "leverage", "unlock the power of" or similar. Errors say what happened and what to do. `tests/unit/copy.test.ts` checks this.

**Every change**
- Test at 390 px and 1440 px with Playwright, with stand-ins for Stripe, Resend, Claude and shipping.
- Update `docs/` and `src/config/releases.ts`. List any decision you made that wasn't specified at the top of your summary.
