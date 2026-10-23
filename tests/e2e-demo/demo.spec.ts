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

test("pages: start from a template in the demo", async ({ page }) => {
  await pick(page, "dev_ada");
  await page.goto("/marketing/pages");
  await page.getByTestId("template-launch").click();
  await expect(page.getByTestId("template-preview").frameLocator('[data-testid="template-frame"]').getByRole("heading", { level: 1 })).toHaveText("Something new is on the way");
  await page.getByTestId("use-template").click();
  await expect(page.getByTestId("page-editor")).toContainText("Product launch");
  await expect(page.getByTestId("save-state")).toHaveText("Saved in this browser");
  await page.goto("/marketing/pages");
  await expect(page.getByTestId("page-card")).toHaveCount(2);
});

test("marketing: set up step by step, all in this browser", async ({ page, browser }) => {
  await pick(page, "dev_ada");
  await page.goto("/marketing/setup");
  await expect(page.getByTestId("setup-progress")).toContainText("of 17 steps done");
  await expect(page.getByTestId("step-sending.domain")).toHaveAttribute("data-next", "true");
  // Sample subscribers count, so bringing people in is already done.
  await expect(page.getByTestId("step-subscribers.add")).toHaveAttribute("data-done", "true");

  // Sending: the domain and records are pretend, and say so.
  await page.goto("/settings/email");
  await page.getByTestId("add-domain").click();
  await expect(page.getByTestId("dns-records")).toBeVisible();
  await page.getByTestId("check-domain").click();
  await expect(page.getByTestId("records-notice")).toContainText("In the demo the records count as added");
  await page.getByTestId("send-setup-test").click();
  await expect(page.getByTestId("test-notice")).toContainText("This is a demo, so nothing was sent.");

  // Brand kit: the address saves in this browser.
  await page.goto("/marketing/brand");
  // The form starts over from this browser's saved kit once the page is running.
  await expect(page.getByTestId("brand-kit")).toHaveAttribute("data-ready", "true");
  await page.locator("#bk-address").fill("12 Cove Road, Tampa, FL 33602");
  await page.getByTestId("save-brand").click();
  await expect(page.getByTestId("brand-notice")).toContainText("Saved in this browser.");

  await page.goto("/marketing/setup");
  for (const step of ["sending.domain", "sending.verify", "sending.test", "brand.look", "brand.address"]) {
    await expect(page.getByTestId(`step-${step}`)).toHaveAttribute("data-done", "true");
  }

  // The search pack's one manual step can be marked done.
  await page.getByTestId("step-search.submit").getByRole("button", { name: "Mark as done" }).click();
  await expect(page.getByTestId("step-search.submit")).toHaveAttribute("data-done", "true");

  // Someone else's browser starts over.
  const other = await browser.newPage({ baseURL: test.info().project.use.baseURL });
  await pick(other, "dev_ada");
  await other.goto("/marketing/setup");
  await expect(other.getByTestId("step-sending.domain")).toHaveAttribute("data-next", "true");
  await other.close();
});

test("marketing: build a newsletter from a template and pretend to send it", async ({ page }) => {
  await pick(page, "dev_ada");
  await page.goto("/marketing/newsletters");
  await expect(page.getByTestId("newsletter-row")).toHaveCount(1);
  await page.getByTestId("newsletter-template-t-letter").click();
  await page.waitForURL(/\/marketing\/newsletters\/(?!$).+/);
  await expect(page.getByTestId("problem-count")).toHaveText("2 to fix");
  await page.getByTestId("btab-email").click();
  await page.locator("#email-subject").fill("Pool season, {first name}");
  await page.getByTestId("btab-sections").click();
  await page.getByTestId("email-section").first().locator("button").first().click();
  await page.getByTestId("email-section-form-text").getByLabel("Text", { exact: true }).fill("Hi {first name},\n\nOpening day is booking up. [Book yours](https://brightwaterpools.com/book).");
  await expect(page.getByTestId("problem-count")).toHaveCount(0);
  await expect(page.getByTestId("save-state")).toHaveText("Saved in this browser");

  await page.getByTestId("open-send").click();
  await page.getByTestId("confirm-send").click();
  // Marked as sent in this browser, then back to the list.
  await page.waitForURL(/\/marketing\/newsletters$/);
  await expect(page.getByTestId("newsletter-row")).toHaveCount(2);
  await expect(page.getByTestId("newsletter-row").first()).toContainText("Pool season");
  await expect(page.getByTestId("newsletter-row").first()).toContainText("Sent");
  await page.getByTestId("newsletter-row").first().click();
  await expect(page.getByTestId("demo-sent")).toContainText("This one went out.");
});

test("marketing: subscribers, series, offer and search pack show sample data and their steps", async ({ page }) => {
  await pick(page, "dev_ada");
  await page.goto("/marketing/subscribers");
  await expect(page.getByTestId("subscriber-row").first()).toBeVisible();
  await expect(page.getByTestId("setup-subscribers")).toBeVisible();
  await page.goto("/marketing/series");
  await expect(page.getByTestId("series-card").first()).toBeVisible();
  await page.goto("/marketing/offer");
  await expect(page.getByTestId("code-row").first()).toBeVisible();
  await page.goto("/marketing/search");
  await expect(page.getByTestId("file-sitemap.xml")).toBeVisible();
  await expect(page.getByTestId("robots-lines")).toBeVisible();

  // Business details save in this browser and tick off their steps.
  await expect(page.getByTestId("search-business")).toHaveAttribute("data-ready", "true");
  await page.locator("#search-description").fill("We build and light pools around Tampa Bay.");
  await page.locator("#search-phone").fill("+1 813 555 0100");
  await page.getByTestId("save-search").click();
  await expect(page.getByTestId("search-message")).toHaveText("Saved in this browser.");
  await expect(page.getByTestId("step-search.describe")).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("step-search.contact")).toHaveAttribute("data-done", "true");
});
