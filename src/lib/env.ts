// Small, explicit readers for the env vars that change behavior.

export type AuthProvider = "clerk" | "dev";
export type BillingProviderName = "stripe" | "fake";

export class ConfigError extends Error {}

/**
 * Demo mode: a public, read-only showcase with made-up companies and no
 * database. It only turns on when no DATABASE_URL is set, so it can't be
 * switched on by mistake in a deployment that holds real data.
 */
export function demoMode(): boolean {
  return process.env.DEMO_MODE === "1" && !process.env.DATABASE_URL;
}

/** True when Clerk is the auth provider. Never throws; safe at build time and in proxy. */
export function clerkConfigured(): boolean {
  if (demoMode()) return false;
  const explicit = process.env.AUTH_PROVIDER;
  return explicit === "clerk" || (explicit !== "dev" && Boolean(process.env.CLERK_SECRET_KEY));
}

export function authProvider(): AuthProvider {
  const provider: AuthProvider = clerkConfigured() ? "clerk" : "dev";
  if (provider === "dev") assertDevAuthAllowed();
  return provider;
}

/** True on any Vercel deployment: production, preview or `vercel dev`. */
export function onVercel(): boolean {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

/**
 * The dev people picker never runs on Vercel (previews can hold copies of real
 * data), and only runs under `next start` on your own machine when asked to.
 */
export function assertDevAuthAllowed() {
  // The demo has no database, so its made-up people can't reach anything real.
  if (demoMode()) return;
  if (onVercel()) {
    throw new ConfigError("Dev sign-in never runs on Vercel. Set AUTH_PROVIDER=clerk and the Clerk keys.");
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_AUTH !== "1") {
    throw new ConfigError("Dev sign-in only runs in development. Set AUTH_PROVIDER=clerk, or ALLOW_DEV_AUTH=1 for local test builds.");
  }
}

const BILLING_NOT_SET_UP = "Billing isn't set up. Set STRIPE_SECRET_KEY and the STRIPE_PRICE variables.";

/** Test billing turns paid items on for free, so it fails closed outside development. */
export function assertFakeBillingAllowed() {
  if (process.env.VERCEL_ENV === "production") throw new ConfigError(BILLING_NOT_SET_UP);
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_FAKE_BILLING !== "1") throw new ConfigError(BILLING_NOT_SET_UP);
}

export function billingProviderName(): BillingProviderName {
  const explicit = process.env.BILLING_PROVIDER;
  const name: BillingProviderName = explicit === "stripe" || explicit === "fake" ? explicit : process.env.STRIPE_SECRET_KEY ? "stripe" : "fake";
  if (name === "fake") assertFakeBillingAllowed();
  return name;
}

/** For display only. Never throws. */
export function billingMode(): BillingProviderName | "not_set_up" {
  try {
    return billingProviderName();
  } catch {
    return "not_set_up";
  }
}

/** The dashboard's public address. APP_URL wins; on Vercel without it, the project's production domain. */
export function appUrl(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return (process.env.APP_URL || (vercel ? `https://${vercel}` : "http://localhost:3000")).replace(/\/$/, "");
}

/** Cookies are Secure in production, except when testing a production build over plain http. */
export function secureCookies(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://");
}

/**
 * Who sends email. Resend when RESEND_API_KEY is set. EMAIL_PROVIDER=stand-in
 * keeps every email in memory instead (tests and local work); it's refused on
 * Vercel production, so real sends can never quietly go nowhere.
 */
export function emailProviderName(): "resend" | "stand-in" | "none" {
  const explicit = process.env.EMAIL_PROVIDER;
  if (explicit === "stand-in") return process.env.VERCEL_ENV === "production" ? "none" : "stand-in";
  if (explicit === "resend" || process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY ? "resend" : "none";
  return "none";
}

/** The local outbox for the stand-in, for tests and local work. Never on Vercel. */
export function devOutboxAllowed(): boolean {
  return emailProviderName() === "stand-in" && !onVercel();
}

/**
 * Which page agent answers. Claude when ANTHROPIC_API_KEY is set, otherwise the
 * offline stand-in. PAGE_AGENT=stand-in forces the stand-in (tests use it).
 */
export function pageAgentName(): "claude" | "stand-in" {
  if (process.env.PAGE_AGENT === "stand-in") return "stand-in";
  return process.env.ANTHROPIC_API_KEY ? "claude" : "stand-in";
}
