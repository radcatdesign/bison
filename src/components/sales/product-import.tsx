"use client";

// Importing products: a spreadsheet or Shopify export, a Shopify store's
// address, or a product feed. What was added, updated and skipped is listed.
import { Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { importProductsAction } from "@/app/(portal)/sales/actions";
import { useSay } from "@/components/edition";
import m from "@/components/marketing/marketing.module.css";

type Kind = "file" | "shopify-store" | "feed-url";

export function ProductImport({ canEdit, demo }: { canEdit: boolean; demo: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind>("file");
  const [result, setResult] = useState<{ ok: boolean; message: string; skipped?: string[] } | null>(null);
  const [pending, start] = useTransition();
  const say = useSay();
  if (!canEdit) return null;
  return (
    <>
      <button type="button" className="btn" onClick={() => ref.current?.showModal()} data-testid="open-product-import">
        <Upload aria-hidden="true" />
        Import
      </button>
      <dialog ref={ref} className={m.dialog} aria-labelledby="import-title" onClose={() => setResult(null)}>
        <form
          className={m.dialogBody}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            data.set("kind", kind);
            start(async () => {
              if (demo) return setResult({ ok: false, message: "This is a demo, so nothing is imported." });
              setResult(await importProductsAction(data));
            });
          }}
        >
          <div className={m.dialogHead}>
            <h2 id="import-title">{say("Import products", "Import memberships and packs")}</h2>
          </div>
          <div className={m.choices} role="radiogroup" aria-label="Import from">
            {(
              [
                ["file", "A file"],
                ["shopify-store", "A Shopify store"],
                ["feed-url", "A feed address"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={m.choice} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>
          {kind === "file" && (
            <div className={m.field}>
              <label htmlFor="pi-file" className={m.fieldLabel}>
                CSV, Shopify export or product feed
              </label>
              <ul className={m.hint} style={{ margin: "0 0 4px 18px", padding: 0 }}>
                <li>{say("A spreadsheet saved as CSV with Name and Price columns. Description, Was price, SKU, Weight, Category, Image, Option name and Option value are picked up too. Rows with the same name become one product with options.", "A spreadsheet saved as CSV with Name and Price columns, one row per membership, pack or piece of gear. Description, Was price, SKU, Weight, Category, Image, Option name and Option value are picked up too. Rows with the same name become one with options, like Monthly and Annual.")}</li>
                <li>Shopify: Products, Export, then the CSV for Excel or Numbers.</li>
                <li>A Google Merchant feed (XML) or a CSV or TSV feed with the same columns.</li>
              </ul>
              <input id="pi-file" name="file" type="file" accept=".csv,.tsv,.txt,.xml,text/csv,text/xml,application/xml" data-testid="product-import-file" />
            </div>
          )}
          {kind === "shopify-store" && (
            <div className={m.field}>
              <label htmlFor="pi-store" className={m.fieldLabel}>
                Your Shopify store&apos;s address
              </label>
              <input id="pi-store" name="url" className="input" placeholder="yourstore.com or yourstore.myshopify.com" />
              <span className={m.hint}>{say("We read the products the store already shows the public: names, descriptions, options, prices, photos and weights. Nothing changes in Shopify.", "We read what the store already shows the public: names, descriptions, options, prices, photos and weights. Nothing changes in Shopify.")}</span>
            </div>
          )}
          {kind === "feed-url" && (
            <div className={m.field}>
              <label htmlFor="pi-feed" className={m.fieldLabel}>
                Feed address
              </label>
              <input id="pi-feed" name="url" className="input" placeholder="https://yoursite.com/products.xml" />
              <span className={m.hint}>The same feed you give Google Merchant Center. It has to be on a public https address.</span>
            </div>
          )}
          <p className={m.hint}>{say("Importing again updates what you imported before and keeps the weights, boxes and shipping you set here.", "Importing again updates what you imported before and keeps the weights, boxes and shipping you set here. Memberships and packs don't ship, so give them no shipping charge (0 in flat shipping) after you import.")}</p>
          {result && (
            <div className={`notice ${result.ok ? "notice-ok" : "notice-error"}`} role={result.ok ? "status" : "alert"} data-testid="product-import-result">
              {result.message}
              {result.skipped && result.skipped.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ cursor: "pointer" }}>{result.skipped.length} skipped</summary>
                  <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                    {result.skipped.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          <div className={m.dialogActions}>
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              {result?.ok ? "Done" : "Cancel"}
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending} data-testid="product-import-submit">
              {pending ? "Importing" : "Import"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
