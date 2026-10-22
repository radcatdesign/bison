import { defineConfig, devices } from "@playwright/test";

// The public demo: built and run with no database, as Vercel would run it.
const PORT = Number(process.env.E2E_DEMO_PORT ?? 3200);
const baseURL = `http://localhost:${PORT}`;
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--no-sandbox"] } : {};
const demoEnv = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  NODE_ENV: "production",
  DEMO_MODE: "1",
  DATABASE_URL: "",
  VERCEL_ENV: "production",
  // No DEV_AUTH_SECRET on purpose: DEMO_MODE=1 should be the only setting a demo needs.
  APP_URL: baseURL,
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "tests/e2e-demo",
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, launchOptions },
  projects: [
    { name: "phone", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    // Rebuilds .next with demo settings. Run it after, not alongside, pnpm test:e2e.
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: demoEnv,
  },
});
