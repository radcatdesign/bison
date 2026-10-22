import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// Same .env.test as the unit and database tests.
(process.env as Record<string, string | undefined>).NODE_ENV ??= "test";
loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
// Use an installed browser by default (pnpm exec playwright install chromium).
// PW_CHROMIUM_PATH points at another Chromium when the standard download isn't available.
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] } : {};

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "tests/e2e/global-setup.ts",
  // Tests share one seeded database and some change it, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure", launchOptions },
  projects: [
    { name: "phone", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { ...(process.env as Record<string, string>), NODE_ENV: "production", ALLOW_DEV_AUTH: "1", ALLOW_FAKE_BILLING: "1", APP_URL: baseURL },
  },
});
