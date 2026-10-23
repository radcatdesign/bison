// Step-by-step setup for every Sales tool. Pure: plain facts in (what's saved,
// what's connected, how many products), each tool's steps out. Same shape as
// Marketing's, so the same guide shows them. Both editions: a Fit Funnels club
// adds memberships and packs, sends corporate quotes and runs corporate accounts.
import { type EditionKey, sayFor } from "@/config/editions";
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

export function buildSalesSetup(f: SalesFacts, edition: EditionKey = "bison"): SalesTool[] {
  const say = sayFor(edition);
  const owner = f.canManageSettings ? undefined : "An owner or admin on your team does this step.";
  const step = (s: SetupStep) => s;
  const noWeight = f.products.missingWeight;
  return [
    {
      key: "payments",
      name: "Payments",
      href: "/settings/payments",
      summary: say("Connect your own Stripe account. Checkout and invoices pay straight into it.", "Connect your own Stripe account. Memberships, packs and corporate invoices pay straight into it."),
      steps: [
        step({
          key: "payments.connect",
          title: "Connect your Stripe account",
          body: say("Sign in to Stripe, or make an account, from Bison Ops. Payments go to you, never through us. You'll need your business details and a bank account for payouts.", "Sign in to Stripe, or make an account, from Fit Funnels. Payments go to your club, never through us. You'll need your business details and a bank account for payouts."),
          done: f.payments.account,
          href: "/settings/payments",
          cta: "Connect Stripe",
          blockedNote: owner ?? (f.payments.serverReady ? undefined : say("Payments aren't switched on for this Bison Ops server yet.", "Payments aren't switched on for this Fit Funnels server yet.")),
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
          body: say("Turn on Stripe Tax in your Stripe Dashboard and add where you're registered, then switch on tax here. Checkout and invoices add the right tax for each address.", "If you collect tax on memberships or gear, turn on Stripe Tax in your Stripe Dashboard and add where you're registered, then switch on tax here. Checkout and invoices add the right tax for each address."),
          done: f.payments.taxActive && f.payments.taxOn,
          href: "/sales/checkout#tax",
          cta: "Set up tax",
          optional: true,
        }),
      ],
    },
    {
      key: "products",
      name: say("Products", "Memberships"),
      href: "/sales/products",
      summary: say("Your catalog, with options, prices, photos and what each item weighs.", "Memberships, class packs, personal training and gear, with options and prices."),
      steps: [
        step({
          key: "products.add",
          title: say("Add or import your products", "Add your memberships and packs"),
          body: say("Import a spreadsheet, a Shopify export or a product feed, or add products one at a time. Each one gets its own page with a link you can share.", "Add your memberships, class packs, personal training and any gear, or import a spreadsheet. Each one gets its own page with a link you can share."),
          done: f.products.total > 0,
          href: "/sales/products",
          cta: say("Add products", "Add memberships"),
        }),
        step({
          key: "products.live",
          title: say("Put products on sale", "Put them on sale"),
          body: say("Set a product to Active and it shows in your shop. Drafts stay hidden until they're ready.", "Set a membership or pack to Active and it shows in your club's online store. Drafts stay hidden until they're ready."),
          done: f.products.active > 0,
          href: "/sales/products",
          cta: say("Open Products", "Open Memberships"),
        }),
        step({
          key: "products.weights",
          title: say("Give every product a weight", "Give your gear a weight"),
          body: say(
            noWeight ? `${noWeight} active ${noWeight === 1 ? "product has" : "products have"} no weight. Carriers rate by weight and box, so live rates come out wrong without it.` : "Carriers rate by weight and box. Add both, or a flat shipping charge for items that don't ship by carrier.",
            noWeight ? `${noWeight} active ${noWeight === 1 ? "item has" : "items have"} no weight or flat shipping charge. Only gear ships: give gear a weight and a box, and give memberships, packs and training a flat shipping charge of 0.` : "Only gear ships. Give gear a weight and a box so carriers rate it right, and give memberships, packs and training a flat shipping charge of 0.",
          ),
          done: f.products.active > 0 && f.products.missingWeight === 0,
          href: "/sales/products",
          cta: "Add weights",
          optional: f.shipping.source !== "carrier",
        }),
        step({
          key: "products.photos",
          title: "Add photos",
          body: say("Products with photos sell better, and the first photo is the card people see when you share the link.", "Photos of your floor, studios and classes help people picture joining, and the first photo is the card people see when you share the link."),
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
      summary: say("Where orders ship from, how shipping is charged, and where paid orders go to be packed.", "Only gear ships; memberships, packs and training don't. Where gear ships from, how shipping is charged, and where paid purchases go to be packed."),
      steps: [
        step({
          key: "shipping.from",
          title: "Add the address you ship from",
          body: say("Carriers rate from here, and it goes on your ShipStation orders.", "Carriers rate gear from here, and it goes on your ShipStation orders."),
          done: f.shipping.fromSet,
          href: "/sales/checkout#shipping",
          cta: "Add the address",
        }),
        step({
          key: "shipping.rates",
          title: "Choose how shipping is charged",
          body: say("Live rates from your carrier, a flat charge, or free. You can also ship free over an amount.", "Live rates from your carrier, a flat charge, or free. A flat charge applies to every purchase, so live rates or free fit best when most purchases are memberships and packs."),
          done: f.shipping.saved,
          href: "/sales/checkout#shipping",
          cta: "Choose",
        }),
        step({
          key: "shipping.carrier",
          title: "Connect ShipStation or UPS",
          body: say("For live rates at checkout. ShipStation rates every carrier you have in it; UPS rates UPS services with your own account's prices.", "For live gear rates at checkout. ShipStation rates every carrier you have in it; UPS rates UPS services with your own account's prices."),
          done: f.shipping.carrierConnected,
          href: "/settings/shipping",
          cta: "Connect a carrier",
          optional: f.shipping.source !== "carrier",
          blockedNote: owner,
        }),
        step({
          key: "shipping.fulfillment",
          title: say("Send paid orders to ShipStation", "Send paid purchases to ShipStation"),
          body: say("Every paid order lands in ShipStation, ready to pack and label, with what was bought and the shipping they chose.", "Every paid purchase lands in ShipStation with what was bought and the shipping they chose, so your team can pack and label the gear."),
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
      summary: say("Your shop, its checkout, and who hears about each order.", "Your club's online store, its checkout, and who hears about each purchase."),
      steps: [
        step({
          key: "checkout.email",
          title: "Set up email sending",
          body: say("Estimates and order alerts go out from your own domain, the same setup Marketing uses. Without it they come from Bison Ops with your name on them.", "Quotes and purchase alerts go out from your own domain, the same setup Marketing uses. Without it they come from Fit Funnels with your club's name on them."),
          done: f.email.verified,
          href: "/settings/email",
          cta: "Set up sending",
          blockedNote: owner,
        }),
        step({
          key: "checkout.alerts",
          title: say("Choose who hears about new orders", "Choose who hears about new purchases"),
          body: say("They get an email for every paid order, quote request, estimate reply and trade application.", "Your front desk, coaches or managers get an email for every paid purchase, quote request, quote reply and corporate account application."),
          done: f.checkout.alertsSaved,
          href: "/sales/checkout#alerts",
          cta: "Choose people",
        }),
        step({
          key: "checkout.first",
          title: say("Take your first order", "Take your first purchase"),
          body: say("Share a product link or your shop page. When someone pays, the order shows up here and the team gets an email.", "Share a membership link or your club's online store. When someone pays, the purchase shows up here and your team gets an email."),
          done: f.checkout.orders > 0,
          href: "/sales/orders",
          cta: say("Open Orders", "Open Purchases"),
        }),
      ],
    },
    {
      key: "estimates",
      name: say("Estimates", "Quotes"),
      href: "/sales/estimates",
      summary: say("Quotes your clients approve on their own page. Approved ones become invoices with a Pay link.", "Corporate memberships, PT bundles, team rides and events, approved on their own page. Approved quotes become invoices with a Pay link."),
      steps: [
        step({
          key: "estimates.terms",
          title: "Add your standard terms",
          body: say("Deposits, lead times, what's included. They go on every new estimate, and you can change them on each one.", "Start dates, cancellation, what's included. They go on every new quote, and you can change them on each one."),
          done: f.estimates.termsSet,
          href: "/sales/checkout#estimates",
          cta: "Add terms",
          optional: true,
        }),
        step({
          key: "estimates.first",
          title: say("Send your first estimate", "Send a corporate quote"),
          body: say("Add lines from your catalog or type your own, then send it. Your client approves by typing their name, or asks for changes.", "Add memberships, packs or training from your list, or type your own lines, then send it. The person you quote approves by typing their name, or asks for changes."),
          done: f.estimates.sent > 0,
          href: "/sales/estimates",
          cta: say("New estimate", "New quote"),
        }),
      ],
    },
    {
      key: "discounts",
      name: say("Discount codes", "Promo codes"),
      href: "/sales/discounts",
      summary: "Private codes with limits, spelled out in one sentence before you save.",
      optional: true,
      steps: [
        step({
          key: "discounts.first",
          title: say("Make a discount code", "Make a promo code"),
          body: say("Percent or amount off, with a minimum order, an end date and how often it can be used.", "Percent or amount off, with a minimum purchase, an end date and how often it can be used. Handy for referrals, challenges and events."),
          done: f.discounts.count > 0,
          href: "/sales/discounts",
          cta: "New code",
        }),
      ],
    },
    {
      key: "trade",
      name: say("Trade accounts", "Corporate accounts"),
      href: "/sales/trade",
      summary: say("Wholesale buyers apply, you approve, and their prices step down as they buy more.", "Local companies apply, you approve, and they buy memberships and packs for their staff at corporate pricing that steps down as they buy more."),
      optional: true,
      steps: [
        step({
          key: "trade.tiers",
          title: say("Set your trade tiers", "Set your corporate tiers"),
          body: "How much off each tier gets, and the 12-month spend that reaches it. Three tiers are set up to start.",
          done: f.trade.saved,
          href: "/sales/trade#tiers",
          cta: "Set tiers",
        }),
        step({
          key: "trade.approve",
          title: say("Approve your first trade account", "Approve your first corporate account"),
          body: say("Share your application page with buyers. Once you approve them, they sign in by email and see their prices.", "Share your application page with local employers. Once you approve a company, it signs in by email and sees your corporate prices."),
          done: f.trade.approved > 0,
          href: "/sales/trade",
          cta: say("Open Trade accounts", "Open Corporate accounts"),
        }),
      ],
    },
  ];
}
