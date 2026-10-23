// The stand-in for a Stripe hosted invoice, for tests and local work: a page
// with the amount and a Pay button that marks it paid, as Stripe would.
import { esc } from "@/lib/email/render";
import { handleConnectEvent } from "@/lib/sales/connect";
import { formatMoney } from "@/lib/sales/money";
import { devPaymentsAllowed, PaymentsError, standInPayInvoice, standInStore } from "@/lib/sales/payments";

export async function GET(req: Request) {
  if (!devPaymentsAllowed()) return new Response("Not found.", { status: 404 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const inv = standInStore().invoices.get(id);
  if (!inv) return new Response("No such invoice.", { status: 404 });
  const html = `<!doctype html><meta charset="utf-8"><title>Test invoice</title>
<body style="font:16px system-ui;max-width:480px;margin:60px auto;padding:0 16px">
<p style="color:#888">Stand-in for a Stripe invoice. Nothing here is real.</p>
<h1 data-testid="invoice-total">${esc(formatMoney(inv.totalCents, inv.params.currency))}</h1>
<p>Invoice for estimate #${inv.params.number}, to ${esc(inv.params.customer.email)}</p>
<p data-testid="invoice-status">${inv.status === "paid" ? "Paid" : inv.status === "void" ? "Void" : "Open"}</p>
${inv.status === "open" ? `<form method="post"><input type="hidden" name="id" value="${esc(id)}"><button data-testid="pay-invoice" style="font:inherit;padding:10px 18px">Pay (test)</button></form>` : ""}
</body>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function POST(req: Request) {
  if (!devPaymentsAllowed()) return new Response("Not found.", { status: 404 });
  const id = String((await req.formData()).get("id") ?? "");
  let accountId = "";
  try {
    accountId = standInPayInvoice(id).accountId;
  } catch (err) {
    return new Response(err instanceof PaymentsError ? err.message : "That didn't work.", { status: 400 });
  }
  await handleConnectEvent({ id: `evt_standin_inv_${id}`, type: "invoice.paid", account: accountId, objectId: id });
  return Response.redirect(new URL(`/api/dev/payments/invoice?id=${encodeURIComponent(id)}`, req.url), 303);
}
