import "server-only";
// Taking the company's money into the company's own Stripe account. Bison Ops
// is the Connect platform: each company gets a connected account with its own
// full Stripe Dashboard (Accounts v2, Stripe collecting fees and covering
// losses, the current form of a Standard account). Checkout and invoices are
// created on that account, so payments never pass through Bison Ops.
//
// An offline stand-in keeps everything in memory for tests and local work,
// with pages under /api/dev/payments that play the part of Stripe.
import Stripe from "stripe";
import { appUrl, onVercel } from "@/lib/env";
import { stripe } from "@/lib/billing/stripe-client";
import type { Address } from "./settings";

export type AccountState = {
  accountId: string;
  /** Card payments are live: checkout and invoices work. */
  chargesEnabled: boolean;
  /** Stripe wants more from the company (details, documents, a bank account). */
  needsAction: boolean;
  status: "active" | "pending" | "restricted" | "rejected" | "unsupported" | "unknown";
};

export type TaxState = "active" | "pending" | "unknown";

export type CheckoutLine = { name: string; qty: number; unitCents: number; taxCode: string; variantId: string; image?: string | null };

export type CheckoutParams = {
  cartId: string;
  currency: string;
  email: string;
  lines: CheckoutLine[];
  discount: { label: string; amountCents: number } | null;
  countries: string[];
  collectPhone: boolean;
  tax: boolean;
  returnUrl: string;
  expiresAt: Date;
};

export type ShippingChoice = { id: string; label: string; amountCents: number; days: number | null };

export type CheckoutState = {
  sessionId: string;
  status: "open" | "complete" | "expired";
  paid: boolean;
  email: string;
  name: string;
  phone: string;
  shipTo: (Partial<Address> & { name?: string }) | null;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  shippingLabel: string;
  paymentIntentId: string | null;
  cartId: string | null;
};

export type InvoiceParams = {
  estimateId: string;
  number: number;
  currency: string;
  customer: { email: string; name: string; address: Partial<Address> | null };
  lines: { description: string; amountCents: number; taxCode?: string }[];
  shippingCents: number;
  discount: { label: string; amountCents: number } | null;
  tax: boolean;
  dueDays: number;
  memo: string;
  footer: string;
};

export type InvoiceState = { invoiceId: string; status: "draft" | "open" | "paid" | "void" | "uncollectible"; hostedUrl: string | null; totalCents: number; taxCents: number; paymentIntentId: string | null; customerId: string | null };

export class PaymentsError extends Error {
  constructor(
    message: string,
    readonly retry = false,
  ) {
    super(message);
  }
}

export interface PaymentsProvider {
  name: "stripe" | "stand-in";
  /** The key the browser uses to show Stripe's payment form. Null for the stand-in. */
  publishableKey: string | null;
  createAccount(input: { email: string; businessName: string; country: string; website: string | null }): Promise<string>;
  onboardingLink(accountId: string, urls: { refreshUrl: string; returnUrl: string }): Promise<string>;
  account(accountId: string): Promise<AccountState>;
  dashboardUrl(accountId: string): string;
  tax(accountId: string): Promise<TaxState>;
  createCheckout(accountId: string, p: CheckoutParams): Promise<{ sessionId: string; clientSecret: string }>;
  setCheckoutShipping(accountId: string, sessionId: string, input: { name: string; address: Address; options: ShippingChoice[]; currency: string; tax: boolean }): Promise<void>;
  checkout(accountId: string, sessionId: string): Promise<CheckoutState>;
  expireCheckout(accountId: string, sessionId: string): Promise<void>;
  createInvoice(accountId: string, p: InvoiceParams): Promise<InvoiceState>;
  invoice(accountId: string, invoiceId: string): Promise<InvoiceState>;
  voidInvoice(accountId: string, invoiceId: string): Promise<void>;
  refund(accountId: string, input: { paymentIntentId: string; amountCents: number; key: string }): Promise<{ refundId: string }>;
  /** How much of a payment has been refunded so far, read fresh. */
  refunded(accountId: string, paymentIntentId: string): Promise<number>;
  paymentUrl(accountId: string, paymentIntentId: string): string;
}

// ---- Stripe -----------------------------------------------------------------------

const SHIPPING_TAX_CODE = "txcd_92010001";

