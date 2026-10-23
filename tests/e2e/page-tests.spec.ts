// Marketing > A/B tests, at 390 px and 1440 px: start a test on a live page,
// change B in the editor, start it, have visitors see both versions, count a
// form send on B, and end the test keeping B, which then goes live.
// The agent is the offline stand-in; visitors are fresh browsers with their own
// network address and an ordinary (not headless) browser name, so they count.
import { type Browser, expect, type Page, test } from "@playwright/test";
import { resetDb } from "./global-setup";

const t = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 760;

async function signIn(page: Page, userId: "dev_ada" | "dev_ben" | "dev_cora" | "dev_dana") {
  await page.goto("/sign-in");
  await page.getByTestId(`sign-in-${userId}`).click();
  await page.waitForURL(/\/(analyze|marketing|sales)/);
}

const UA = (n: number) => `Mozilla/5.0 (Macintosh; Intel Mac OS X 14_${n}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15`;
const NEW_HEADLINE = "Book a free planning call this week";

/** A visitor with their own address and browser. No session, so they count. */
async function visitor(browser: Browser, baseURL: string, n: number) {
  const context = await browser.newContext({ baseURL, userAgent: UA(n), extraHTTPHeaders: { "x-real-ip": `203.0.113.${n}` } });
  return { context, page: await context.newPage() };
}

