// Step-by-step setup for every Sales tool. Pure: plain facts in (what's saved,
// what's connected, how many products), each tool's steps out. Same shape as
// Marketing's, so the same guide shows them.
import type { SetupStep, ToolSetup } from "@/lib/marketing/setup-steps";

export type SalesFacts = {
  canManageSettings: boolean;
  payments: { serverReady: boolean; account: boolean; live: boolean; taxActive: boolean; taxOn: boolean };
  email: { verified: boolean };
  products: { total: number; active: number; missingWeight: number; withoutPhotos: number };
  shipping: { fromSet: boolean; saved: boolean; source: "carrier" | "flat" | "free"; carrierConnected: boolean; fulfillmentOn: boolean; shipStationConnected: boolean };
  checkout: { alertsSaved: boolean; orders: number };
  estimates: { termsSet: boolean; sent: number };
  discounts: { count: number };
  trade: { saved: boolean; applications: number; approved: number };
};

export type SalesToolKey = "payments" | "products" | "shipping" | "checkout" | "estimates" | "discounts" | "trade";
export type SalesTool = ToolSetup<SalesToolKey>;

export function buildSalesSetup(f: SalesFacts): SalesTool[] {
  const owner = f.canManageSettings ? undefined : "An owner or admin on your team does this step.";
  const step = (s: SetupStep) => s;
  return [
    {
      key: "payments",
      name: "Payments",
      href: "/settings/payments",
      summary: "Connect your own Stripe account. Checkout and invoices pay straight into it.",
      steps: [
        step({
          key: "payments.connect",
          title: "Connect your Stripe account",
          body: "Sign in to Stripe, or make an account, from Bison Ops. Payments go to you, never through us. You'll need your business details and a bank account for payouts.",
          done: f.payments.account,
          href: "/settings/payments",
          cta: "Connect Stripe",
          blockedNote: owner ?? (f.payments.serverReady ? undefined : "Payments aren't switched on for this Bison Ops server yet."),
        }),
        step({
          key: "payments.verify",
          title: "Finish what Stripe asks for",
          body: "Stripe checks who you are before money can move. It usually takes a few minutes; sometimes they ask for a document.",
          done: f.payments.live,
          href: "/settings/payments",
          cta: "Continue in Stripe",
          blockedNote: owner,
        }),
        step({
          key: "payments.tax",
          title: "Collect sales tax with Stripe Tax",
          body: "Turn on Stripe Tax in your Stripe Dashboard and add where you're registered, then switch on tax here. Checkout and invoices add the right tax for each address.",
          done: f.payments.taxActive && f.payments.taxOn,
          href: "/sales/checkout#tax",
          cta: "Set up tax",
          optional: true,
        }),
      ],
    },
    {
      key: "products",
      name: "Products",
      href: "/sales/products",
      summary: "Your catalog, with options, prices, photos and what each item weighs.",
      steps: [
        step({
          key: "products.add",
          title: "Add or import your products",
          body: "Import a spreadsheet, a Shopify export or a product feed, or add products one at a time. Each one gets its own page with a link you can share.",
          done: f.products.total > 0,
          href: "/sales/products",
          cta: "Add products",
        }),
        step({
          key: "products.live",
          title: "Put products on sale",
          body: "Set a product to Active and it shows in your shop. Drafts stay hidden until they're ready.",
          done: f.products.active > 0,
          href: "/sales/products",
          cta: "Open Products",
        }),
        step({
          key: "products.weights",
          title: "Give every product a weight",
          body: f.products.missingWeight ? `${f.products.missingWeight} active ${f.products.missingWeight === 1 ? "product has" : "products have"} no weight. Carriers rate by weight and box, so live rates come out wrong without it.` : "Carriers rate by weight and box. Add both, or a flat shipping charge for items that don't ship by carrier.",
          done: f.products.active > 0 && f.products.missingWeight === 0,
          href: "/sales/products",
          cta: "Add weights",
          optional: f.shipping.source !== "carrier",
        }),
        step({
          key: "products.photos",
          title: "Add photos",
          body: "Products with photos sell better, and the first photo is the card people see when you share the link.",
          done: f.products.active > 0 && f.products.withoutPhotos === 0,
          href: "/sales/products",
          cta: "Add photos",
          optional: true,
        }),
      ],
    },
    {
      key: "shipping",
      name: "Shipping",
      href: "/sales/checkout#shipping",
      summary: "Where orders ship from, how shipping is charged, and where paid orders go to be packed.",
      steps: [
        step({
          key: "shipping.from",
          title: "Add the address you ship from",
          body: "Carriers rate from here, and it goes on your ShipStation orders.",
          done: f.shipping.fromSet,
          href: "/sales/checkout#shipping",
          cta: "Add the address",
        }),
        step({
          key: "shipping.rates",
          title: "Choose how shipping is charged",
          body: "Live rates from your carrier, a flat charge, or free. You can also ship free over an amount.",
          done: f.shipping.saved,
          href: "/sales/checkout#shipping",
          cta: "Choose",
        }),
        step({
          key: "shipping.carrier",
          title: "Connect ShipStation or UPS",
          body: "For live rates at checkout. ShipStation rates every carrier you have in it; UPS rates UPS services with your own account's prices.",
          done: f.shipping.carrierConnected,
          href: "/settings/shipping",
          cta: "Connect a carrier",
          optional: f.shipping.source !== "carrier",
          blockedNote: owner,
        }),
        step({
          key: "shipping.fulfillment",
          title: "Send paid orders to ShipStation",
          body: "Every paid order lands in ShipStation, ready to pack and label, with what was bought and the shipping they chose.",
          done: f.shipping.fulfillmentOn && f.shipping.shipStationConnected,
          href: "/sales/checkout#shipping",
          cta: "Turn it on",
          optional: true,
        }),
      ],
    },
    {
      key: "checkout",
      name: "Checkout",
      href: "/sales/checkout",
      summary: "Your shop, its checkout, and who hears about each order.",
      steps: [
        step({
          key: "checkout.email",
          title: "Set up email sending",
          body: "Estimates and order alerts go out from your own domain, the same setup Marketing uses. Without it they come from Bison Ops with your name on them.",
          done: f.email.verified,
          href: "/settings/email",
          cta: "Set up sending",
          blockedNote: owner,
        }),
        step({
          key: "checkout.alerts",
          title: "Choose who hears about new orders",
          body: "They get an email for every paid order, quote request, estimate reply and trade application.",
          done: f.checkout.alertsSaved,
          href: "/sales/checkout#alerts",
          cta: "Choose people",
        }),
        step({
          key: "checkout.first",
          title: "Take your first order",
          body: "Share a product link or your shop page. When someone pays, the order shows up here and the team gets an email.",
          done: f.checkout.orders > 0,
          href: "/sales/orders",
          cta: "Open Orders",
        }),
      ],
    },
    {
      key: "estimates",
      name: "Estimates",
      href: "/sales/estimates",
      summary: "Quotes your clients approve on their own page. Approved ones become invoices with a Pay link.",
      steps: [
        step({
          key: "estimates.terms",
          title: "Add your standard terms",
          body: "Deposits, lead times, what's included. They go on every new estimate, and you can change them on each one.",
          done: f.estimates.termsSet,
          href: "/sales/checkout#estimates",
          cta: "Add terms",
          optional: true,
        }),
        step({
          key: "estimates.first",
          title: "Send your first estimate",
          body: "Add lines from your catalog or type your own, then send it. Your client approves by typing their name, or asks for changes.",
          done: f.estimates.sent > 0,
          href: "/sales/estimates",
          cta: "New estimate",
        }),
      ],
    },
    {
      key: "discounts",
      name: "Discount codes",
      href: "/sales/discounts",
      summary: "Private codes with limits, spelled out in one sentence before you save.",
      optional: true,
      steps: [
        step({
          key: "discounts.first",
          title: "Make a discount code",
          body: "Percent or amount off, with a minimum order, an end date and how often it can be used.",
          done: f.discounts.count > 0,
          href: "/sales/discounts",
          cta: "New code",
        }),
      ],
    },
    {
      key: "trade",
      name: "Trade accounts",
      href: "/sales/trade",
      summary: "Wholesale buyers apply, you approve, and their prices step down as they buy more.",
      optional: true,
      steps: [
        step({
          key: "trade.tiers",
          title: "Set your trade tiers",
          body: "How much off each tier gets, and the 12-month spend that reaches it. Three tiers are set up to start.",
          done: f.trade.saved,
          href: "/sales/trade#tiers",
          cta: "Set tiers",
        }),
        step({
          key: "trade.approve",
          title: "Approve your first trade account",
          body: "Share your application page with buyers. Once you approve them, they sign in by email and see their prices.",
          done: f.trade.approved > 0,
          href: "/sales/trade",
          cta: "Open Trade accounts",
        }),
      ],
    },
  ];
}
