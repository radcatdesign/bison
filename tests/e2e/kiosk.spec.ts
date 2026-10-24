// The front desk kiosk end to end, at 390 px and 1440 px: staff set a PIN and
// pair a tablet, then walk-ins claim a pass, check in and sign the waiver,
// staff see it in Front desk and Leads, and the PIN takes the tablet out.
import { expect, type Page, test } from "@playwright/test";
import { resetDb } from "./global-setup";

const t = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

async function signInMaya(page: Page) {
  await page.goto("/sign-in?edition=fit");
  await page.getByTestId("sign-in-dev_maya").click();
  await page.waitForURL(/\/(analyze|marketing|sales)/);
}

test.describe("Front desk kiosk", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("pairs a tablet, takes a pass, a check-in and a waiver, and leaves with the PIN", async ({ page, browser, baseURL }) => {
    await signInMaya(page);
    await page.goto("/settings/kiosk");
    // No pairing until there's a PIN.
    await expect(t(page, "pair-make")).toBeDisabled();
    await t(page, "kiosk-pin-input").fill("1111");
    await t(page, "kiosk-pin-confirm").fill("1111");
    await t(page, "kiosk-pin-form").getByRole("button").click();
    await expect(t(page, "kiosk-pin-form").getByTestId("action-message")).toContainText("easy to guess");
    await t(page, "kiosk-pin-input").fill("482913");
    await t(page, "kiosk-pin-confirm").fill("482913");
    await t(page, "kiosk-pin-form").getByRole("button").click();
    await expect(t(page, "kiosk-pin-form").getByTestId("action-message")).toContainText("Staff PIN saved");

    // A waiver with nothing left to fill in, turned on.
    await page.reload();
    await t(page, "kiosk-waiver-body").fill("I know exercise has risks, and I take part at my own risk. Summit Strength Club LLC.");
    await t(page, "kiosk-waiver-form").getByRole("button").click();
    await expect(t(page, "kiosk-waiver-form").getByTestId("action-message")).toContainText("Waiver saved");
    await page.reload();
    await t(page, "kiosk-waiverOn").check();
    await t(page, "kiosk-config-form").getByRole("button", { name: "Save" }).click();
    await expect(t(page, "kiosk-config-form").getByTestId("action-message")).toContainText("Saved");

    await t(page, "pair-make").click();
    const code = ((await t(page, "pair-code-value").textContent()) ?? "").replace(/\s/g, "");
    expect(code).toMatch(/^\d{6}$/);

    // The tablet: its own browser, nobody signed in.
    const tablet = await browser.newContext({ baseURL, viewport: page.viewportSize() ?? undefined });
    const k = await tablet.newPage();
    await k.goto("/kiosk");
    await k.getByTestId("pair-code").fill("000000");
    await k.getByTestId("pair-submit").click();
    await expect(k.getByTestId("pair-error")).toContainText("didn't work");
    await k.getByTestId("pair-code").fill(code);
    await k.getByTestId("pair-submit").click();
    await expect(k.getByTestId("kiosk")).toBeVisible();
    await expect(k.getByRole("heading", { level: 1 })).toHaveText("Welcome to Summit Strength Club");

    // A walk-in claims a free pass, then signs the waiver straight after.
    const email = `walkin-${Date.now()}@example.com`;
    await k.getByTestId("kiosk-tile-pass").click();
    const pass = k.getByTestId("kiosk-pass-form");
    await pass.getByLabel("Your name").fill("Rae Walker");
    await pass.getByLabel("Email").fill(email);
    await pass.getByLabel(/Phone/).fill("541 555 0199");
    await pass.getByRole("button", { name: "Claim my pass" }).click();
    await expect(k.getByTestId("kiosk-done")).toContainText("You're all set, Rae.");
    await k.getByTestId("kiosk-sign-now").click();
    const waiver = k.getByTestId("kiosk-sign-form");
    await expect(waiver.getByLabel("Your name")).toHaveValue("Rae Walker");
    await waiver.getByRole("button", { name: "Sign" }).click();
    await expect(k.getByTestId("kiosk-error")).toContainText("Tick the box");
    await waiver.getByLabel(/I've read this waiver/).check();
    const pad = k.getByTestId("signature-pad");
    const box = (await pad.boundingBox())!;
    await k.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.7);
    await k.mouse.down();
    for (let i = 1; i <= 8; i++) await k.mouse.move(box.x + box.width * (0.1 + i * 0.08), box.y + box.height * (i % 2 ? 0.3 : 0.7));
    await k.mouse.up();
    await waiver.getByRole("button", { name: "Sign" }).click();
    await expect(k.getByTestId("kiosk-done")).toContainText("Your waiver is signed.");
    await k.getByRole("button", { name: "Done" }).click();

    // Checking in by phone shows a first name, and no waiver prompt now.
    await k.getByTestId("kiosk-tile-checkin").click();
    await k.getByTestId("kiosk-checkin-form").getByLabel("Phone number", { exact: true }).fill("(541) 555-0199");
    await k.getByTestId("kiosk-checkin-form").getByRole("button", { name: "Check in" }).click();
    await expect(k.getByTestId("kiosk-done")).toContainText("Welcome back, Rae.");
    await expect(k.getByTestId("kiosk-sign-now")).toHaveCount(0);
    await k.getByRole("button", { name: "Done" }).click();

    // Staff see it. Summit shows sample data, so turn it off to see the real rows.
    await page.goto("/settings");
    await t(page, "sample-toggle").uncheck();
    await expect(t(page, "sample-form").getByTestId("action-message")).toContainText("Sample data is off");
    await page.goto("/analyze/front-desk");
    await expect(t(page, "desk-checkin")).toContainText("1");
    await expect(t(page, "desk-pass")).toContainText("1");
    await expect(t(page, "desk-waiver")).toContainText("1");
    await expect(t(page, "desk-latest")).toContainText("Rae Walker");
    await expect(t(page, "desk-tablets")).toContainText("Front desk");
    await t(page, "desk-latest").getByRole("link", { name: "Rae Walker" }).first().click();
    await expect(t(page, "contact-panel")).toContainText("Free pass at the desk");
    await expect(t(page, "contact-desk")).toContainText("1 check-in in the last 30 days");
    await expect(t(page, "contact-desk")).toContainText("Signed Release and waiver (version 1)");

    // Leaving takes the PIN, and then the tablet needs a new code.
    await k.getByTestId("kiosk-staff").click();
    for (const d of "123456") await k.getByTestId("kiosk-staff-form").getByRole("button", { name: d, exact: true }).click();
    await k.getByTestId("kiosk-leave").click();
    await expect(k.getByTestId("kiosk-error")).toHaveText("That PIN isn't right.");
    await k.getByTestId("kiosk-staff-form").getByRole("button", { name: "Clear" }).click();
    for (const d of "482913") await k.getByTestId("kiosk-staff-form").getByRole("button", { name: d, exact: true }).click();
    await k.getByTestId("kiosk-leave").click();
    await expect(k.getByTestId("kiosk-pair")).toBeVisible();
    await tablet.close();
  });

  test("staff can unpair a tablet from Settings, and it goes back to pairing", async ({ page, browser, baseURL }) => {
    await signInMaya(page);
    await page.goto("/settings/kiosk");
    await t(page, "kiosk-pin-input").fill("482913");
    await t(page, "kiosk-pin-confirm").fill("482913");
    await t(page, "kiosk-pin-form").getByRole("button").click();
    await expect(t(page, "kiosk-pin-form").getByTestId("action-message")).toContainText("Staff PIN saved");
    await page.reload();
    await t(page, "pair-name").fill("Lobby iPad");
    await t(page, "pair-make").click();
    const code = ((await t(page, "pair-code-value").textContent()) ?? "").replace(/\s/g, "");
    const tablet = await browser.newContext({ baseURL });
    const k = await tablet.newPage();
    await k.goto("/kiosk");
    await k.getByTestId("pair-code").fill(code);
    await k.getByTestId("pair-submit").click();
    await expect(k.getByTestId("kiosk")).toContainText("Lobby iPad");

    await page.reload();
    await expect(t(page, "kiosk-device")).toContainText("Lobby iPad");
    await t(page, "kiosk-device").getByRole("button", { name: "Unpair" }).click();
    await expect(t(page, "kiosk-tablets")).toContainText("No tablets yet.");
    await k.reload();
    await expect(k.getByTestId("kiosk-pair")).toBeVisible();
    await tablet.close();
  });

  test("a tablet picks up settings staff change while it's open", async ({ page, browser, baseURL }) => {
    await signInMaya(page);
    await page.goto("/settings/kiosk");
    await t(page, "kiosk-pin-input").fill("482913");
    await t(page, "kiosk-pin-confirm").fill("482913");
    await t(page, "kiosk-pin-form").getByRole("button").click();
    await expect(t(page, "kiosk-pin-form").getByTestId("action-message")).toContainText("Staff PIN saved");
    await page.reload();
    await t(page, "pair-make").click();
    const code = ((await t(page, "pair-code-value").textContent()) ?? "").replace(/\s/g, "");
    const tablet = await browser.newContext({ baseURL });
    const k = await tablet.newPage();
    await k.goto("/kiosk");
    await k.getByTestId("pair-code").fill(code);
    await k.getByTestId("pair-submit").click();
    await k.getByTestId("kiosk-tile-pass").click();

    // Staff turn free passes off while someone is filling in the form.
    await page.reload();
    await t(page, "kiosk-passOn").uncheck();
    await t(page, "kiosk-config-form").getByRole("button", { name: "Save" }).click();
    await expect(t(page, "kiosk-config-form").getByTestId("action-message")).toContainText("Saved");

    const pass = k.getByTestId("kiosk-pass-form");
    await pass.getByLabel("Your name").fill("Late Comer");
    await pass.getByLabel("Email").fill("late@example.com");
    await pass.getByRole("button", { name: "Claim my pass" }).click();
    await expect(k.getByTestId("kiosk-error")).toContainText("aren't offered here right now");
    // Back at the start, the tablet loads the new settings.
    await k.getByRole("button", { name: "Start over" }).click();
    await expect(k.getByTestId("kiosk-tile-checkin")).toBeVisible();
    await expect(k.getByTestId("kiosk-tile-pass")).toHaveCount(0);
    await tablet.close();
  });

  test("the preview works without a tablet and saves nothing", async ({ page }) => {
    await signInMaya(page);
    await page.goto("/settings/kiosk");
    await t(page, "kiosk-preview-link").click();
    await expect(page.getByTestId("kiosk-preview")).toContainText("Nothing here is saved");
    await page.getByTestId("kiosk-tile-tour").click();
    const tour = page.getByTestId("kiosk-tour-form");
    await tour.getByLabel("Your name").fill("Preview Person");
    await tour.getByLabel("Email").fill("preview@example.com");
    await tour.getByRole("button", { name: "Evening" }).click();
    await tour.getByRole("button", { name: "Request a tour" }).click();
    await expect(page.getByTestId("kiosk-done")).toContainText("Thanks, Preview.");
  });

  test("Bison Ops companies don't get a kiosk", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByTestId("sign-in-dev_ada").click();
    await page.waitForURL(/\/(analyze|marketing|sales)/);
    await page.goto("/settings/kiosk");
    await expect(page.getByText("This page could not be found").or(page.getByText(/not found/i)).first()).toBeVisible();
    await expect(page.getByTestId("kiosk-tablets")).toHaveCount(0);
    await page.goto("/settings");
    await expect(page.getByTestId("settings-kiosk")).toHaveCount(0);
  });
});
