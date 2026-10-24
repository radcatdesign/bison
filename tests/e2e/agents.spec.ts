// Agents end to end, at 390 px and 1440 px: a club's gym and crew, approving a
// campaign plan and a lead reply, and a Bison Ops company's general team.
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { resetDb } from "./global-setup";

/** A new lead, as if someone just sent a form, so Front desk has someone to write back to. */
async function newLead(tenantId: string, name: string, email: string) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_MIGRATE_URL });
  await c.connect();
  try {
    await c.query("insert into contacts (tenant_id, email, name) values ($1, $2, $3)", [tenantId, email, name]);
  } finally {
    await c.end();
  }
}

const SUMMIT = "33333333-3333-4333-8333-333333333333";

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

test.describe("Agents", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("a club's crew works in the gym, and approving does the work", async ({ page }) => {
    await signIn(page, "dev_maya", "fit");
    await sampleOff(page);
    await page.goto("/agents");
    await expect(t(page, "virtual-gym").getByRole("img")).toHaveAttribute("aria-label", /Summit Strength Club/);
    await expect(t(page, "gym-mood")).toBeVisible();

    // Coach reads the week.
    await t(page, "gym-agent-coach").click();
    await page.waitForURL(/agent=coach/);
    await expect(t(page, "agent-task").first()).toContainText("Your week in numbers");

    // Marketing plans a campaign, and approving makes it.
    await t(page, "gym-agent-marketing").click();
    await page.waitForURL(/agent=marketing/);
    const plan = t(page, "agent-task").filter({ hasText: "Plan:" }).first();
    await plan.getByRole("textbox", { name: "Campaign name" }).fill("Holiday drive");
    await plan.getByTestId("agent-approve").click();
    await expect(plan.getByTestId("agent-result")).toContainText("Campaign made: Holiday drive.");
    await expect(plan.getByTestId("agent-result")).toContainText("XP");
    await plan.getByTestId("agent-result").getByRole("link", { name: "Open it" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Holiday drive");
  });

  test("a lead reply opens in your own email when sending isn't set up", async ({ page }) => {
    await signIn(page, "dev_maya", "fit");
    await sampleOff(page);
    await newLead(SUMMIT, "Rae Walker", `rae-${Date.now()}@example.com`);
    await page.goto("/agents?agent=frontdesk");
    const reply = t(page, "agent-task").filter({ hasText: "Write back to Rae Walker" });
    await expect(reply).toBeVisible();
    await expect(reply.getByTestId("agent-mailto")).toHaveAttribute("href", /^mailto:/);
    await reply.getByTestId("agent-sent-elsewhere").click();
    await expect(reply.getByTestId("agent-result")).toContainText("Sent from your own email to");
  });

  test("a Bison Ops company gets a general team, and no gym", async ({ page }) => {
    await signIn(page, "dev_ada", "bison");
    await page.goto("/agents");
    await expect(t(page, "agent-team")).toContainText("Customer care");
    await expect(t(page, "agent-team")).toContainText("Strategy");
    await expect(page.getByTestId("virtual-gym")).toHaveCount(0);
    // Sample data is on, so the work is made up and nothing sends.
    await t(page, "agent-frontdesk").click();
    await page.waitForURL(/agent=frontdesk/);
    const first = t(page, "agent-task").first();
    await first.getByTestId("agent-approve").click();
    await expect(first.getByTestId("agent-result")).toContainText("Sample data is on");
  });
});