function messageOf(err: unknown): string {
  if (err instanceof Stripe.errors.StripeError) return err.message;
  return err instanceof Error ? err.message : "Stripe didn't answer.";
}

function wrap(err: unknown): never {
  const retry = err instanceof Stripe.errors.StripeConnectionError || err instanceof Stripe.errors.StripeRateLimitError || err instanceof Stripe.errors.StripeAPIError;
  throw new PaymentsError(`Stripe said: ${messageOf(err)}`, retry);
}

function stripeAddress(a: Partial<Address>) {
  return { line1: a.line1 || undefined, line2: a.line2 || undefined, city: a.city || undefined, state: a.state || undefined, postal_code: a.postal || undefined, country: a.country || "US" };
}

function fromStripeAddress(a: Stripe.Address | null | undefined, name?: string | null): (Partial<Address> & { name?: string }) | null {
  if (!a) return null;
  return { name: name ?? "", line1: a.line1 ?? "", line2: a.line2 ?? "", city: a.city ?? "", state: a.state ?? "", postal: a.postal_code ?? "", country: a.country ?? "" };
}

function invoiceStatus(s: string | null): InvoiceState["status"] {
  return s === "open" || s === "paid" || s === "void" || s === "uncollectible" ? s : "draft";
}

function idOf(x: string | { id: string } | null | undefined): string | null {
  return x ? (typeof x === "string" ? x : x.id) : null;
}

function readInvoice(inv: Stripe.Invoice): InvoiceState {
  const tax = (inv.total_taxes ?? []).reduce((n, t) => n + (t.amount ?? 0), 0);
  const pi = (inv as unknown as { payments?: { data?: { payment?: { payment_intent?: string | { id: string } } }[] } }).payments?.data?.[0]?.payment?.payment_intent;
  return { invoiceId: inv.id ?? "", status: invoiceStatus(inv.status), hostedUrl: inv.hosted_invoice_url ?? null, totalCents: inv.total, taxCents: tax, paymentIntentId: idOf(pi ?? null), customerId: idOf(inv.customer as string | null) };
}

