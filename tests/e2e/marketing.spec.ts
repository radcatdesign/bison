// Marketing end to end, at 390 px and 1440 px, the way a new company sets it up:
// sending domain, brand kit, subscribers, a newsletter, the welcome series and a
// signup form. Email goes to the stand-in's outbox (EMAIL_PROVIDER=stand-in),
// never out.
import { expect, type Page, test } from "@playwright/test";
import { resetDb } from "./global-setup";

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 760;
type Mail = { to: string; subject: string; html: string; text: string; from: string; headers: Record<string, string> };

async function signIn(page: Page, userId: "dev_ada" | "dev_ben" | "dev_cora" | "dev_dana") {
  await page.goto("/sign-in");
  await page.getByTestId(`sign-in-${userId}`).click();
  await page.waitForURL(/\/(analyze|marketing|sales)/);
}

async function outbox(page: Page, to?: string): Promise<Mail[]> {
  const r = await page.request.get(`/api/dev/outbox${to ? `?to=${encodeURIComponent(to)}` : ""}`);
  return (await r.json()) as Mail[];
}

/** Ridgeline starts without Marketing: unlock it, then set up sending and the address every email needs. */
async function setUp(page: Page) {
  await signIn(page, "dev_cora");
  await page.request.delete("/api/dev/outbox");
  await page.goto("/marketing");
  await page.getByTestId("unlock").click();
  await page.getByTestId("start-trial").getByRole("button").click();
  await expect(page.getByTestId("billing-status")).toHaveText("On as a trial. 14 days left.");

  await page.goto("/settings/email");
  await expect(page.locator("#sending-domain-input")).toHaveValue("mail.ridgelineroasters.com");
  await page.getByTestId("add-domain").click();
  await expect(page.getByTestId("dns-records")).toContainText("send.mail");
  await page.getByTestId("check-domain").click();
  await expect(page.getByTestId("records-notice")).toHaveText("mail.ridgelineroasters.com is verified. You can send from it now.");

  await page.goto("/marketing/brand");
  await page.locator("#bk-address").fill("88 Roaster Row\nBoise, ID 83702");
  await page.getByTestId("save-brand").click();
  await expect(page.getByTestId("brand-notice")).toHaveText("Brand kit saved. Every email uses it from now on.");
}