test.describe("A/B tests", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("test a new headline, count form sends on each version, and keep the winner", async ({ page, browser, baseURL }) => {
    await signIn(page, "dev_ada");

    // A live page to test: the Simple contact template, published as is.
    await page.goto("/marketing/pages");
    await page.getByTestId("template-simple").click();
    await page.getByTestId("use-template").click();
    await page.waitForURL(/\/marketing\/pages\/[0-9a-f-]{36}$/);
    await page.getByTestId("publish").click();
    await expect(page.getByTestId("page-status")).toHaveText("Live");
    const liveUrl = new URL((await page.getByTestId("editor-notice").getByRole("link").getAttribute("href"))!).pathname;

    // The setup steps are on the tests page, and the new test starts on that page.
    await page.goto("/marketing/tests");
    await expect(t(page, "setup-tests")).toBeVisible();
    await expect(t(page, "step-tests.page")).toHaveAttribute("data-done", "true");
    await t(page, "new-test").click();
    const dialog = t(page, "new-test-dialog");
    await expect(dialog.getByTestId("new-test-page")).toContainText("Simple contact");
    await dialog.getByTestId("new-test-name").fill("Say what you get");
    await dialog.getByTestId("create-test").click();
    await page.waitForURL(/\/marketing\/tests\/[0-9a-f-]{36}$/);
    const testUrl = new URL(page.url()).pathname;
    await expect(t(page, "test-status")).toHaveText("Setting up");
    await expect(t(page, "start-checklist")).toContainText("B is the same as the live page. Change something to test.");
    await expect(t(page, "start-test")).toBeDisabled();

    // Change B's headline in the editor. It saves to the test, never the page.
    await t(page, "edit-version-b").click();
    await page.waitForURL(/\/marketing\/tests\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
    await expect(t(page, "page-status")).toHaveText("Version B");
    await expect(t(page, "publish")).toHaveCount(0);
    await t(page, "tab-sections").click();
    await page.getByTestId("section-item").first().getByRole("button").first().click();
    await page.getByTestId("section-form-hero").getByLabel("Headline", { exact: true }).fill(NEW_HEADLINE);
    await expect(t(page, "save-state")).toHaveText("Saved");
    await t(page, "version-done").click();
    await page.waitForURL((u) => u.pathname === testUrl);
    await expect(t(page, "version-change-b")).toHaveText("Changes the hero headline.");

    // Name B and give it a 50/50 split, then start.
    await t(page, "version-name-b").fill("Says what you get");
    await t(page, "save-test").click();
    await expect(t(page, "test-notice")).toHaveText("Saved");
    await expect(t(page, "start-checklist")).toContainText("Visitors split 50% A, 50% B.");
    await t(page, "start-test").click();
    await expect(t(page, "test-status")).toHaveText("Running, day 1");
    // Brightwater has sample data on, so the results are made up and say so.
    await expect(t(page, "sample-results")).toBeVisible();

    // With sample data off, the real results start from nothing.
    await page.goto("/settings");
    await page.getByTestId("sample-toggle").uncheck();
    await expect(page.getByTestId("action-message")).toContainText("Sample data is off");
    await page.goto(testUrl);
    await expect(t(page, "sample-results")).toHaveCount(0);
    await expect(t(page, "verdict-sentence")).toContainText("No visitors yet");

    // While it runs, the page itself can't be published.
    const pageHref = await page.getByRole("link", { name: "Simple contact" }).first().getAttribute("href");
    await page.goto(pageHref!);
    await expect(t(page, "editor-notice")).toContainText('This page is in the A/B test "Say what you get"');
    await expect(t(page, "publish")).toBeDisabled();

    // Visitors: each sees one version, the same one when they come back. One who sees B sends the form.
    const seen = { a: 0, b: 0 };
    let sentOnB = false;
    for (let n = 1; n <= 16 && !(seen.a && seen.b && sentOnB); n++) {
      const v = await visitor(browser, baseURL!, n);
      await v.page.goto(liveUrl);
      const h1 = (await v.page.getByRole("heading", { level: 1 }).textContent())?.trim();
      const isB = h1 === NEW_HEADLINE;
      seen[isB ? "b" : "a"]++;
      await v.page.reload();
      await expect(v.page.getByRole("heading", { level: 1 })).toHaveText(h1!);
      if (isB && !sentOnB) {
        const form = v.page.getByTestId("page-form");
        await form.getByLabel("Email", { exact: true }).fill(`ab-${n}@example.com`);
        for (const label of ["Name", "Message"]) {
          const field = form.getByLabel(label, { exact: true });
          if (await field.count()) await field.fill("Testing");
        }
        await v.page.waitForTimeout(1600);
        await form.getByRole("button").click();
        await expect(v.page.getByTestId("page-form-done")).toBeVisible();
        sentOnB = true;
      }
      await v.context.close();
    }
    expect(seen.a).toBeGreaterThan(0);
    expect(seen.b).toBeGreaterThan(0);
    expect(sentOnB).toBe(true);

    // The team's own visits don't count.
    await page.goto(liveUrl);

    // Results: every visitor once, and B's form send.
    await page.goto(testUrl);
    const total = seen.a + seen.b;
    await expect(t(page, "metric-visitors")).toContainText(String(total));
    await expect(t(page, "result-b")).toContainText(String(seen.b));
    if (!isPhone(page)) await expect(t(page, "metric-conversions")).toContainText("1");
    await expect(t(page, "test-verdict")).toContainText("Too early to tell");

    // End it, keeping B. B goes live.
    await t(page, "end-test").click();
    await t(page, "end-dialog").getByTestId("keep-b").check();
    await t(page, "end-test-confirm").click();
    await expect(t(page, "test-notice")).toContainText("Ended. B is live now");
    await expect(t(page, "test-status")).toHaveText("Ended, kept B");
    const after = await visitor(browser, baseURL!, 99);
    await after.page.goto(liveUrl);
    await expect(after.page.getByRole("heading", { level: 1 })).toHaveText(NEW_HEADLINE);
    await after.context.close();

    // The list shows it ended.
    await page.goto("/marketing/tests");
    await expect(t(page, "test-row").first()).toContainText("Ended, kept B");
  });

  test("only roles with Marketing see tests", async ({ page }) => {
    for (const who of ["dev_ben", "dev_dana"] as const) {
      await page.context().clearCookies();
      await signIn(page, who);
      await page.goto("/marketing/tests");
      await expect(page.getByTestId("role-blocked")).toBeVisible();
    }
  });
});
