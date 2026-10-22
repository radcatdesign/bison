// The public demo, run the way Vercel runs it: production build, no database.
import { expect, type Page, test } from "@playwright/test";

async function pick(page: Page, userId: string) {
  await page.goto("/sign-in");
  await page.getByTestId(`sign-in-${userId}`).click();
  await page.waitForURL(/\/(analyze|marketing|sales)/);
}

test("anyone can pick a made-up person and look around", async ({ page }) => {
  await pick(page, "dev_ada");
  await expect(page.getByTestId("tenant-name")).toHaveText("Brightwater Pools");
  await expect(page.getByTestId("sample-banner")).toContainText("This is a demo");
  await expect(page.getByTestId("metric-visitors")).toBeVisible();
  await page.goto("/analyze/contacts");
  await page.getByTestId("contact-row").first().click();
  await expect(page.getByTestId("contact-panel")).toBeVisible();
});

test("nothing is saved", async ({ page }) => {
  await pick(page, "dev_ada");
  await page.goto("/analyze/contacts");
  await page.getByTestId("contact-row").first().click();
  await page.getByTestId("contact-panel").getByLabel("Status").selectOption("won");
  await expect(page.getByTestId("action-message")).toHaveText("This is a demo with made-up data, so nothing is saved.");
  await page.goto("/settings/billing?item=module:sales");
  await page.getByTestId("start-trial").getByRole("button").click();
  await expect(page.getByTestId("action-message")).toHaveText("This is a demo with made-up data, so nothing is saved.");
  await page.goto("/settings");
  await expect(page.getByTestId("sample-toggle")).toBeDisabled();
});

test("each company sees only itself, with locked modules", async ({ page }) => {
  await pick(page, "dev_cora");
  await expect(page.getByTestId("tenant-name")).toHaveText("Ridgeline Roasters");
  await expect(page.locator("#main")).not.toContainText("/glow-aggregate");
  await page.goto("/sales");
  await expect(page.getByTestId("locked")).toBeVisible();
  await page.goto("/settings");
  await expect(page.locator("#team")).not.toContainText("brightwaterpools.com");
});

test("roles still apply", async ({ page }) => {
  await pick(page, "dev_dana");
  await page.goto("/marketing");
  await expect(page.getByTestId("role-blocked")).toBeVisible();
});

test("signed-out visitors land on the picker", async ({ page }) => {
  await page.goto("/analyze");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText("Two made-up companies")).toBeVisible();
});

test("landing pages preview made-up sites, never a real domain", async ({ page }) => {
  await pick(page, "dev_cora");
  await page.goto("/analyze/pages");
  const tile = page.getByTestId("landing-page").first();
  await expect(tile.locator("iframe")).toHaveAttribute("src", /^\/sample-site\/coffee/);
  await expect(tile.getByTestId("preview-loading")).toHaveCount(0);
  await expect(tile.frameLocator("iframe").getByText("Ridgeline Roasters").first()).toBeVisible();
});