export function stripePayments(client: Stripe = stripe()): PaymentsProvider {
  const live = !(process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
  const dash = live ? "https://dashboard.stripe.com" : "https://dashboard.stripe.com/test";
  return {
    name: "stripe",
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null,

    async createAccount(input) {
      try {
        const acct = await client.v2.core.accounts.create({
          contact_email: input.email,
          display_name: input.businessName,
          dashboard: "full",
          identity: { country: input.country.toLowerCase(), business_details: { registered_name: input.businessName } },
          configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
          defaults: { currency: "usd", responsibilities: { fees_collector: "stripe", losses_collector: "stripe" }, locales: ["en-US"], ...(input.website ? { profile: { business_url: input.website } } : {}) },
          include: ["configuration.merchant", "requirements"],
        } as Stripe.V2.Core.AccountCreateParams);
        return acct.id;
      } catch (err) {
        wrap(err);
      }
    },

    async onboardingLink(accountId, urls) {
      try {
        const link = await client.v2.core.accountLinks.create({ account: accountId, use_case: { type: "account_onboarding", account_onboarding: { refresh_url: urls.refreshUrl, return_url: urls.returnUrl } } } as Stripe.V2.Core.AccountLinkCreateParams);
        return link.url;
      } catch (err) {
        wrap(err);
      }
    },

    async account(accountId) {
      try {
        const a = await client.v2.core.accounts.retrieve(accountId, { include: ["configuration.merchant", "requirements"] });
        const status = (a.configuration?.merchant?.capabilities?.card_payments?.status ?? "unknown") as AccountState["status"];
        const entries = (a.requirements as { entries?: { awaiting_action_from?: string }[] } | undefined)?.entries ?? [];
        return { accountId, chargesEnabled: status === "active", needsAction: entries.some((e) => e.awaiting_action_from === "user"), status };
      } catch (err) {
        wrap(err);
      }
    },

    dashboardUrl(accountId) {
      return `${dash}/connect/accounts/${accountId}`;
    },

    async tax(accountId) {
      try {
        const s = await client.tax.settings.retrieve({}, { stripeAccount: accountId });
        return s.status === "active" ? "active" : "pending";
      } catch {
        return "unknown";
      }
    },

    async createCheckout(accountId, p) {
      try {
        let coupon: string | undefined;
        if (p.discount && p.discount.amountCents > 0) {
          const c = await client.coupons.create({ amount_off: p.discount.amountCents, currency: p.currency, duration: "once", max_redemptions: 1, name: p.discount.label.slice(0, 40) }, { stripeAccount: accountId, idempotencyKey: `bison-coupon-${p.cartId}-${p.discount.amountCents}-${p.expiresAt.getTime()}` });
          coupon = c.id;
        }
        const session = await client.checkout.sessions.create(
          {
            ui_mode: "elements",
            mode: "payment",
            customer_email: p.email,
            line_items: p.lines.map((l) => ({
              quantity: l.qty,
              price_data: {
                currency: p.currency,
                unit_amount: l.unitCents,
                ...(p.tax ? { tax_behavior: "exclusive" as const } : {}),
                product_data: { name: l.name.slice(0, 250), ...(l.taxCode ? { tax_code: l.taxCode } : {}), ...(l.image?.startsWith("https://") ? { images: [l.image] } : {}), metadata: { variant: l.variantId } },
              },
            })),
            shipping_address_collection: { allowed_countries: p.countries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] },
            permissions: { update_shipping_details: "server_only" },
            phone_number_collection: { enabled: p.collectPhone },
            automatic_tax: { enabled: p.tax },
            ...(coupon ? { discounts: [{ coupon }] } : {}),
            return_url: p.returnUrl,
            expires_at: Math.floor(p.expiresAt.getTime() / 1000),
            metadata: { bison_cart: p.cartId },
            payment_intent_data: { metadata: { bison_cart: p.cartId } },
          } as Stripe.Checkout.SessionCreateParams,
          { stripeAccount: accountId, idempotencyKey: `bison-checkout-${p.cartId}-${p.expiresAt.getTime()}` },
        );
        if (!session.client_secret) throw new PaymentsError("Stripe didn't return a checkout to show.");
        return { sessionId: session.id, clientSecret: session.client_secret };
      } catch (err) {
        if (err instanceof PaymentsError) throw err;
        wrap(err);
      }
    },

    async setCheckoutShipping(accountId, sessionId, input) {
      try {
        await client.checkout.sessions.update(
          sessionId,
          {
            collected_information: { shipping_details: { name: input.name || input.address.name || "Customer", address: stripeAddress(input.address) as Stripe.Checkout.SessionUpdateParams.CollectedInformation.ShippingDetails.Address } },
            shipping_options: input.options.map((o) => ({
              shipping_rate_data: {
                type: "fixed_amount",
                display_name: o.label.slice(0, 100),
                fixed_amount: { amount: o.amountCents, currency: input.currency },
                ...(input.tax ? { tax_behavior: "exclusive" as const, tax_code: SHIPPING_TAX_CODE } : {}),
                ...(o.days ? { delivery_estimate: { minimum: { unit: "business_day" as const, value: o.days }, maximum: { unit: "business_day" as const, value: o.days } } } : {}),
                metadata: { option: o.id },
              },
            })),
          },
          { stripeAccount: accountId },
        );
      } catch (err) {
        wrap(err);
      }
    },

    async checkout(accountId, sessionId) {
      try {
        const s = await client.checkout.sessions.retrieve(sessionId, { expand: ["shipping_cost.shipping_rate"] }, { stripeAccount: accountId });
        const ship = (s as unknown as { collected_information?: { shipping_details?: { name?: string; address?: Stripe.Address } } }).collected_information?.shipping_details;
        const rate = s.shipping_cost?.shipping_rate;
        return {
          sessionId: s.id,
          status: (s.status ?? "open") as CheckoutState["status"],
          paid: s.payment_status === "paid" || s.payment_status === "no_payment_required",
          email: (s.customer_details?.email ?? s.customer_email ?? "").toLowerCase(),
          name: s.customer_details?.name ?? ship?.name ?? "",
          phone: s.customer_details?.phone ?? "",
          shipTo: fromStripeAddress(ship?.address, ship?.name),
          subtotalCents: s.amount_subtotal ?? 0,
          discountCents: s.total_details?.amount_discount ?? 0,
          shippingCents: s.total_details?.amount_shipping ?? 0,
          taxCents: s.total_details?.amount_tax ?? 0,
          totalCents: s.amount_total ?? 0,
          currency: s.currency ?? "usd",
          shippingLabel: rate && typeof rate !== "string" ? rate.display_name ?? "" : "",
          paymentIntentId: idOf(s.payment_intent as string | null),
          cartId: s.metadata?.bison_cart ?? null,
        };
      } catch (err) {
        wrap(err);
      }
    },

    async expireCheckout(accountId, sessionId) {
      try {
        await client.checkout.sessions.expire(sessionId, {}, { stripeAccount: accountId });
      } catch {
        // Already complete or expired.
      }
    },

    async createInvoice(accountId, p) {
      const opts = (suffix: string) => ({ stripeAccount: accountId, idempotencyKey: `bison-estimate-${p.estimateId}-${suffix}` });
      try {
        const customer = await client.customers.create(
          { email: p.customer.email, name: p.customer.name || undefined, ...(p.customer.address?.line1 ? { address: stripeAddress(p.customer.address), shipping: { name: p.customer.name || p.customer.email, address: stripeAddress(p.customer.address) } } : {}), metadata: { bison_estimate: p.estimateId } },
          opts("customer"),
        );
        let coupon: string | undefined;
        if (p.discount && p.discount.amountCents > 0) coupon = (await client.coupons.create({ amount_off: p.discount.amountCents, currency: p.currency, duration: "once", max_redemptions: 1, name: p.discount.label.slice(0, 40) }, opts("coupon"))).id;
        const invoice = await client.invoices.create(
          {
            customer: customer.id,
            collection_method: "send_invoice",
            days_until_due: Math.max(0, p.dueDays),
            auto_advance: false,
            currency: p.currency,
            automatic_tax: { enabled: p.tax },
            pending_invoice_items_behavior: "exclude",
            description: p.memo.slice(0, 1500) || undefined,
            footer: p.footer.slice(0, 5000) || undefined,
            ...(coupon ? { discounts: [{ coupon }] } : {}),
            metadata: { bison_estimate: p.estimateId, bison_estimate_number: String(p.number) },
          },
          opts("invoice"),
        );
        let i = 0;
        for (const line of p.lines) {
          await client.invoiceItems.create({ customer: customer.id, invoice: invoice.id, currency: p.currency, amount: line.amountCents, description: line.description.slice(0, 500), ...(p.tax ? { tax_behavior: "exclusive" as const } : {}), ...(line.taxCode ? { tax_code: line.taxCode } : {}) }, opts(`line-${i++}`));
        }
        if (p.shippingCents > 0) await client.invoiceItems.create({ customer: customer.id, invoice: invoice.id, currency: p.currency, amount: p.shippingCents, description: "Shipping", ...(p.tax ? { tax_behavior: "exclusive" as const, tax_code: SHIPPING_TAX_CODE } : {}) }, opts("shipping"));
        const final = await client.invoices.finalizeInvoice(invoice.id!, { auto_advance: false }, { stripeAccount: accountId });
        return readInvoice(final);
      } catch (err) {
        wrap(err);
      }
    },

    async invoice(accountId, invoiceId) {
      try {
        return readInvoice(await client.invoices.retrieve(invoiceId, { expand: ["payments"] }, { stripeAccount: accountId }));
      } catch (err) {
        wrap(err);
      }
    },

    async voidInvoice(accountId, invoiceId) {
      try {
        await client.invoices.voidInvoice(invoiceId, {}, { stripeAccount: accountId });
      } catch (err) {
        wrap(err);
      }
    },

    async refund(accountId, input) {
      try {
        const r = await client.refunds.create({ payment_intent: input.paymentIntentId, amount: input.amountCents, reason: "requested_by_customer" }, { stripeAccount: accountId, idempotencyKey: input.key });
        return { refundId: r.id };
      } catch (err) {
        wrap(err);
      }
    },

    async refunded(accountId, paymentIntentId) {
      try {
        const pi = await client.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] }, { stripeAccount: accountId });
        const charge = pi.latest_charge;
        return charge && typeof charge !== "string" ? charge.amount_refunded : 0;
      } catch (err) {
        wrap(err);
      }
    },

    paymentUrl(accountId, paymentIntentId) {
      return `${dash}/connect/accounts/${accountId}/payments/${paymentIntentId}`;
    },
  };
}

