// Sales end to end, at 390 px and 1440 px, the way a new company uses it:
// unlock it, connect Stripe (the stand-in), add a product, sell it in the shop
// with a code, send an estimate the client approves and pays, take on a trade
// buyer, and share a contact. Stripe, email and shipping are stand-ins
// (PAYMENTS_PROVIDER, EMAIL_PROVIDER and SHIPPING_PROVIDER), so nothing leaves
// this machine.
import { expect, type Page, test } from "@playwright/test";
import { resetDb } from "./global-setup";

type Mail = { to: string; subject: string; html: string; text: string; from: string };

const SHOP = "/p/ridgeline-roasters";

/**
 * By test id, visible only. The app keeps the screen you just left in the page
 * (hidden) so Back is instant, so ids can appear twice for a moment.
 */
const t = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

async function signIn(page: Page, userId: "dev_ada" | "dev_ben" | "dev_cora" | "dev_dana") {
  await page.goto("/sign-in");
  await page.getByTestId(`sign-in-${userId}`).click();
  await page.waitForURL(/\/(analyze|marketing|sales)/);
}

async function outbox(page: Page, to?: string): Promise<Mail[]> {
  const r = await page.request.get(`/api/dev/outbox${to ? `?to=${encodeURIComponent(to)}` : ""}`);
  return (await r.json()) as Mail[];
}

async function mailTo(page: Page, to: string, subject: RegExp): Promise<Mail> {
  let found: Mail | undefined;
  await expect
    .poll(async () => {
      found = (await outbox(page, to)).find((m) => subject.test(m.subject));
      return Boolean(found);
    })
    .toBe(true);
  return found!;
}

const linkIn = (m: Mail, path: RegExp) => {
  const hit = m.text.match(new RegExp(`https?://[^\\s"<>]*${path.source}[^\\s"<>]*`));
  if (!hit) throw new Error(`No ${path} link in "${m.subject}"`);
  return new URL(hit[0]).pathname + new URL(hit[0]).search;
};

/** Ridgeline turns on Sales with a trial, sends email from its own domain, and connects Stripe. */
async function setUp(page: Page) {
  await signIn(page, "dev_cora");
  await page.request.delete("/api/dev/outbox");
  await page.goto("/sales");
  await page.getByTestId("unlock").click();
  await page.getByTestId("start-trial").getByRole("button").click();
  await expect(page.getByTestId("billing-status")).toHaveText("On as a trial. 14 days left.");

  await page.goto("/settings/email");
  await page.getByTestId("add-domain").click();
  await page.getByTestId("check-domain").click();
  await expect(page.getByTestId("records-notice")).toContainText("is verified");

  await page.goto("/settings/payments");
  await page.getByTestId("connect-stripe").click();
  await page.waitForURL(/\/settings\/payments/);
  await expect(page.getByTestId("payments-step-connect")).toHaveAttribute("data-state", "done");
}

async function addProduct(page: Page, name: string, price: string) {
  await page.goto("/sales/products/new");
  await page.getByTestId("product-name").fill(name);
  await page.getByTestId("product-description").fill("Chocolate and cherry.\n\n- Medium roast\n- Roasted to order");
  await page.getByLabel("Price").first().fill(price);
  await page.getByTestId("variant-weight").first().fill("12");
  await page.getByTestId("status-active").click();
  await page.getByTestId("save-product").click();
  await expect(page.getByTestId("product-notice")).toContainText("Saved");
}

async function addCode(page: Page, code: string, percent: string) {
  await page.goto("/sales/discounts");
  await page.getByTestId("new-discount").first().click();
  await page.getByTestId("discount-code").fill(code);
  await page.getByTestId("discount-kind-percent").click();
  await page.getByTestId("discount-value").fill(percent);
  await expect(page.getByTestId("discount-sentence")).toContainText(`${percent}% off`);
  await page.getByTestId("discount-save").click();
  await expect(page.getByTestId("discount-list-notice")).toContainText(code);
}

