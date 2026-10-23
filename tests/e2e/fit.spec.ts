// Fit Funnels end to end, at 390 px and 1440 px: the sign-in switch, a club's
// own name, mark, color and words, and its tools working the same as Bison Ops.
import { expect, type Page, test } from "@playwright/test";
import { resetDb } from "./global-setup";

const t = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 760;

async function signIn(page: Page, userId: "dev_maya" | "dev_theo" | "dev_jo" | "dev_sam") {
  await page.goto("/sign-in?edition=fit");
  await page.getByTestId(`sign-in-${userId}`).click();
  await page.waitForURL(/\/(analyze|marketing|sales)/);
}

/** Nav links: the sidebar on desktop, the menu sheet on phones. */
async function navLabels(page: Page): Promise<string[]> {
  if (isPhone(page)) {
    await page.getByRole("button", { name: "Menu" }).click();
    const labels = await page.getByRole("dialog", { name: "Menu" }).getByRole("link").allTextContents();
    await page.getByRole("button", { name: "Close menu" }).click();
    return labels.map((l) => l.trim());
  }
  return (await page.getByRole("navigation", { name: /pages$/ }).getByRole("link").allTextContents()).map((l) => l.trim());
}

test.describe("Fit Funnels", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("the sign-in switches editions and lists each edition's made-up people", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(t(page, "edition-bison")).toHaveAttribute("aria-current", "page");
    await expect(t(page, "sign-in-dev_ada")).toBeVisible();
    await expect(t(page, "sign-in-dev_maya")).toHaveCount(0);

    await t(page, "edition-fit").click();
    await expect(page).toHaveURL(/edition=fit/);
    await expect(t(page, "edition-fit")).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Pick a person to see Fit Funnels")).toBeVisible();
    for (const id of ["dev_maya", "dev_theo", "dev_jo", "dev_sam"]) await expect(t(page, `sign-in-${id}`)).toBeVisible();
    await expect(t(page, "sign-in-dev_ada")).toHaveCount(0);
  });

  test("a club sees its own name, mark, color and words", async ({ page }) => {
    await signIn(page, "dev_maya");
    await expect(page).toHaveTitle(/· Fit Funnels$/);
    await expect(t(page, "tenant-name")).toHaveText("Summit Strength Club");
    await expect(page.locator('[data-edition="fit"]').first()).toBeVisible();
    await expect(page.locator('[data-mark="fit"]').first()).toBeVisible();
    const accent = await page.locator('[data-edition="fit"]').first().evaluate((el) => getComputedStyle(el).getPropertyValue("--bo-accent").trim());
    expect(accent).toBe("#f76b15");
    const icon = await page.locator('link[rel="icon"]').first().getAttribute("href");
    expect(icon).toContain("/brand/fit-icon.svg");

    await page.goto("/analyze");
    expect(await navLabels(page)).toContain("Leads");
    await page.goto("/marketing");
    expect(await navLabels(page)).toEqual(expect.arrayContaining(["Funnel pages", "Intro offer", "A/B tests"]));
    await page.goto("/sales");
    expect(await navLabels(page)).toEqual(expect.arrayContaining(["Quotes", "Purchases", "Memberships", "Promo codes", "Corporate accounts", "Unfinished joins"]));
    // Sales isn't on Summit's plan yet, so it shows the club's pitch to unlock it.
    await expect(t(page, "locked")).toContainText("Membership sales");

    // Signing out goes back to the Fit Funnels sign-in.
    if (isPhone(page)) {
      await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Sign out" }).click();
    } else {
      await page.getByRole("button", { name: /Account/ }).filter({ visible: true }).first().click();
      await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).click();
    }
    await expect(page).toHaveURL(/\/sign-in\?edition=fit/);
  });

  test("Bison Ops companies are unchanged", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByTestId("sign-in-dev_ada").click();
    await page.waitForURL(/\/(analyze|marketing|sales)/);
    await expect(page).toHaveTitle(/· Bison Ops$/);
    await expect(page.locator('[data-mark="bison"]').first()).toBeVisible();
    await page.goto("/sales");
    expect(await navLabels(page)).toEqual(expect.arrayContaining(["Estimates", "Orders", "Products", "Discount codes", "Trade accounts", "Carts"]));
  });
});