// ---- The stand-in ---------------------------------------------------------------------

type StandInCheckout = CheckoutState & { accountId: string; params: CheckoutParams; options: ShippingChoice[]; chosen: string | null; expiresAt: number };
type StandInInvoice = InvoiceState & { accountId: string; params: InvoiceParams };
type StandInStore = {
  accounts: Map<string, { onboarded: boolean; tax: boolean }>;
  checkouts: Map<string, StandInCheckout>;
  invoices: Map<string, StandInInvoice>;
  refunds: Map<string, number>;
  seq: number;
};

function store(): StandInStore {
  const g = globalThis as unknown as { __bisonPayments?: StandInStore };
  g.__bisonPayments ??= { accounts: new Map(), checkouts: new Map(), invoices: new Map(), refunds: new Map(), seq: 0 };
  return g.__bisonPayments;
}

const nextId = (prefix: string) => `${prefix}_standin_${(++store().seq).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function standInPayments(): PaymentsProvider {
  const base = appUrl();
  return {
    name: "stand-in",
    publishableKey: null,
    async createAccount() {
      const id = nextId("acct");
      store().accounts.set(id, { onboarded: false, tax: false });
      return id;
    },
    async onboardingLink(accountId, urls) {
      return `${base}/api/dev/payments/onboard?account=${encodeURIComponent(accountId)}&return=${encodeURIComponent(urls.returnUrl)}`;
    },
    async account(accountId) {
      // After a server restart the stand-in forgets; a known-looking id counts as set up.
      const a = store().accounts.get(accountId) ?? (accountId.startsWith("acct_standin_") ? { onboarded: true, tax: false } : undefined);
      if (!a) throw new PaymentsError("No such account.");
      return { accountId, chargesEnabled: a.onboarded, needsAction: !a.onboarded, status: a.onboarded ? "active" : "pending" };
    },
    dashboardUrl(accountId) {
      return `${base}/api/dev/payments/onboard?account=${encodeURIComponent(accountId)}&view=1`;
    },
    async tax(accountId) {
      return store().accounts.get(accountId)?.tax ? "active" : "pending";
    },
    async createCheckout(accountId, p) {
      const sessionId = nextId("cs");
      const subtotal = p.lines.reduce((n, l) => n + l.unitCents * l.qty, 0);
      const discount = p.discount?.amountCents ?? 0;
      store().checkouts.set(sessionId, {
        accountId,
        params: p,
        options: [],
        chosen: null,
        expiresAt: p.expiresAt.getTime(),
        sessionId,
        status: "open",
        paid: false,
        email: p.email,
        name: "",
        phone: "",
        shipTo: null,
        subtotalCents: subtotal,
        discountCents: discount,
        shippingCents: 0,
        taxCents: 0,
        totalCents: subtotal - discount,
        currency: p.currency,
        shippingLabel: "",
        paymentIntentId: null,
        cartId: p.cartId,
      });
      return { sessionId, clientSecret: `${sessionId}_secret_standin` };
    },
    async setCheckoutShipping(_accountId, sessionId, input) {
      const s = store().checkouts.get(sessionId);
      if (!s || s.status !== "open") throw new PaymentsError("That checkout has ended.");
      s.shipTo = { ...input.address, name: input.name };
      s.name = input.name;
      s.options = input.options;
      s.chosen = input.options[0]?.id ?? null;
    },
    async checkout(_accountId, sessionId) {
      const s = store().checkouts.get(sessionId);
      if (!s) throw new PaymentsError("No such checkout.");
      if (s.status === "open" && Date.now() > s.expiresAt) s.status = "expired";
      const { accountId: _a, params: _p, options: _o, chosen: _c, expiresAt: _e, ...state } = s;
      return state;
    },
    async expireCheckout(_accountId, sessionId) {
      const s = store().checkouts.get(sessionId);
      if (s && s.status === "open") s.status = "expired";
    },
    async createInvoice(accountId, p) {
      const invoiceId = nextId("in");
      const total = p.lines.reduce((n, l) => n + l.amountCents, 0) + p.shippingCents - (p.discount?.amountCents ?? 0);
      const inv: StandInInvoice = { accountId, params: p, invoiceId, status: "open", hostedUrl: `${base}/api/dev/payments/invoice?id=${invoiceId}`, totalCents: Math.max(0, total), taxCents: 0, paymentIntentId: null, customerId: nextId("cus") };
      store().invoices.set(invoiceId, inv);
      const { accountId: _a, params: _p, ...state } = inv;
      return state;
    },
    async invoice(_accountId, invoiceId) {
      const inv = store().invoices.get(invoiceId);
      if (!inv) throw new PaymentsError("No such invoice.");
      const { accountId: _a, params: _p, ...state } = inv;
      return state;
    },
    async voidInvoice(_accountId, invoiceId) {
      const inv = store().invoices.get(invoiceId);
      if (inv && inv.status === "open") inv.status = "void";
    },
    async refund(_accountId, input) {
      store().refunds.set(input.paymentIntentId, (store().refunds.get(input.paymentIntentId) ?? 0) + input.amountCents);
      return { refundId: nextId("re") };
    },
    async refunded(_accountId, paymentIntentId) {
      return store().refunds.get(paymentIntentId) ?? 0;
    },
    paymentUrl(_accountId, paymentIntentId) {
      return `${base}/api/dev/payments/payment?id=${encodeURIComponent(paymentIntentId)}`;
    },
  };
}

/** The stand-in's own records, for the dev pages that play Stripe. */
export function standInStore() {
  return store();
}

/** Marks a stand-in checkout paid with the chosen shipping, as Stripe would. */
export function standInPay(sessionId: string, optionId: string | null, phone = ""): CheckoutState {
  const s = store().checkouts.get(sessionId);
  if (!s) throw new PaymentsError("No such checkout.");
  if (s.status !== "open") throw new PaymentsError("That checkout has ended.");
  if (!s.shipTo) throw new PaymentsError("Add a shipping address first.");
  const choice = s.options.find((o) => o.id === (optionId ?? s.chosen)) ?? s.options[0];
  if (!choice) throw new PaymentsError("Pick a shipping option.");
  s.shippingCents = choice.amountCents;
  s.shippingLabel = choice.label;
  s.taxCents = s.params.tax ? Math.round((s.subtotalCents - s.discountCents) * 0.08) : 0;
  s.totalCents = s.subtotalCents - s.discountCents + s.shippingCents + s.taxCents;
  s.phone = phone;
  s.status = "complete";
  s.paid = true;
  s.paymentIntentId = nextId("pi");
  return { ...s };
}

export function standInPayInvoice(invoiceId: string): InvoiceState & { accountId: string } {
  const inv = store().invoices.get(invoiceId);
  if (!inv) throw new PaymentsError("No such invoice.");
  if (inv.status !== "open") throw new PaymentsError("That invoice isn't open.");
  inv.status = "paid";
  inv.paymentIntentId = nextId("pi");
  return { ...inv };
}

export function standInOnboard(accountId: string, opts: { tax?: boolean } = {}) {
  const a = store().accounts.get(accountId) ?? { onboarded: false, tax: false };
  a.onboarded = true;
  if (opts.tax !== undefined) a.tax = opts.tax;
  store().accounts.set(accountId, a);
}

// ---- Which one --------------------------------------------------------------------

export function paymentsProviderName(): "stripe" | "stand-in" | "none" {
  const explicit = process.env.PAYMENTS_PROVIDER;
  if (explicit === "stand-in") return onVercel() && process.env.VERCEL_ENV === "production" ? "none" : "stand-in";
  return process.env.STRIPE_SECRET_KEY ? "stripe" : "none";
}

let cached: { key: string; provider: PaymentsProvider | null } | null = null;

export function paymentsProvider(): PaymentsProvider | null {
  const name = paymentsProviderName();
  const key = `${name}:${process.env.STRIPE_SECRET_KEY ?? ""}`;
  if (cached?.key === key) return cached.provider;
  const provider = name === "stripe" ? stripePayments() : name === "stand-in" ? standInPayments() : null;
  cached = { key, provider };
  return provider;
}

/** The dev pages that play Stripe only exist with the stand-in, never on Vercel. */
export function devPaymentsAllowed(): boolean {
  return paymentsProviderName() === "stand-in" && !onVercel();
}

export const PAYMENTS_NOT_SET_UP = "Payments aren't switched on for this Bison Ops server yet (no STRIPE_SECRET_KEY).";
