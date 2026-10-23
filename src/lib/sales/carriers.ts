import "server-only";
// Live shipping rates and fulfillment through each company's own carrier
// accounts. ShipStation (API v2, one API key) rates across every carrier the
// company has in ShipStation and takes paid orders for packing and labels.
// UPS (OAuth client credentials plus an account number) rates UPS services.
// The stand-in answers with made-up rates for tests and local work.
import { onVercel } from "@/lib/env";
import type { Package } from "./packing";
import type { Address, CarrierKey } from "./settings";

export type Rate = { code: string; service: string; carrier: string; amountCents: number; days: number | null };

export type RateRequest = { from: Address; to: Address; residential: boolean; packages: Package[]; currency: string };

export type FulfillmentOrder = {
  orderId: string;
  number: number;
  shipTo: Address & { email?: string };
  from: Address;
  items: { name: string; sku: string; qty: number; unitCents: number }[];
  packages: Package[];
  totalCents: number;
  shippingCents: number;
  shippingService: string;
  currency: string;
};

export class CarrierError extends Error {
  constructor(
    message: string,
    readonly retry = false,
  ) {
    super(message);
  }
}

export type CarrierTest = { ok: true; detail: string; carriers?: { id: string; name: string }[] } | { ok: false; error: string };

export interface Carrier {
  key: CarrierKey | "stand-in";
  test(): Promise<CarrierTest>;
  rates(req: RateRequest): Promise<Rate[]>;
  /** Puts a paid order in the carrier's queue to be packed and labeled. Returns its id there. */
  fulfill?(order: FulfillmentOrder): Promise<string>;
}

type Fetch = typeof fetch;

const TIMEOUT_MS = 8000;

async function call(fetcher: Fetch, url: string, init: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetcher(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new CarrierError("The carrier didn't answer in time.", true);
  }
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { message: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

const ozToLb = (oz: number) => Math.max(0.1, Math.round((oz / 16) * 10) / 10);
const toCents = (amount: unknown) => Math.round(Number(amount ?? 0) * 100);

// ---- ShipStation (API v2) ---------------------------------------------------------

function ssAddress(a: Address, residential: boolean) {
  return {
    name: a.name || a.company || "Customer",
    phone: a.phone || "000-000-0000",
    company_name: a.company || undefined,
    address_line1: a.line1,
    address_line2: a.line2 || undefined,
    city_locality: a.city,
    state_province: a.state,
    postal_code: a.postal,
    country_code: a.country,
    address_residential_indicator: a.company ? "no" : residential ? "yes" : "unknown",
  };
}

function ssPackages(packages: Package[]) {
  return packages.map((p) => ({
    weight: { value: Math.max(0.1, p.weightOz), unit: "ounce" },
    ...(p.dims ? { dimensions: { unit: "inch", length: p.dims.lengthIn, width: p.dims.widthIn, height: p.dims.heightIn } } : {}),
  }));
}

function ssError(body: Record<string, unknown>, fallback: string): string {
  const errors = Array.isArray(body.errors) ? (body.errors as { message?: string }[]) : [];
  return errors[0]?.message || (typeof body.message === "string" ? body.message : "") || fallback;
}

export function shipStation(apiKey: string, carrierIds: string[], fetcher: Fetch = fetch): Carrier {
  const base = "https://api.shipstation.com/v2";
  const headers = { "API-Key": apiKey, "Content-Type": "application/json" };
  return {
    key: "shipstation",
    async test() {
      const r = await call(fetcher, `${base}/carriers`, { headers });
      if (r.status === 401 || r.status === 403) return { ok: false, error: "ShipStation didn't accept that API key. Make a v2 key in ShipStation under Settings, Account, API Settings." };
      if (r.status >= 400) return { ok: false, error: `ShipStation said: ${ssError(r.body, `error ${r.status}`)}` };
      const list = Array.isArray(r.body.carriers) ? (r.body.carriers as { carrier_id?: string; friendly_name?: string; nickname?: string }[]) : [];
      const carriers = list.filter((c) => c.carrier_id).map((c) => ({ id: String(c.carrier_id), name: String(c.nickname || c.friendly_name || c.carrier_id) }));
      if (!carriers.length) return { ok: false, error: "That ShipStation account has no carriers connected yet. Add one in ShipStation, then test again." };
      return { ok: true, detail: `Connected, with ${carriers.length} carrier${carriers.length === 1 ? "" : "s"}: ${carriers.map((c) => c.name).join(", ")}.`, carriers };
    },
    async rates(req) {
      if (!carrierIds.length) throw new CarrierError("ShipStation has no carriers to rate with. Test the connection again in Settings, Shipping.");
      const r = await call(fetcher, `${base}/rates`, {
        method: "POST",
        headers,
        body: JSON.stringify({ rate_options: { carrier_ids: carrierIds }, shipment: { validate_address: "no_validation", ship_from: ssAddress(req.from, false), ship_to: ssAddress(req.to, req.residential), packages: ssPackages(req.packages) } }),
      });
      if (r.status >= 400) throw new CarrierError(`ShipStation said: ${ssError(r.body, `error ${r.status}`)}`, r.status >= 500 || r.status === 429);
      const response = (r.body.rate_response ?? {}) as { rates?: Record<string, unknown>[] };
      return (response.rates ?? [])
        .filter((x) => !(Array.isArray(x.error_messages) && x.error_messages.length))
        .map((x) => {
          const amount = toCents((x.shipping_amount as { amount?: number })?.amount) + toCents((x.other_amount as { amount?: number })?.amount) + toCents((x.confirmation_amount as { amount?: number })?.amount);
          return {
            code: String(x.service_code ?? ""),
            service: String(x.service_type ?? x.service_code ?? "Shipping"),
            carrier: String(x.carrier_friendly_name ?? ""),
            amountCents: amount,
            days: typeof x.delivery_days === "number" ? x.delivery_days : null,
          };
        })
        .filter((x) => x.code && x.amountCents >= 0);
    },
    async fulfill(o) {
      const r = await call(fetcher, `${base}/shipments`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          shipments: [
            {
              create_sales_order: true,
              external_shipment_id: o.orderId,
              shipment_number: `#${o.number}`,
              validate_address: "no_validation",
              ship_from: ssAddress(o.from, false),
              ship_to: ssAddress(o.shipTo, true),
              items: o.items.map((i) => ({ name: i.name.slice(0, 200), sku: i.sku || undefined, quantity: i.qty, unit_price: { currency: o.currency, amount: i.unitCents / 100 } })),
              packages: ssPackages(o.packages),
              amount_paid: { currency: o.currency, amount: o.totalCents / 100 },
              shipping_paid: { currency: o.currency, amount: o.shippingCents / 100 },
              requested_shipment_service: o.shippingService || undefined,
            },
          ],
        }),
      });
      if (r.status >= 400 || r.body.has_errors === true) throw new CarrierError(`ShipStation said: ${ssError(r.body, `error ${r.status}`)}`, r.status >= 500 || r.status === 429);
      const created = Array.isArray(r.body.shipments) ? (r.body.shipments as { shipment_id?: string }[])[0] : undefined;
      if (!created?.shipment_id) throw new CarrierError("ShipStation didn't say it created the order.", true);
      return created.shipment_id;
    },
  };
}

