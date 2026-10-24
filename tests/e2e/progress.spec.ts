// XP, levels and achievements end to end, at 390 px and 1440 px.
import { expect, type Page, test } from "@playwright/test";
import { resetDb } from "./global-setup";

const t = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 760;

test.describe("Progress", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("making a campaign earns XP and an achievement, shown on Progress and in the nav", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByTestId("sign-in-dev_ada").click();
    await page.waitForURL(/\/(analyze|marketing|sales)/);
    await page.goto("/progress");
    await expect(t(page, "progress-level")).toContainText("Level");
    await expect(t(page, "achievement-first-campaign")).toContainText("Not yet");

    await page.goto("/marketing/campaigns");
    await t(page, "campaign-name").fill("Spring launch");
    await t(page, "campaign-new-form").getByRole("button", { name: "Make the campaign" }).click();
    await page.waitForURL(/\/marketing\/campaigns\/[0-9a-f-]{36}$/);
    // Archiving an empty campaign earns nothing, and says nothing about XP.
    await t(page, "campaign-archive").getByRole("button", { name: "Archive" }).click();
    await expect(t(page, "campaign-archive").getByTestId("action-message")).toHaveText("Archived. Everything in it stays filed here.");

    await page.goto("/progress");
    await expect(t(page, "achievement-first-campaign")).toContainText("Earned");
    await expect(t(page, "progress-recent")).toContainText("Spring launch");
    await expect(t(page, "progress-recent")).toContainText("+2");
    if (isPhone(page)) {
      await page.getByRole("button", { name: "Menu" }).click();
      await expect(page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: /Progress, level \d+/ })).toBeVisible();
    } else {
      await expect(t(page, "level-chip")).toContainText(/Level \d+/);
    }
  });

  test("clubs see their own goals, like the front desk", async ({ page }) => {
    await page.goto("/sign-in?edition=fit");
    await page.getByTestId("sign-in-dev_maya").click();
    await page.waitForURL(/\/(analyze|marketing|sales)/);
    await page.goto("/progress");
    await expect(t(page, "achievement-front-desk")).toBeVisible();
    await expect(t(page, "progress-rules")).toContainText("Publish a funnel page");
  });
});
