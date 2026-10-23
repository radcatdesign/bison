// Marketing > Pages, at 390 px and 1440 px: describe a page, watch the agent
// build it, edit it by hand, publish it, and see its form land in Contacts.
// The agent is the offline stand-in here (PAGE_AGENT=stand-in), never Claude.
import { expect, type Page, test } from "@playwright/test";
import { resetDb } from "./global-setup";

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 760;

async function signIn(page: Page, userId: "dev_ada" | "dev_ben" | "dev_cora" | "dev_dana") {
  await page.goto("/sign-in");
  await page.getByTestId(`sign-in-${userId}`).click();
  await page.waitForURL(/\/(analyze|marketing|sales)/);
}

/** The live preview. On phones it's its own tab. */
async function preview(page: Page) {
  if (isPhone(page)) await page.getByTestId("tab-preview").click();
  return page.frameLocator('[data-testid="builder-frame"]');
}

async function tab(page: Page, name: "agent" | "sections" | "page") {
  await page.getByTestId(`tab-${name}`).click();
}

test.describe("page builder", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("describe a page, edit it, publish it, and its form lands in Contacts", async ({ page }) => {
    await signIn(page, "dev_cora");

    // Ridgeline doesn't have Marketing yet, so the agent refuses and Pages shows Unlock.
    const refused = await page.request.post("/api/pages/agent", { data: { doc: {}, instruction: "hi" } });
    expect(refused.status()).toBe(403);
    await page.goto("/marketing/pages");
    await page.getByTestId("unlock").click();
    await page.getByTestId("start-trial").getByRole("button").click();
    await expect(page.getByTestId("billing-status")).toHaveText("On as a trial. 14 days left.");

    // Describe it and let the agent build it.
    await page.goto("/marketing/pages");
    await page.locator("#new-page-prompt").fill("A page for our launch list, with a sign up form");
    await page.getByTestId("build-page").click();
    await page.waitForURL(/\/marketing\/pages\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("agent-reply").last()).toHaveAttribute("data-state", "done", { timeout: 20_000 });
    await expect(page.getByTestId("agent-reply").last()).toContainText("Built a 3-section page");
    let frame = await preview(page);
    await expect(frame.getByRole("heading", { level: 1 })).toBeVisible();

    // Edit the headline by hand; the preview follows.
    await tab(page, "sections");
    await page.getByTestId("section-item").first().getByRole("button").first().click();
    await page.getByTestId("section-form-hero").getByLabel("Headline", { exact: true }).fill("Fresh roasts, first");
    frame = await preview(page);
    await expect(frame.getByRole("heading", { level: 1 })).toHaveText("Fresh roasts, first");

    // Ask for a change, then undo it.
    await tab(page, "agent");
    await page.getByTestId("agent-input").fill("Make it dark");
    await page.getByTestId("agent-send").click();
    await expect(page.getByTestId("agent-reply")).toHaveCount(2);
    await expect(page.getByTestId("agent-reply").last()).toHaveAttribute("data-state", "done");
    frame = await preview(page);
    await expect(frame.locator('[data-mode="dark"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(frame.locator('[data-mode="light"]')).toHaveCount(1);
    await expect(page.getByTestId("save-state")).toHaveText("Saved");

    // Publish, open the live page, and send its form.
    await page.getByTestId("publish").click();
    const notice = page.getByTestId("editor-notice");
    await expect(notice).toContainText("Published");
    await expect(page.getByTestId("page-status")).toHaveText("Live");
    const href = await notice.getByRole("link").getAttribute("href");
    expect(href).toMatch(/\/p\/ridgeline-roasters\/[a-z0-9-]+$/);

    await page.goto(new URL(href!).pathname);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fresh roasts, first");
    const email = `first-${Date.now()}@example.com`;
    await page.getByTestId("page-form").getByLabel("Name", { exact: true }).fill("Pat Visitor");
    await page.getByTestId("page-form").getByLabel("Email", { exact: true }).fill(email);
    await page.waitForTimeout(1600);
    await page.getByTestId("page-form").getByRole("button").click();
    await expect(page.getByTestId("page-form-done")).toHaveText("You're on the list. We'll be in touch.");

    await page.goto("/analyze/contacts");
    await expect(page.getByTestId("contacts")).toContainText(email);
  });

  test("placeholders have to be filled in before a page goes live", async ({ page }) => {
    await signIn(page, "dev_ada");
    await page.goto("/marketing/pages");
    await page.getByTestId("blank-page").click();
    await page.waitForURL(/\/marketing\/pages\/[0-9a-f-]{36}$/);
    await tab(page, "sections");
    await page.getByTestId("add-section").click();
    await page.getByTestId("add-menu").getByRole("button", { name: /Customer quote/ }).click();
    await expect(page.getByTestId("placeholder-count")).toHaveText("3 to fill in");
    await page.getByTestId("publish").click();
    await expect(page.getByTestId("editor-notice")).toContainText("Fill in the 3 yellow placeholders before you publish.");
    await expect(page.getByTestId("page-status")).toHaveText("Draft");

    const form = page.getByTestId("section-form-quote");
    await form.getByLabel("Quote", { exact: true }).fill("They showed up when they said they would.");
    await form.getByLabel("Name", { exact: true }).fill("Jo Rivera");
    await form.getByLabel("Company or town").fill("Bend");
    await expect(page.getByTestId("placeholder-count")).toHaveCount(0);
    await page.getByTestId("publish").click();
    await expect(page.getByTestId("page-status")).toHaveText("Live");
  });

  test("start from a template, in the company's name and color, and publish it once it's filled in", async ({ page }) => {
    await signIn(page, "dev_ada");
    await page.goto("/marketing/pages");
    await expect(page.getByTestId("template-gallery").getByRole("button")).toHaveCount(8);

    // Preview the Simple contact template, with Brightwater's name already in it.
    await page.getByTestId("template-simple").click();
    const dialog = page.getByTestId("template-preview");
    await expect(dialog).toBeVisible();
    await expect(dialog.frameLocator('[data-testid="template-frame"]').getByText("Brightwater Pools").first()).toBeVisible();
    await expect(dialog).toContainText("Ready to edit.");
    await page.getByTestId("use-template").click();
    await page.waitForURL(/\/marketing\/pages\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("page-editor")).toContainText("Simple contact");
    await expect(page.getByTestId("placeholder-count")).toHaveCount(0);
    await page.getByTestId("publish").click();
    await expect(page.getByTestId("page-status")).toHaveText("Live");

    // A template with things only the business knows can't go live until they're filled in.
    await page.goto("/marketing/pages");
    await page.getByTestId("template-quote").click();
    await expect(page.getByTestId("template-preview")).toContainText("4 yellow spots");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("template-preview")).toBeHidden();
  });

  test("only roles with Marketing can build pages", async ({ page }) => {
    for (const who of ["dev_ben", "dev_dana"] as const) {
      await page.context().clearCookies();
      await signIn(page, who);
      await page.goto("/marketing/pages");
      await expect(page.getByTestId("role-blocked")).toBeVisible();
      const r = await page.request.post("/api/pages/agent", { data: { doc: {}, instruction: "hi" } });
      expect(r.status()).toBe(403);
    }
  });
});