async function shipTo(page: Page) {
  await page.getByTestId("ship-name").fill("Pat Buyer");
  await page.getByTestId("ship-line1").fill("12 Juniper St");
  await page.getByTestId("ship-city").fill("Boise");
  await page.getByTestId("ship-state").fill("ID");
  await page.getByTestId("ship-postal").fill("83702");
}

async function addToCart(page: Page) {
  await page.goto(`${SHOP}/shop`);
  await t(page, "shop-card").first().click();
  await t(page, "add-to-cart").click();
  await expect(page.getByTestId("cart-drawer")).toBeVisible();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
}

test.describe("sales", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("set up Sales, sell in the shop with a code, and the order reaches the team", async ({ page }) => {
    await setUp(page);
    await page.goto("/sales/setup");
    await expect(page.getByTestId("sales-setup-hub")).toBeVisible();

    await addProduct(page, "House blend", "18");
    await addCode(page, "SAVE10", "10");

    // The product page is public, with structured data for search.
    await addToCart(page);
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(JSON.parse(ld ?? "{}")).toMatchObject({ "@type": "Product", name: "House blend" });
    await page.getByTestId("cart-code").fill("save10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByTestId("cart-total")).toHaveText("$16.20");

    // Checkout through the stand-in for Stripe.
    await page.getByTestId("cart-checkout").click();
    await page.waitForURL(/\/checkout$/);
    await page.getByTestId("checkout-email").fill("pat.buyer@example.com");
    await page.getByTestId("checkout-name").fill("Pat Buyer");
    await page.getByTestId("checkout-continue").click();
    await shipTo(page);
    await page.getByTestId("ship-rates").click();
    await expect(page.getByTestId("ship-option").first()).toBeVisible();
    await page.getByTestId("pay-test").click();
    await expect(page.getByTestId("order-thanks")).toBeVisible();
    await expect(page.locator("main").filter({ visible: true })).toContainText("Order #1001 is paid");

    // The team hears about it, from the company's own address.
    const alert = await mailTo(page, "cora@ridgelineroasters.com", /New order #1001/);
    expect(alert.from).toContain("ridgelineroasters.com");
    expect(alert.text).toContain("SAVE10");

    // It's in Orders, with the alert and a refund.
    await page.goto("/sales/orders");
    await expect(t(page, "order-row")).toHaveCount(1);
    await t(page, "order-row").first().getByRole("link").click();
    await expect(t(page, "order-panel")).toBeVisible();
    await expect(t(page, "order-alert")).toContainText("Sent to cora@ridgelineroasters.com");
    await t(page, "refund-amount").fill("5");
    page.once("dialog", (d) => void d.accept());
    await t(page, "refund-submit").click();
    await expect(t(page, "order-notice")).toContainText("Refunded");

    // The buyer is a contact now, and the left cart shows as bought.
    await page.goto("/sales/carts");
    await expect(t(page, "cart-row").first()).toHaveAttribute("data-status", "ordered");
  });

  test("an estimate goes out, the client approves it by name, and pays the invoice", async ({ page }) => {
    await setUp(page);
    await addProduct(page, "Espresso roast", "40");

    await page.goto("/sales/estimates/new");
    await page.getByTestId("est-client-name").fill("Jo Park");
    await page.getByTestId("est-client-email").fill("jo@cornercafe.example.com");
    await page.getByTestId("est-title").fill("Cafe opening order");
    await page.getByTestId("est-add-catalog").click();
    await page.getByTestId("est-pick").first().click();
    await page.getByTestId("est-add-line").click();
    await t(page, "est-line-name").last().fill("Grinder setup");
    await page.getByTestId("est-line-price").last().fill("150");
    await expect(page.getByTestId("estimate-total")).toHaveText("$190.00");
    await page.getByTestId("estimate-create").click();
    await page.waitForURL(/\/sales\/estimates\/[0-9a-f-]{36}$/);
    await expect(t(page, "estimate-status")).toHaveText("Draft");

    await t(page, "estimate-send").click();
    await t(page, "estimate-send-confirm").click();
    await expect(t(page, "estimate-notice")).toHaveText("Sent to jo@cornercafe.example.com.");
    await expect(t(page, "estimate-status")).toHaveText("Sent");

    // The client's page, from the link in their email.
    const mail = await mailTo(page, "jo@cornercafe.example.com", /Your estimate from Ridgeline Roasters/);
    const link = linkIn(mail, /\/e\//);
    await page.goto(link);
    await expect(page.getByTestId("estimate-client-total")).toHaveText("$190.00");
    await expect(page.getByTestId("estimate-item")).toHaveCount(2);
    await page.getByTestId("estimate-sign-name").fill("Jo Park");
    await page.getByTestId("estimate-answer-send").click();
    await expect(page.getByTestId("estimate-answered")).toContainText("Approved. Your invoice is ready to pay.");

    // The invoice is on the company's own Stripe account (the stand-in here).
    await page.getByTestId("estimate-pay").click();
    await expect(page.getByTestId("invoice-total")).toHaveText("$190.00");
    await page.getByTestId("pay-invoice").click();
    await expect(page.getByTestId("invoice-status")).toHaveText("Paid");

    await mailTo(page, "cora@ridgelineroasters.com", /Estimate #101 approved/);
    await page.goto("/sales/estimates?status=paid");
    await expect(t(page, "estimate-row")).toHaveCount(1);
    await t(page, "estimate-row").first().getByRole("link").click();
    await expect(t(page, "estimate-status")).toHaveText("Paid");
    await expect(t(page, "estimate-history")).toContainText("Approved");
    await page.goto("/sales/orders");
    await expect(t(page, "order-row").first()).toContainText("Jo Park");
  });

  test("a client asks for changes, the team edits and resends, then voids it", async ({ page }) => {
    await setUp(page);
    await page.goto("/sales/estimates/new");
    await page.getByTestId("est-client-name").fill("Sam Lee");
    await page.getByTestId("est-client-email").fill("sam@example.com");
    await page.getByTestId("est-add-line").click();
    await t(page, "est-line-name").fill("Delivery and setup");
    await page.getByTestId("est-line-price").fill("200");
    await page.getByTestId("estimate-create").click();
    await page.waitForURL(/\/sales\/estimates\/[0-9a-f-]{36}$/);
    const builder = page.url();
    await t(page, "estimate-send").click();
    await t(page, "estimate-send-confirm").click();
    await expect(t(page, "estimate-status")).toHaveText("Sent");

    const link = linkIn(await mailTo(page, "sam@example.com", /Your estimate/), /\/e\//);
    await page.goto(link);
    await page.getByTestId("estimate-choose-changes").click();
    await page.getByTestId("estimate-message").fill("Can delivery be on a Saturday?");
    await page.getByTestId("estimate-answer-send").click();
    await expect(page.getByTestId("estimate-answered")).toContainText("Sent.");

    await page.goto(builder);
    await expect(t(page, "estimate-status")).toHaveText("Changes requested");
    await expect(t(page, "change-request")).toContainText("Saturday");
    await t(page, "est-line-name").fill("Saturday delivery and setup");
    await expect(t(page, "estimate-save-state")).toHaveText("Saved");
    await t(page, "estimate-send").click();
    await t(page, "estimate-send-confirm").click();
    await expect(t(page, "estimate-status")).toHaveText("Sent");

    page.once("dialog", (d) => void d.accept());
    await t(page, "estimate-void").click();
    await expect(t(page, "estimate-status")).toHaveText("Void");
    await page.goto(link);
    await expect(page.getByTestId("estimate-invalid")).toBeVisible();
  });

  test("a trade buyer applies, is approved, signs in with a link and sees trade prices", async ({ page }) => {
    await setUp(page);
    await addProduct(page, "House blend", "20");

    await page.goto(`${SHOP}/trade`);
    await page.getByTestId("trade-company").fill("Corner Cafe");
    await page.getByTestId("trade-name").fill("Jo Park");
    await page.getByTestId("trade-email").fill("jo@cornercafe.example.com");
    // The form won't take a send in the first moment it's shown.
    await page.waitForTimeout(1700);
    await page.getByTestId("trade-apply-send").click();
    await expect(page.getByTestId("trade-apply-reply")).toContainText("Thanks.");
    await mailTo(page, "cora@ridgelineroasters.com", /Trade application from Corner Cafe/);

    await page.goto("/sales/trade");
    await t(page, "trade-application").filter({ hasText: "Corner Cafe" }).getByTestId("trade-approve").click();
    await expect(t(page, "trade-row").filter({ hasText: "Corner Cafe" })).toBeVisible();

    const link = linkIn(await mailTo(page, "jo@cornercafe.example.com", /trade account with Ridgeline Roasters is approved/), /\/trade\/enter/);
    await page.goto(link);
    await page.waitForURL(/\/shop\?trade=1/);
    await expect(t(page, "trade-signed-in")).toContainText("Trade prices");
    await expect(page.locator("main").filter({ visible: true })).toContainText("Signed in as Corner Cafe.");
    await t(page, "shop-card").first().click();
    await expect(t(page, "product-price")).toHaveText("$18.00");
    await t(page, "add-to-cart").click();
    await expect(page.getByTestId("cart-total")).toHaveText("$18.00");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).click();
    await page.waitForURL(/\/shop$/);
    await expect(t(page, "trade-signed-in")).toHaveCount(0);
  });

  test("a code that covers everything places a free order, and the buyer's page can be shared", async ({ page }) => {
    await setUp(page);
    await addProduct(page, "Sample box", "12");
    await addCode(page, "ONUS", "100");

    await addToCart(page);
    await page.getByTestId("cart-code").fill("ONUS");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByTestId("cart-total")).toHaveText("$0.00");
    await page.getByTestId("cart-checkout").click();
    await page.getByTestId("checkout-email").fill("lee.free@example.com");
    await page.getByTestId("checkout-name").fill("Lee Free");
    await page.getByTestId("checkout-continue").click();
    await shipTo(page);
    await page.getByTestId("place-free-order").click();
    await expect(page.getByTestId("checkout-done")).toContainText("Order #1001 is placed");

    // Share the buyer's page, then turn the link off.
    await page.goto("/analyze/contacts");
    await t(page, "contact-row").filter({ hasText: "lee.free@example.com" }).click();
    await expect(t(page, "contact-sales")).toContainText("#1001");
    await t(page, "share-make").click();
    const url = await t(page, "share-url").inputValue();
    await t(page, "share-revoke").first().waitFor();
    const path = new URL(url).pathname;
    await page.goto(path);
    await expect(page.getByTestId("share-name")).toHaveText("Lee Free");
    await expect(page.getByTestId("share-order")).toHaveCount(1);
    await page.goBack();
    await t(page, "share-revoke").first().click();
    await expect(t(page, "share-notice")).toContainText("Turned off");
    await page.goto(path);
    await expect(page.getByTestId("share-invalid")).toBeVisible();
  });

  test("sample data shows made-up orders and keeps real records safe", async ({ page }) => {
    await signIn(page, "dev_ada");
    await page.goto("/sales");
    await page.getByTestId("unlock").click();
    await page.getByTestId("start-trial").getByRole("button").click();
    await page.goto("/sales/orders");
    await expect(t(page, "sample-banner")).toBeVisible();
    await expect(t(page, "order-row").first()).toBeVisible();
    await page.goto("/sales/estimates?status=all");
    await t(page, "estimate-row").first().getByRole("link").click();
    await expect(t(page, "estimate-builder")).toContainText("Sample data is on");
  });

  test("only roles with Sales see it, and a company without Sales has no shop", async ({ page }) => {
    await signIn(page, "dev_dana");
    for (const path of ["/sales", "/sales/estimates", "/sales/orders"]) {
      await page.goto(path);
      await expect(t(page, "role-blocked")).toBeVisible();
    }
    await page.goto("/p/brightwater-pools/shop");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    const cart = await page.request.post("/p/brightwater-pools/cart", { data: { cartId: null, change: { op: "view" } } });
    expect(cart.status()).toBe(404);
  });
});
