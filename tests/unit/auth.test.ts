import { afterEach, describe, expect, it, vi } from "vitest";
import { createDevSession, readDevSession } from "@/lib/auth/dev-session";
import { authProvider, billingMode, billingProviderName, clerkConfigured, ConfigError, demoMode } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dev session cookie", () => {
  it("reads back what it signed", () => {
    const { value } = createDevSession("dev_ada", "11111111-1111-4111-8111-111111111111");
    expect(readDevSession(value)).toMatchObject({ u: "dev_ada", t: "11111111-1111-4111-8111-111111111111" });
  });

  it("rejects a cookie that was edited to another tenant", () => {
    const { value } = createDevSession("dev_ada", "11111111-1111-4111-8111-111111111111");
    const [body, sig] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), t: "22222222-2222-4222-8222-222222222222" })).toString("base64url");
    expect(readDevSession(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects expired and malformed cookies", () => {
    const { value } = createDevSession("dev_ada", "t", Date.now() - 8 * 86_400_000);
    expect(readDevSession(value)).toBeNull();
    expect(readDevSession("nonsense")).toBeNull();
    expect(readDevSession(undefined)).toBeNull();
  });
});

describe("auth provider", () => {
  it("never allows the dev sign-in on any Vercel deployment, previews included", () => {
    vi.stubEnv("AUTH_PROVIDER", "dev");
    vi.stubEnv("ALLOW_DEV_AUTH", "1");
    for (const env of ["production", "preview", "development"]) {
      vi.stubEnv("VERCEL_ENV", env);
      expect(() => authProvider(), env).toThrow(ConfigError);
    }
  });

  it("only accepts dev sessions for made-up people", () => {
    const { value } = createDevSession("user_2abcRealClerkId", "11111111-1111-4111-8111-111111111111");
    expect(readDevSession(value)).toBeNull();
  });

  it("needs ALLOW_DEV_AUTH to run the dev sign-in in a production build", () => {
    vi.stubEnv("AUTH_PROVIDER", "dev");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_AUTH", "");
    expect(() => authProvider()).toThrow(ConfigError);
    vi.stubEnv("ALLOW_DEV_AUTH", "1");
    expect(authProvider()).toBe("dev");
  });

  it("uses Clerk when its secret key is set and nothing else is chosen", () => {
    vi.stubEnv("AUTH_PROVIDER", "");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    expect(authProvider()).toBe("clerk");
  });
});

describe("billing provider", () => {
  it("never falls back to test billing on Vercel production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("BILLING_PROVIDER", "");
    vi.stubEnv("ALLOW_FAKE_BILLING", "1");
    expect(() => billingProviderName()).toThrow(ConfigError);
    vi.stubEnv("BILLING_PROVIDER", "fake");
    expect(() => billingProviderName()).toThrow(ConfigError);
    expect(billingMode()).toBe("not_set_up");
  });

  it("needs ALLOW_FAKE_BILLING to use test billing in a production build", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BILLING_PROVIDER", "fake");
    vi.stubEnv("ALLOW_FAKE_BILLING", "");
    expect(() => billingProviderName()).toThrow(ConfigError);
    vi.stubEnv("ALLOW_FAKE_BILLING", "1");
    expect(billingProviderName()).toBe("fake");
  });

  it("uses Stripe when its key is set", () => {
    vi.stubEnv("BILLING_PROVIDER", "");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    expect(billingProviderName()).toBe("stripe");
  });
});

describe("demo mode", () => {
  it("only turns on when there's no database to reach", () => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("DATABASE_URL", "postgres://bisonops_app:x@db/bisonops");
    expect(demoMode()).toBe(false);
    vi.stubEnv("DATABASE_URL", "");
    expect(demoMode()).toBe(true);
  });

  it("uses the made-up people on Vercel, and never Clerk", () => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_live_x");
    expect(clerkConfigured()).toBe(false);
    expect(authProvider()).toBe("dev");
  });

  it("leaves the dev sign-in off Vercel when demo mode is off", () => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("DATABASE_URL", "postgres://bisonops_app:x@db/bisonops");
    vi.stubEnv("AUTH_PROVIDER", "dev");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => authProvider()).toThrow(ConfigError);
  });
});

describe("demo sessions", () => {
  it("work without DEV_AUTH_SECRET only in demo mode", () => {
    vi.stubEnv("DEV_AUTH_SECRET", "");
    vi.stubEnv("DEMO_MODE", "");
    expect(() => createDevSession("dev_ada", "t")).toThrow("DEV_AUTH_SECRET");
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("DATABASE_URL", "");
    expect(readDevSession(createDevSession("dev_ada", "t").value)).toMatchObject({ u: "dev_ada" });
  });
});