// ---- UPS --------------------------------------------------------------------------

const UPS_SERVICES: Record<string, string> = {
  "01": "UPS Next Day Air",
  "02": "UPS 2nd Day Air",
  "03": "UPS Ground",
  "07": "UPS Worldwide Express",
  "08": "UPS Worldwide Expedited",
  "11": "UPS Standard",
  "12": "UPS 3 Day Select",
  "13": "UPS Next Day Air Saver",
  "14": "UPS Next Day Air Early",
  "54": "UPS Worldwide Express Plus",
  "59": "UPS 2nd Day Air A.M.",
  "65": "UPS Worldwide Saver",
};

const upsTokens = new Map<string, { token: string; until: number }>();

function upsAddress(a: Address) {
  return {
    AddressLine: [a.line1, a.line2].filter(Boolean),
    City: a.city,
    StateProvinceCode: a.state,
    PostalCode: a.postal,
    CountryCode: a.country,
  };
}

function upsError(body: Record<string, unknown>, fallback: string): string {
  const errs = (body.response as { errors?: { message?: string }[] } | undefined)?.errors;
  return errs?.[0]?.message || fallback;
}

export function ups(creds: { clientId: string; clientSecret: string; accountNumber: string; sandbox?: boolean }, fetcher: Fetch = fetch): Carrier {
  const host = creds.sandbox ? "https://wwwcie.ups.com" : "https://onlinetools.ups.com";
  async function token(): Promise<string> {
    const cacheKey = `${creds.clientId}:${creds.accountNumber}`;
    const hit = upsTokens.get(cacheKey);
    if (hit && hit.until > Date.now() + 60_000) return hit.token;
    const r = await call(fetcher, `${host}/security/v1/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "x-merchant-id": creds.accountNumber, Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}` },
      body: "grant_type=client_credentials",
    });
    if (r.status >= 400 || typeof r.body.access_token !== "string") throw new CarrierError(r.status === 401 ? "UPS didn't accept that client ID and secret." : `UPS said: ${upsError(r.body, `error ${r.status}`)}`, r.status >= 500);
    upsTokens.set(cacheKey, { token: r.body.access_token, until: Date.now() + Number(r.body.expires_in ?? 3600) * 1000 });
    return r.body.access_token;
  }
  const carrier: Carrier = {
    key: "ups",
    async test() {
      try {
        await token();
        return { ok: true, detail: `Connected to UPS account ${creds.accountNumber}.` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "UPS didn't answer." };
      }
    },
    async rates(req) {
      const bearer = await token();
      const r = await call(fetcher, `${host}/api/rating/v2409/Shop`, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", transId: crypto.randomUUID().replace(/-/g, "").slice(0, 32), transactionSrc: "bison-ops" },
        body: JSON.stringify({
          RateRequest: {
            Request: { TransactionReference: { CustomerContext: "Bison Ops checkout" } },
            Shipment: {
              Shipper: { Name: req.from.company || req.from.name || "Shipper", ShipperNumber: creds.accountNumber, Address: upsAddress(req.from) },
              ShipFrom: { Name: req.from.company || req.from.name || "Shipper", Address: upsAddress(req.from) },
              ShipTo: { Name: req.to.name || "Customer", Address: { ...upsAddress(req.to), ...(req.residential && !req.to.company ? { ResidentialAddressIndicator: "" } : {}) } },
              Package: req.packages.map((p) => ({
                PackagingType: { Code: "02" },
                ...(p.dims ? { Dimensions: { UnitOfMeasurement: { Code: "IN" }, Length: String(p.dims.lengthIn), Width: String(p.dims.widthIn), Height: String(p.dims.heightIn) } } : {}),
                PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: String(ozToLb(p.weightOz)) },
              })),
              ShipmentRatingOptions: { NegotiatedRatesIndicator: "" },
            },
          },
        }),
      });
      if (r.status >= 400) throw new CarrierError(`UPS said: ${upsError(r.body, `error ${r.status}`)}`, r.status >= 500 || r.status === 429);
      const rated = (r.body.RateResponse as { RatedShipment?: unknown } | undefined)?.RatedShipment;
      const list = (Array.isArray(rated) ? rated : rated ? [rated] : []) as Record<string, unknown>[];
      return list.map((x) => {
        const code = String((x.Service as { Code?: string })?.Code ?? "");
        const negotiated = (x.NegotiatedRateCharges as { TotalCharge?: { MonetaryValue?: string } } | undefined)?.TotalCharge?.MonetaryValue;
        const total = (x.TotalCharges as { MonetaryValue?: string } | undefined)?.MonetaryValue;
        const days = Number((x.GuaranteedDelivery as { BusinessDaysInTransit?: string } | undefined)?.BusinessDaysInTransit);
        return { code, service: UPS_SERVICES[code] ?? `UPS service ${code}`, carrier: "UPS", amountCents: toCents(negotiated ?? total), days: Number.isFinite(days) && days > 0 ? days : code === "01" || code === "14" || code === "13" ? 1 : code === "02" || code === "59" ? 2 : code === "12" ? 3 : null };
      });
    },
  };
  return carrier;
}

