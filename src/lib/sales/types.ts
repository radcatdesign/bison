// What Sales screens show, the same shape whether it comes from the database or
// from sample data.
import type { CartStatus, EstimateStatus, FulfillmentStatus, OrderSource, OrderStatus, TradeStatus } from "@/lib/db/types";
import type { EstimateDiscount, EstimateLine } from "./pricing";
import type { Address } from "./settings";

export type OrderItem = { productId: string | null; variantId: string | null; name: string; variant: string; sku: string; qty: number; unitCents: number; lineCents: number };

export type Delivery = { to?: string[]; at?: string; providerId?: string; error?: string };

export type OrderRow = {
  id: string;
  number: number;
  source: OrderSource;
  status: OrderStatus;
  fulfillment: FulfillmentStatus;
  email: string;
  name: string;
  itemCount: number;
  totalCents: number;
  refundedCents: number;
  currency: string;
  paidAt: Date;
  tradeCompany: string | null;
};

export type OrderDetail = OrderRow & {
  phone: string;
  shipTo: Partial<Address>;
  items: OrderItem[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  discountCode: string;
  shippingService: string;
  alert: Delivery;
  fulfillmentDetail: { provider?: string; externalId?: string; error?: string; attempts?: number; at?: string; tracking?: string };
  stripe: { accountId: string | null; paymentIntentId: string | null; sessionId: string | null; invoiceId: string | null };
  estimate: { id: string; number: number } | null;
  contactId: string | null;
  note: string;
};

export type EstimateClient = { name: string; email: string; company: string; phone: string; address: Partial<Address> };

export type EstimateRow = {
  id: string;
  number: number;
  status: EstimateStatus;
  title: string;
  client: EstimateClient;
  totalCents: number;
  currency: string;
  sentAt: Date | null;
  updatedAt: Date;
  validUntil: string | null;
  source: "team" | "inquiry";
};

export type EstimateEvent = { kind: string; actor: string; detail: string; at: Date };

export type EstimateDetail = EstimateRow & {
  items: EstimateLine[];
  discount: EstimateDiscount;
  shippingCents: number;
  subtotalCents: number;
  discountCents: number;
  notes: string;
  internalNote: string;
  approvedName: string;
  changeRequest: string;
  delivery: Delivery;
  invoiceUrl: string | null;
  paidAt: Date | null;
  viewedAt: Date | null;
  orderId: string | null;
  contactId: string | null;
  tradeAccountId: string | null;
  events: EstimateEvent[];
};

export type CartRow = {
  id: string;
  status: CartStatus;
  email: string | null;
  name: string;
  itemCount: number;
  subtotalCents: number;
  currency: string;
  lastActiveAt: Date;
  abandonedAt: Date | null;
  items: { name: string; variant: string; qty: number; lineCents: number }[];
  orderId: string | null;
  contactId: string | null;
};

export type TradeRow = {
  id: string;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  status: TradeStatus;
  details: Record<string, string>;
  note: string;
  tierOverride: string;
  /** Spend in the last 12 months. */
  spendCents: number;
  orderCount: number;
  appliedAt: Date;
  decidedAt: Date | null;
};

export type SalesSummary = {
  revenueCents: number;
  revenuePrevCents: number;
  orders: number;
  averageOrderCents: number | null;
  openEstimates: number;
  openEstimatesCents: number;
  toFulfill: number;
  abandoned: number;
  abandonedCents: number;
  tradeWaiting: number;
  currency: string;
};
