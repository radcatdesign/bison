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

test("an owner can unlock Sales and Marketing, just in their own browser", async ({ page, browser }) => {
  await pick(page, "dev_cora");

  // Sales: Unlock, start a trial, open it
  await page.goto("/sales");
  await page.getByTestId("unlock").click();
  await expect(page.getByTestId("billing")).toBeVisible();
  await page.getByTestId("start-trial").getByRole("button").click();
  await expect(page.getByTestId("billing-status")).toHaveText("On as a trial. 14 days left.");
  await page.getByTestId("open-mode").click();
  await expect(page.getByTestId("module-sales")).toBeVisible();
  await expect(page.getByTestId("module-sales")).toContainText("Sales trial: 14 days left.");

  // Marketing: subscribe, no card
  await page.goto("/marketing");
  await page.getByTestId("unlock").click();
  await page.getByTestId("subscribe").getByRole("button").click();
  await expect(page.getByTestId("billing-status")).toHaveText("On.");
  await expect(page.getByTestId("subscribe")).toHaveCount(0);
  await page.getByTestId("open-mode").click();
  await expect(page.getByTestId("module-marketing")).toBeVisible();

  // Still on after a reload, and the plan says so
  await page.goto("/settings");
  await expect(page.getByTestId("plan-module:sales")).toContainText("Trial, 14 days left");
  await expect(page.getByTestId("plan-module:marketing")).toContainText("On");

  // The other company is untouched
  await pick(page, "dev_ada");
  await page.goto("/sales");
  await expect(page.getByTestId("locked")).toBeVisible();

  // Someone else visiting the demo starts from the beginning
  const other = await browser.newPage({ baseURL: test.info().project.use.baseURL });
  await pick(other, "dev_cora");
  await other.goto("/sales");
  await expect(other.getByTestId("locked")).toBeVisible();
  await other.close();

  // Reset puts Ridgeline back the way it started
  await pick(page, "dev_cora");
  await page.goto("/settings/billing?item=module:sales");
  await page.getByTestId("reset-demo").getByRole("button").click();
  await expect(page.getByTestId("billing-status")).toHaveText("Your data stays put whether it's on or off.");
  await page.goto("/sales");
  await expect(page.getByTestId("locked")).toBeVisible();
  await page.goto("/marketing");
  await expect(page.getByTestId("locked")).toBeVisible();
});

test("people who can't change the plan still can't in the demo", async ({ page }) => {
  await pick(page, "dev_ben");
  await page.goto("/settings/billing?item=module:sales");
  await expect(page.getByText("Only an owner can change the plan.")).toBeVisible();
  await expect(page.getByTestId("start-trial")).toHaveCount(0);
});

test("pages: an example to open, the agent builds new ones, and they stay in this browser", async ({ page, browser }) => {
  await pick(page, "dev_ada");
  await page.goto("/marketing/pages");
  await expect(page.getByTestId("page-card")).toHaveCount(1);
  await expect(page.getByTestId("page-card")).toContainText("Spring glow sale");

  // The example is finished, but the demo can't put it live.
  await page.getByTestId("page-card").click();
  await expect(page.getByTestId("page-editor")).toBeVisible();
  // The preview really shows the page.
  if ((page.viewportSize()?.width ?? 0) < 760) await page.getByTestId("tab-preview").click();
  await expect(page.frameLocator('[data-testid="builder-frame"]').getByRole("heading", { level: 1 })).toHaveText("Your pool, lit from within");
  if ((page.viewportSize()?.width ?? 0) < 760) await page.getByTestId("tab-agent").click();
  await page.getByTestId("publish").click();
  await expect(page.getByTestId("editor-notice")).toContainText("This is a demo, so pages can't go live");

  // A new page from a brief.
  await page.goto("/marketing/pages");
  await page.locator("#new-page-prompt").fill("A page to book a free pool design consultation");
  await page.getByTestId("build-page").click();
  await expect(page.getByTestId("agent-reply").last()).toHaveAttribute("data-state", "done", { timeout: 20_000 });
  await expect(page.getByTestId("stand-in-note")).toBeVisible();
  await expect(page.getByTestId("save-state")).toHaveText("Saved in this browser");
  await page.goto("/marketing/pages");
  await expect(page.getByTestId("page-card")).toHaveCount(2);

  // Someone else's browser starts from the example only.
  const other = await browser.newPage({ baseURL: test.info().project.use.baseURL });
  await pick(other, "dev_ada");
  await other.goto("/marketing/pages");
  await expect(other.getByTestId("page-card")).toHaveCount(1);
  await other.close();
});