// ---- The stand-in -----------------------------------------------------------------

type StandInFulfillment = { orders: Map<string, FulfillmentOrder & { externalId: string }> };

function fulfillStore(): StandInFulfillment {
  const g = globalThis as unknown as { __bisonFulfillment?: StandInFulfillment };
  g.__bisonFulfillment ??= { orders: new Map() };
  return g.__bisonFulfillment;
}

export function standInFulfillments(): (FulfillmentOrder & { externalId: string })[] {
  return [...fulfillStore().orders.values()];
}

/** Made-up rates by weight and distance, the same every time, for tests and local work. */
export function standInCarrier(): Carrier {
  return {
    key: "stand-in",
    async test() {
      return { ok: true, detail: "Connected to the offline stand-in. Rates are made up.", carriers: [{ id: "se-standin", name: "Stand-in Post" }] };
    },
    async rates(req) {
      if (/^0+$/.test(req.to.postal.replace(/\D/g, "")) || req.to.postal.toLowerCase().includes("nope")) throw new CarrierError("The carrier couldn't rate that address.");
      const lb = req.packages.reduce((n, p) => n + Math.max(0.1, p.weightOz / 16), 0);
      const zone = 1 + Math.abs((Number(req.to.postal.replace(/\D/g, "").slice(0, 1)) || 5) - (Number(req.from.postal.replace(/\D/g, "").slice(0, 1)) || 5));
      const ground = Math.round((650 + lb * 55 * (0.8 + zone * 0.15)) * Math.max(1, req.packages.length * 0.9));
      return [
        { code: "standin_ground", service: "Ground", carrier: "Stand-in Post", amountCents: ground, days: 2 + zone },
        { code: "standin_2day", service: "2-Day", carrier: "Stand-in Post", amountCents: Math.round(ground * 2.1), days: 2 },
        { code: "standin_overnight", service: "Overnight", carrier: "Stand-in Post", amountCents: Math.round(ground * 3.6), days: 1 },
      ];
    },
    async fulfill(o) {
      if (o.shipTo.name.startsWith("fail+")) throw new CarrierError("The stand-in was told to fail this order.");
      const existing = fulfillStore().orders.get(o.orderId);
      if (existing) return existing.externalId;
      const externalId = `se-standin-${o.number}`;
      fulfillStore().orders.set(o.orderId, { ...o, externalId });
      return externalId;
    },
  };
}

/** SHIPPING_PROVIDER=stand-in answers for every carrier (tests and local work). Fails closed like the payments stand-in. */
export function shippingStandIn(): boolean {
  if (process.env.SHIPPING_PROVIDER !== "stand-in" || onVercel()) return false;
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_FAKE_BILLING === "1";
}
