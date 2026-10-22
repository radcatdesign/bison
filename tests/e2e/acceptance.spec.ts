// Phase 0 acceptance, at 390 px (phone) and 1440 px (desktop):
//   two test tenants, each sees only their own data;
//   locking a module hides its pages behind Unlock.
import { expect, type Page, test } from "@playwright/test";
import { resetDb } from "./global-setup";

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 760;

async function signIn(page: Page, userId: "dev_ada" | "dev_ben" | "dev_cora" | "dev_dana") {
  await page.goto("/sign-in");
  await page.getByTestId(`sign-in-${userId}`).click();
  await page.waitForURL(/\/(analyze|marketing|sales)/);
}

test.describe("isolation", () => {
  test("Ridgeline sees its own contacts and nothing from Brightwater", async ({ page }) => {
    await signIn(page, "dev_cora");
    await expect(page.getByTestId("tenant-name")).toHaveText("Ridgeline Roasters");
    await page.goto("/analyze/contacts");
    const list = page.getByTestId("contacts");
    await expect(list).toContainText("owen@brooksdeli.com");
    await expect(list).not.toContainText("quinnbuilds.com");
    await expect(page.getByTestId("sample-banner")).toHaveCount(0);
  });

  test("Brightwater sees its own sample data and nothing from Ridgeline", async ({ page }) => {
    await signIn(page, "dev_ada");
    await expect(page.getByTestId("tenant-name")).toHaveText("Brightwater Pools");
    await expect(page.getByTestId("sample-banner")).toBeVisible();
    await expect(page.getByTestId("top-page").first()).toBeVisible();
    await expect(page.locator("#main")).toContainText("/glow-aggregate");
    await page.goto("/analyze/contacts");
    await expect(page.getByTestId("contact-row").first()).toBeVisible();
    await expect(page.getByTestId("contacts")).not.toContainText("brooksdeli.com");
    await expect(page.getByTestId("contacts")).not.toContainText("ridgeline");
  });

  test("opening another tenant's contact by id shows nothing", async ({ page }) => {
    await signIn(page, "dev_ada");
    // Take a real Ridgeline contact id, then try it as Brightwater.
    await page.context().clearCookies();
    await signIn(page, "dev_cora");
    await page.goto("/analyze/contacts");
    await page.getByTestId("contact-row").first().click();
    await expect(page.getByTestId("contact-panel")).toBeVisible();
    const id = new URL(page.url()).searchParams.get("c")!;
    await page.context().clearCookies();
    await signIn(page, "dev_ada");
    await page.goto(`/analyze/contacts?c=${id}`);
    await expect(page.getByText("That contact isn't here.")).toBeVisible();
  });

  test("signed-out visitors go to sign in", async ({ page }) => {
    await page.goto("/analyze");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("sample data", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("nothing is saved while it's on", async ({ page }) => {
    await signIn(page, "dev_ada");
    await page.goto("/analyze/contacts");
    await page.getByTestId("contact-row").first().click();
    await page.getByTestId("contact-panel").getByLabel("Status").selectOption("won");
    await expect(page.getByTestId("action-message")).toContainText("Sample data is on, so nothing is saved");
  });

  test("turning it off shows the tenant's own data, still not the other tenant's", async ({ page }) => {
    await signIn(page, "dev_ada");
    await page.goto("/settings");
    await page.getByTestId("sample-toggle").uncheck();
    await expect(page.getByTestId("action-message")).toContainText("Sample data is off");
    await page.goto("/analyze/contacts");
    await expect(page.getByTestId("contacts")).toContainText("mara@quinnbuilds.com");
    await expect(page.getByTestId("contacts")).not.toContainText("owen@brooksdeli.com");
    await expect(page.getByTestId("sample-banner")).toHaveCount(0);
  });
});

test.describe("locked modules", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("a module the tenant doesn't have shows Unlock, never a broken page", async ({ page }) => {
    await signIn(page, "dev_cora");
    for (const mode of ["marketing", "sales"]) {
      await page.goto(`/${mode}`);
      await expect(page.getByTestId("locked")).toBeVisible();
      await expect(page.getByTestId("unlock")).toBeVisible();
      await expect(page.getByTestId(`module-${mode}`)).toHaveCount(0);
    }
  });

  test("Unlock leads to a trial that opens the module", async ({ page }) => {
    await signIn(page, "dev_cora");
    await page.goto("/marketing");
    await page.getByTestId("unlock").click();
    await expect(page.getByTestId("billing")).toBeVisible();
    await page.getByTestId("start-trial").getByRole("button").click();
    await expect(page.getByTestId("billing-status")).toHaveText("On as a trial. 14 days left.");
    await page.goto("/marketing");
    await expect(page.getByTestId("module-marketing")).toBeVisible();
    await expect(page.getByText("trial: 14 days left")).toBeVisible();
    // The other tenant is untouched.
    await page.context().clearCookies();
    await signIn(page, "dev_ada");
    await page.goto("/sales");
    await expect(page.getByTestId("locked")).toBeVisible();
  });

  test("an unlocked module shows its pages", async ({ page }) => {
    await signIn(page, "dev_ada");
    await page.goto("/marketing");
    await expect(page.getByTestId("module-marketing")).toBeVisible();
  });
});

test.describe("landing pages", () => {
  test("show every landing page with a preview, and open one at each device size", async ({ page }) => {
    await signIn(page, "dev_ada");
    await page.goto("/analyze/pages");
    const tiles = page.getByTestId("landing-page");
    await expect(tiles.first()).toBeVisible();
    await expect(page.getByTestId("landing-pages")).toContainText("/glow-aggregate");
    await page.getByTestId("landing-pages").getByText("/glow-aggregate").click();
    const panel = page.getByTestId("page-panel");
    await expect(panel).toBeVisible();
    const frame = panel.frameLocator("iframe");
    await expect(frame.getByRole("heading", { level: 1 })).toHaveText("Glow aggregate for plaster and pebble");
    await expect(frame.getByText("Brightwater Pools").first()).toBeVisible();
    // Loading state clears and the page fades in once it has loaded
    await expect(panel.getByTestId("preview-loading")).toHaveCount(0);
    await expect(panel.locator("iframe")).toHaveCSS("opacity", "1");
    await panel.getByTestId("device-phone").click();
    await expect(panel.getByTestId("device-phone")).toHaveAttribute("aria-checked", "true");
    await expect(panel.locator("iframe")).toHaveAttribute("width", "390");
  });

  test("a live tenant previews its own site and nobody else's", async ({ page }) => {
    await signIn(page, "dev_cora");
    await page.goto("/analyze/pages");
    await expect(page.getByTestId("landing-pages")).not.toContainText("/glow-aggregate");
    await expect(page.getByTestId("landing-page").first().locator("iframe")).toHaveAttribute("src", /^https:\/\/ridgelineroasters\.com\//);
  });
});

test.describe("roles", () => {
  test("a Sales person doesn't see Marketing", async ({ page }) => {
    await signIn(page, "dev_ben");
    const nav = isPhone(page) ? page.locator("nav[aria-label='Modes']").last() : page.locator("aside nav[aria-label='Modes']");
    await expect(nav.getByRole("link", { name: /Sales/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Marketing/ })).toHaveCount(0);
    await page.goto("/marketing");
    await expect(page.getByTestId("role-blocked")).toBeVisible();
  });

  test("a Viewer can't change settings or the plan", async ({ page }) => {
    await signIn(page, "dev_dana");
    await page.goto("/settings");
    await expect(page.getByTestId("sample-toggle")).toBeDisabled();
    await page.goto("/settings/billing?item=module:sales");
    await expect(page.getByText("Only an owner can change the plan.")).toBeVisible();
    await expect(page.getByTestId("start-trial")).toHaveCount(0);
  });
});

test.describe("portal", () => {
  test("every number explains how it's measured", async ({ page }) => {
    await signIn(page, "dev_cora");
    await page.goto("/analyze");
    await page.getByTestId("metric-visitors").getByRole("button", { name: /how visitors is measured/i }).click();
    await expect(page.getByText(/counts once per day/)).toBeVisible();
  });

  test("phone gets the dock and menu; desktop gets the rail", async ({ page }) => {
    await signIn(page, "dev_ada");
    const dock = page.locator("nav[aria-label='Modes']").last();
    if (isPhone(page)) {
      await expect(dock).toBeVisible();
      await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Settings" }).click();
      await expect(page).toHaveURL(/\/settings/);
    } else {
      await expect(page.locator("aside nav[aria-label='Modes']")).toBeVisible();
      await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
      await page.locator("aside").getByRole("link", { name: "Contacts" }).click();
      await expect(page).toHaveURL(/\/analyze\/contacts/);
    }
  });

  test("remembers the last mode", async ({ page }) => {
    await signIn(page, "dev_ada");
    await page.goto("/marketing");
    await expect(page.getByTestId("module-marketing")).toBeVisible();
    await page.goto("/");
    await expect(page).toHaveURL(/\/marketing$/);
  });

  test("light and dark mode, remembered per person", async ({ page }) => {
    await signIn(page, "dev_ada");
    if (isPhone(page)) {
      await page.getByRole("button", { name: "Menu" }).click();
    }
    const switcher = page.getByRole("radiogroup", { name: "Appearance" }).locator("visible=true");
    await switcher.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(canvas).toBe("rgb(8, 9, 11)");
    if (isPhone(page)) await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("radiogroup", { name: "Appearance" }).locator("visible=true").getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("doesn't zoom on double-tap and installs as an app", async ({ page, request }) => {
    await signIn(page, "dev_ada");
    await expect(page.locator("meta[name=viewport]")).toHaveAttribute("content", /maximum-scale=1/);
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ display: "standalone", background_color: "#f4f5f7" });
  });
});