test.describe("marketing", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("set up step by step, import subscribers, send a newsletter, and unsubscribe from it", async ({ page }) => {
    await signIn(page, "dev_cora");
    await page.goto("/marketing/setup");
    await expect(page.getByTestId("locked")).toBeVisible();

    await setUp(page);

    // The setup hub ticks off what's done and points at what's next.
    await page.goto("/marketing/setup");
    await expect(page.getByTestId("step-sending.domain")).toHaveAttribute("data-done", "true");
    await expect(page.getByTestId("step-sending.verify")).toHaveAttribute("data-done", "true");
    await expect(page.getByTestId("step-brand.address")).toHaveAttribute("data-done", "true");
    await expect(page.getByTestId("step-sending.test")).toHaveAttribute("data-next", "true");

    // A test from Settings comes from the company's own address.
    await page.goto("/settings/email");
    await page.getByTestId("send-setup-test").click();
    await expect(page.getByTestId("test-notice")).toContainText("Test sent to cora@ridgelineroasters.com");
    const [test0] = await outbox(page, "cora@ridgelineroasters.com");
    expect(test0.from).toBe('"Ridgeline Roasters" <hello@mail.ridgelineroasters.com>');

    // Subscribers: one by hand, two from a file.
    await page.goto("/marketing/subscribers");
    await page.getByTestId("open-add").click();
    await page.locator("#add-email").fill("pat.reader@example.com");
    await page.locator("#add-name").fill("Pat Reader");
    await page.getByTestId("add-submit").click();
    await expect(page.getByTestId("action-message")).toHaveText("Added pat.reader@example.com.");
    await page.keyboard.press("Escape");
    await page.getByTestId("open-import").click();
    await page.getByTestId("import-file").setInputFiles({ name: "list.csv", mimeType: "text/csv", buffer: Buffer.from("Email,First Name,Last Name\nann@example.com,Ann,Lee\nPAT.READER@example.com,,\nnot-an-email,,\n") });
    // The browser won't send the file until the team confirms everyone agreed.
    await page.getByTestId("import-submit").click();
    await expect(page.getByTestId("import-message")).toHaveCount(0);
    expect(await page.getByTestId("import-consent").evaluate((el) => (el as HTMLInputElement).validity.valueMissing)).toBe(true);
    await page.getByTestId("import-consent").check();
    await page.getByTestId("import-submit").click();
    await expect(page.getByTestId("import-message")).toHaveText("Added 1, updated 1 already on your list, skipped 1 rows without a valid email.");
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByTestId("subscriber-row")).toHaveCount(2);

    // A newsletter from a template, sent now.
    await page.goto("/marketing/newsletters");
    await page.getByTestId("newsletter-template-t-letter").click();
    await page.waitForURL(/\/marketing\/newsletters\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("problem-count")).toHaveText("2 to fix");
    await page.getByTestId("btab-email").click();
    await page.locator("#email-subject").fill("Fresh roast, {first name}");
    await page.getByTestId("btab-sections").click();
    await page.getByTestId("email-section").first().locator("button").first().click();
    await page.getByTestId("email-section-form-text").getByLabel("Text", { exact: true }).fill("Hi {first name},\n\nThe **winter blend** is out. [Get a bag](https://ridgelineroasters.com/shop).");
    await expect(page.getByTestId("problem-count")).toHaveCount(0);
    await expect(page.getByTestId("save-state")).toHaveText("Saved");
    if (isPhone(page)) await page.getByTestId("btab-preview").click();
    await expect(page.frameLocator('[data-testid="email-canvas"]').getByText("winter blend")).toBeVisible();

    await page.getByTestId("open-send").click();
    await expect(page.getByTestId("send-checks")).toContainText("2 people will get it.");
    await page.getByTestId("confirm-send").click();
    await expect(page.getByTestId("report-sent")).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await outbox(page)).filter((m) => m.subject.startsWith("Fresh roast")).length, { timeout: 15_000 }).toBe(2);
    const [mail] = await outbox(page, "ann@example.com");
    expect(mail.subject).toBe("Fresh roast, Ann");
    expect(mail.text).toContain("utm_source=newsletter");
    expect(mail.html).toContain("88 Roaster Row");
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    // Ann unsubscribes from the link in the email; the page never unsubscribes on its own.
    const link = /href="(https?:\/\/[^"]+\/u\/[^"]+)"/.exec(mail.html)![1];
    await page.goto(new URL(link).pathname);
    await expect(page.getByTestId("unsubscribe-confirm")).toContainText("Unsubscribe from Ridgeline Roasters?");
    await expect(page.getByTestId("unsubscribe-confirm")).toContainText("an••@example.com");
    await page.getByTestId("confirm-unsubscribe").click();
    await expect(page.getByTestId("unsubscribed")).toContainText("won't get any more marketing email");

    await page.goto("/marketing/subscribers?status=unsubscribed");
    await expect(page.getByTestId("subscriber-row")).toHaveCount(1);
    await expect(page.getByTestId("subscriber-row")).toContainText("ann@example.com");
  });

  test("the welcome series goes out when someone signs up on a landing page", async ({ page, browser }) => {
    await setUp(page);

    // It won't turn on with yellow spots left.
    await page.goto("/marketing/series");
    await page.getByTestId("series-switch-starter").click();
    await expect(page.getByTestId("series-message")).toContainText("isn't ready");
    const steps = await page.getByTestId("series-step").evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
    expect(steps).toHaveLength(3);
    for (const href of steps) {
      await page.goto(href);
      await expect(page.getByTestId("email-builder")).toBeVisible();
      if (!(await page.getByTestId("problem-count").count())) continue;
      const sections = page.getByTestId("email-section");
      for (let i = 0; i < (await sections.count()); i++) {
        await sections.nth(i).locator("button").first().click();
        for (const field of await page.locator('[data-testid^="email-section-form-"] textarea').all()) {
          const value = await field.inputValue();
          if (value.includes("[Add ")) await field.fill(value.replace(/\[Add [^\]]+\]/g, "We roast every Monday"));
        }
      }
      await expect(page.getByTestId("problem-count")).toHaveCount(0);
      await expect(page.getByTestId("save-state")).toHaveText("Saved");
    }
    await page.goto("/marketing/series");
    await page.getByTestId("series-switch-starter").click();
    await expect(page.getByTestId("series-message")).toContainText("On.");

    // A landing page whose form adds people to the list.
    await page.goto("/marketing/pages");
    await page.getByTestId("blank-page").click();
    await page.waitForURL(/\/marketing\/pages\/[0-9a-f-]{36}$/);
    await page.getByTestId("tab-sections").click();
    await page.getByTestId("add-section").click();
    await page.getByTestId("add-menu").getByRole("button", { name: /^Form/ }).click();
    await page.getByTestId("toggle-subscribe").check();
    await expect(page.getByTestId("save-state")).toHaveText("Saved");
    await page.getByTestId("publish").click();
    await expect(page.getByTestId("page-status")).toHaveText("Live");
    const href = await page.getByTestId("editor-notice").getByRole("link").getAttribute("href");

    const visitor = await browser.newPage({ baseURL: test.info().project.use.baseURL });
    await visitor.goto(new URL(href!).pathname);
    await visitor.getByTestId("page-form").getByLabel("Email", { exact: true }).fill("new.fan@example.com");
    await visitor.waitForTimeout(1600);
    await visitor.getByTestId("page-form").getByRole("button").click();
    await expect(visitor.getByTestId("page-form-done")).toBeVisible();
    await visitor.close();

    await expect.poll(async () => (await outbox(page, "new.fan@example.com")).map((m) => m.subject), { timeout: 15_000 }).toEqual(["Welcome to Ridgeline Roasters"]);
    await page.goto("/marketing/subscribers");
    await expect(page.getByTestId("subscriber-list")).toContainText("new.fan@example.com");
  });

  test("sample data keeps the real list safe", async ({ page }) => {
    await signIn(page, "dev_ada");
    await page.goto("/marketing/subscribers");
    await expect(page.getByTestId("subscriber-row").first()).toBeVisible();
    await expect(page.getByTestId("open-add")).toHaveCount(0);
    await page.goto("/marketing/newsletters");
    await page.getByTestId("newsletter-template-t-news").click();
    await page.waitForURL(/\/marketing\/newsletters\/[0-9a-f-]{36}$/);
    await page.getByTestId("open-send").click();
    await expect(page.getByTestId("send-checks")).toContainText("Sample data is on, so your list on screen is made up.");
    await expect(page.getByTestId("confirm-send")).toBeDisabled();
  });

  test("only roles with Marketing see it", async ({ page }) => {
    for (const who of ["dev_ben", "dev_dana"] as const) {
      await page.context().clearCookies();
      await signIn(page, who);
      for (const path of ["/marketing/subscribers", "/marketing/newsletters", "/marketing/setup"]) {
        await page.goto(path);
        await expect(page.getByTestId("role-blocked")).toBeVisible();
      }
      const r = await page.request.post("/api/marketing/files", { multipart: { kind: "logo", file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("x") } } });
      expect(r.status()).toBe(403);
    }
  });

  test("search files are public and built from published pages", async ({ page }) => {
    await signIn(page, "dev_ada");
    const robots = await page.request.get("/robots.txt");
    expect(await robots.text()).toContain("Allow: /p/");
    const llms = await page.request.get("/p/brightwater-pools/llms.txt");
    expect(llms.status()).toBe(200);
    expect(await llms.text()).toMatch(/^# Brightwater Pools/);
    expect((await page.request.get("/p/ridgeline-roasters/sitemap.xml")).status()).toBe(404);
    await page.goto("/marketing/search");
    await page.locator("#search-description").fill("We make pool finishes that glow at night.");
    await page.getByTestId("save-search").click();
    await expect(page.getByTestId("search-message")).toHaveText("Saved. Your pages, sitemap and llms.txt use it now.");
    expect(await (await page.request.get("/p/brightwater-pools/llms.txt")).text()).toContain("> We make pool finishes that glow at night.");
  });
});
