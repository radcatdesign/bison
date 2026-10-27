// Boosts end to end, at 390 px and 1440 px: a club switches some on, the kiosk
// picks them up, a review ask needs its link, and Bison Ops has no Boosts.
import { expect, type Page, test } from "@playwright/test";
import { resetDb } from "./global-setup";

const t = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

async function signIn(page: Page, userId: string, edition: "bison" | "fit") {
  await page.goto(edition === "fit" ? "/sign-in?edition=fit" : "/sign-in");
  await page.getByTestId(`sign-in-${userId}`).click();
  await page.waitForURL(/\/(analyze|marketing|sales)/);
}

async function sampleOff(page: Page) {
  await page.goto("/settings");
  await t(page, "sample-toggle").uncheck();
  await expect(t(page, "sample-form").getByTestId("action-message")).toContainText("Sample data is off");
}

test.describe("Boosts", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("a club switches boosts on and the kiosk shows them", async ({ page }) => {
    await signIn(page, "dev_maya", "fit");
    await sampleOff(page);
    await page.goto("/boosts");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Boosts");
    await expect(t(page, "boost-on-count")).toContainText("0");
    // Nothing on the page pushes it wider than the screen.
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]);

    const friend = t(page, "boost-bring-a-friend");
    await friend.getByTestId("boost-switch-bring-a-friend").check();
    await expect(friend.getByTestId("action-message")).toContainText("Bring a friend is on.");
    await expect(friend.getByTestId("action-message")).toContainText("XP");
    await expect(friend).toHaveAttribute("data-on", "true");
    await expect(t(page, "boost-on-count")).toContainText("1");

    const milestones = t(page, "boost-milestones");
    await milestones.getByTestId("boost-switch-milestones").check();
    await expect(milestones.getByTestId("action-message")).toContainText("Milestone shout-outs is on.");

    // Settings save as soon as they change.
    const miss = t(page, "boost-miss-you");
    await miss.getByTestId("boost-days-miss-you").selectOption("21");
    await expect(miss.getByTestId("action-message")).toContainText("We miss you is off.");
    await miss.getByTestId("boost-switch-miss-you").check();
    await expect(miss.getByTestId("action-message")).toContainText("Drafts show up in Agents");
    await page.reload();
    await expect(t(page, "boost-days-miss-you")).toHaveValue("21");
    await expect(t(page, "boost-on-count")).toContainText("3");

    // A review ask needs the club's review link first.
    const review = t(page, "boost-review-ask");
    await review.getByTestId("boost-switch-review-ask").check();
    await expect(review.getByTestId("action-message")).toContainText("Add your review link first");
    await expect(review.getByTestId("boost-switch-review-ask")).not.toBeChecked();
    await review.getByTestId("boost-link-review-ask").fill("https://g.page/r/summit/review");
    await review.getByTestId("boost-switch-review-ask").check();
    await expect(review.getByTestId("action-message")).toContainText("Review requests is on.");

    // The kiosk picks them up.
    await page.goto("/kiosk/preview");
    await page.getByTestId("kiosk-tile-friend").click();
    const form = page.getByTestId("kiosk-friend-form");
    await form.getByLabel("Your phone number or email").fill("dana@example.com");
    await form.getByLabel("Your friend's name").fill("Sam Lee");
    await form.getByLabel("Their email").fill("sam@example.com");
    await form.getByRole("button", { name: "Send my friend" }).click();
    await expect(page.getByTestId("kiosk-done")).toContainText("say you sent them");
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByTestId("kiosk-tile-checkin").click();
    await page.getByTestId("kiosk-checkin-form").getByLabel("Phone number").fill("5415550142");
    await page.getByTestId("kiosk-checkin-form").getByRole("button", { name: "Check in" }).click();
    await expect(page.getByTestId("kiosk-milestone")).toContainText("Visit 25");
    await expect(page.getByTestId("kiosk-streak")).toHaveCount(0);
  });

  test("only owners and admins can switch them, and Bison Ops has none", async ({ page }) => {
    await signIn(page, "dev_theo", "fit");
    await page.goto("/boosts");
    await expect(t(page, "boost-switch-streaks")).toBeDisabled();

    await page.context().clearCookies();
    await signIn(page, "dev_ada", "bison");
    await expect(page.getByRole("link", { name: "Boosts", exact: true })).toHaveCount(0);
    await page.goto("/boosts");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });
});
