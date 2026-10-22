import type { Metadata } from "next";
import { Suspense } from "react";
import { ModulePage } from "@/components/module-page";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Sales" };

const PLANNED = [
  { title: "Estimates", body: "Build an estimate, email it, and let the client approve it on their own page. Approved estimates become invoices." },
  { title: "Checkout", body: "A cart and checkout on your site, paid into your own Stripe account, with live shipping rates and tax." },
  { title: "Orders", body: "Every paid order with its status, sent on to fulfillment." },
  { title: "Products", body: "Your catalog with options, sale prices and photos. Import from a spreadsheet, Shopify or a product feed." },
  { title: "Discount codes", body: "Percent or amount off, with limits, and a plain sentence that spells out the rule before you save." },
  { title: "Trade accounts", body: "Wholesale buyers apply, you approve, and their prices step down as they buy more." },
];

export default function SalesPage() {
  return (
    <Suspense fallback={<PageHeader title="Sales" />}>
      <ModulePage mode="sales" title="Sales" note="Quote, invoice and sell from your own site." planned={PLANNED} />
    </Suspense>
  );
}
