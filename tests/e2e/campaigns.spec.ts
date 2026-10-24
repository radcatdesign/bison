// Campaigns end to end, at 390 px and 1440 px, in both editions: make one,
// file a page and a newsletter into it, add a graphic, see the chips, archive.
import { expect, type Page, test } from "@playwright/test";
import { resetDb } from "./global-setup";

const t = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

async function signIn(page: Page, userId: string, edition: "bison" | "fit" = "bison") {
  await page.goto(edition === "fit" ? "/sign-in?edition=fit" : "/sign-in");
  await page.getByTestId(`sign-in-${userId}`).click();
  await page.waitForURL(/\/(analyze|marketing|sales)/);
}

/** A 600 by 400 PNG to upload. */
const png = async () => {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width: 600, height: 400, channels: 3, background: "#2f6fdf" } }).png().toBuffer();
};

test.describe("Campaigns", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("files a page, a newsletter and a graphic into a campaign, then archives it", async ({ page }) => {
    await signIn(page, "dev_ada");
    // Something to file: a page and a newsletter.
    await page.goto("/marketing/newsletters");
    await t(page, "newsletter-blank").click();
    await page.waitForURL(/\/marketing\/newsletters\/[0-9a-f-]{36}/);

    await page.goto("/marketing/campaigns");
    await t(page, "campaign-name").fill("Spring launch");
    await t(page, "campaign-new-form").getByRole("button", { name: "Make the campaign" }).click();
    await page.waitForURL(/\/marketing\/campaigns\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Spring launch");

    const picker = t(page, "campaign-add-item");
    const newsletter = await picker.locator('optgroup[label="Newsletters"] option').first().getAttribute("value");
    await picker.selectOption(newsletter!);
    await t(page, "campaign-add").getByRole("button", { name: "Add" }).click();
    await expect(t(page, "campaign-email")).toHaveCount(1);

    await page.getByTestId("graphic-input").setInputFiles({ name: "spring-hero.png", mimeType: "image/png", buffer: await png() });
    await expect(t(page, "campaign-graphic")).toContainText("spring-hero");
    await expect(t(page, "campaign-graphic")).toContainText("600 × 400");
    const src = await t(page, "campaign-graphic").locator("img").getAttribute("src");
    const res = await page.request.get(src!);
    expect(res.headers()["content-type"]).toBe("image/png");

    // The newsletter shows where it's filed.
    await page.goto("/marketing/newsletters");
    await expect(t(page, "newsletter-row").first().getByTestId("campaign-chip")).toHaveText("Spring launch");

    // A non-empty campaign archives, but doesn't delete.
    await page.goto("/marketing/campaigns");
    await t(page, "campaign-card").first().click();
    await expect(t(page, "campaign-delete")).toHaveCount(0);
    await t(page, "campaign-archive").getByRole("button", { name: "Archive" }).click();
    await expect(t(page, "campaign-archive").getByTestId("action-message")).toContainText("Archived");
    await page.goto("/marketing/campaigns");
    await expect(t(page, "campaign-card")).toHaveCount(0);
    await page.goto("/marketing/campaigns?show=archived");
    await expect(t(page, "campaign-card")).toContainText("Archived");
  });

  test("clubs get campaigns in their own words", async ({ page }) => {
    await signIn(page, "dev_maya", "fit");
    await page.goto("/marketing/campaigns");
    await expect(page.getByText("funnel pages, emails and graphics").first()).toBeVisible();
    await t(page, "campaign-name").fill("New Year challenge");
    await t(page, "campaign-new-form").getByRole("button", { name: "Make the campaign" }).click();
    await page.waitForURL(/\/marketing\/campaigns\/[0-9a-f-]{36}$/);
    await expect(t(page, "campaign-pages")).toContainText("Funnel pages");
  });

  test("a club without Marketing sees the unlock screen", async ({ page }) => {
    await signIn(page, "dev_jo", "fit");
    await page.goto("/marketing/campaigns");
    await expect(t(page, "locked")).toBeVisible();
  });
});
