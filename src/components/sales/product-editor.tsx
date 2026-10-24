"use client";

// One product: name, description, photos, options and the versions they make,
// each with its price, "was" price, SKU, weight and how it ships. The product's
// own page link is shown with a copy button once it's saved.
import { Copy, ImagePlus, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteProductAction, saveProductAction } from "@/app/(portal)/sales/actions";
import { useSay } from "@/components/edition";
import m from "@/components/marketing/marketing.module.css";
import { expandVariants, MAX_OPTIONS, MAX_PHOTOS, type ProductOption, type ProductPhoto, slugify, type VariantInput, variantKey, variantLabel } from "@/lib/sales/catalog";
import { moneyInput, parseMoney } from "@/lib/sales/money";
import type { Box } from "@/lib/sales/settings";
import s from "./sales.module.css";

export type EditorProduct = {
  id: string | null;
  slug: string;
  name: string;
  description: string;
  status: "active" | "draft" | "archived";
  category: string;
  taxCode: string;
  options: ProductOption[];
  photos: ProductPhoto[];
  seo: { title: string; description: string };
  variants: VariantInput[];
};

type Props = { product: EditorProduct; boxes: Box[]; shopBase: string; canEdit: boolean; demo: boolean; currency: string };

type Unit = "lb" | "oz";

function MoneyCell({ value, onChange, label, optional }: { value: number | null; onChange: (v: number | null) => void; label: string; optional?: boolean }) {
  const [text, setText] = useState(moneyInput(value));
  return (
    <input
      className="input num"
      inputMode="decimal"
      aria-label={label}
      value={text}
      placeholder={optional ? "None" : "0.00"}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value.trim() === "") onChange(optional ? null : 0);
        else {
          const n = parseMoney(e.target.value);
          if (n !== null) onChange(n);
        }
      }}
    />
  );
}

function OptionEditor({ options, onChange }: { options: ProductOption[]; onChange: (o: ProductOption[]) => void }) {
  const say = useSay();
  return (
    <div className={m.formCol} style={{ gap: 10 }}>
      {options.map((o, i) => (
        <div key={i} className={s.optionRow}>
          <input className="input" aria-label={`Option ${i + 1} name`} value={o.name} placeholder={say("Size", "Plan")} onChange={(e) => onChange(options.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)))} data-testid={`option-name-${i}`} />
          <input
            key={`${i}:${o.values.join(",")}`}
            className="input"
            aria-label={`Option ${i + 1} choices`}
            defaultValue={o.values.join(", ")}
            placeholder={say("Small, Medium, Large", "Monthly, Annual")}
            onBlur={(e) => {
              const values = [...new Set(e.target.value.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 30);
              onChange(options.map((x, n) => (n === i ? { ...x, values } : x)));
            }}
            data-testid={`option-values-${i}`}
          />
          <button type="button" className={m.iconButton} aria-label={`Remove ${o.name || "option"}`} onClick={() => onChange(options.filter((_, n) => n !== i))}>
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      ))}
      {options.length < MAX_OPTIONS && (
        <button type="button" className={m.linkButton} style={{ justifySelf: "start" }} onClick={() => onChange([...options, { name: options.length ? "" : say("Size", "Plan"), values: [] }])} data-testid="add-option">
          <Plus aria-hidden="true" />
          {options.length ? "Add another option" : say("Add options, like size or color", "Add options, like Monthly / Annual or 5 / 10 / 20 classes")}
        </button>
      )}
      {options.length > 0 && <span className={m.hint}>{say("Separate choices with commas. Each combination becomes a version with its own price.", "Separate choices with commas. Each combination gets its own price.")}</span>}
    </div>
  );
}

export function ProductEditor({ product, boxes, shopBase, canEdit, demo, currency }: Props) {
  const router = useRouter();
  const say = useSay();
  const [p, setP] = useState<EditorProduct>(product);
  const [unit, setUnit] = useState<Unit>(product.variants.some((v) => v.weightOz >= 32) ? "lb" : "oz");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof EditorProduct>(k: K, v: EditorProduct[K]) => setP((x) => ({ ...x, [k]: v }));
  const setVariant = (i: number, patch: Partial<VariantInput>) => setP((x) => ({ ...x, variants: x.variants.map((v, n) => (n === i ? { ...v, ...patch } : v)) }));
  const setOptions = (options: ProductOption[]) => setP((x) => ({ ...x, options, variants: options.length ? expandVariants(options.filter((o) => o.name && o.values.length), x.variants) : [{ ...(x.variants[0] ?? { priceCents: 0 }), options: {} } as VariantInput] }));
  const url = `${shopBase}/${p.slug || slugify(p.name)}`;
  const single = p.options.length === 0;

  const addPhoto = (photo: ProductPhoto) => setP((x) => (x.photos.length >= MAX_PHOTOS || x.photos.some((ph) => ph.src === photo.src) ? x : { ...x, photos: [...x.photos, photo] }));

  async function upload(file: File) {
    setUploading(true);
    try {
      const data = new FormData();
      data.set("file", file);
      const res = await fetch("/api/marketing/files?kind=product-image", { method: "POST", body: data });
      const body = (await res.json().catch(() => ({}))) as { src?: string; message?: string };
      if (!res.ok || !body.src) setNotice({ ok: false, text: body.message ?? "The upload didn't finish. Try again." });
      else addPhoto({ src: body.src, alt: p.name });
    } catch {
      setNotice({ ok: false, text: "The upload didn't finish. Check your connection and try again." });
    } finally {
      setUploading(false);
    }
  }

  const save = () =>
    start(async () => {
      if (demo) return setNotice({ ok: false, text: say("This is a demo, so products aren't saved.", "This is a demo, so memberships aren't saved.") });
      const r = await saveProductAction(p.id, { ...p, slug: p.slug || undefined });
      setNotice({ ok: r.ok, text: r.message });
      if (r.ok && r.id && !p.id) router.replace(`/sales/products/${r.id}`);
      else if (r.ok) router.refresh();
    });

  const weightValue = (oz: number) => (oz ? String(unit === "lb" ? Math.round((oz / 16) * 100) / 100 : oz) : "");

  return (
    <form
      className={s.builder}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      data-testid="product-editor"
    >
      <div className={s.builderMain}>
        <fieldset className={m.group} disabled={!canEdit}>
          <legend>{say("Product", "Details")}</legend>
          <div className={m.field}>
            <label htmlFor="pe-name" className={m.fieldLabel}>
              Name
            </label>
            <input id="pe-name" className="input" maxLength={160} value={p.name} onChange={(e) => set("name", e.target.value)} data-testid="product-name" />
          </div>
          <div className={m.field}>
            <label htmlFor="pe-desc" className={m.fieldLabel}>
              Description <em>Optional</em>
            </label>
            <textarea id="pe-desc" className={`input ${m.textarea}`} rows={6} maxLength={20000} value={p.description} onChange={(e) => set("description", e.target.value)} data-testid="product-description" />
            <span className={m.hint}>Blank lines start a new paragraph. Lines starting with a dash become a list.</span>
          </div>
        </fieldset>

        <fieldset className={m.group} disabled={!canEdit}>
          <legend>Photos</legend>
          <div className={s.photos}>
            {p.photos.map((ph, i) => (
              <div key={ph.src} className={s.photo}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.src} alt={ph.alt || p.name} />
                <button type="button" aria-label="Remove photo" onClick={() => set("photos", p.photos.filter((_, n) => n !== i))}>
                  <X aria-hidden="true" />
                </button>
              </div>
            ))}
            {p.photos.length < MAX_PHOTOS && (
              <button type="button" className={s.photo} style={{ display: "grid", placeItems: "center", cursor: "pointer", color: "var(--bo-ink-2)" }} onClick={() => fileRef.current?.click()} disabled={uploading || demo}>
                <ImagePlus aria-hidden="true" style={{ width: 22, height: 22 }} />
                <span className="visually-hidden">Upload a photo</span>
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="visually-hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
            data-testid="product-photo-file"
          />
          <div className={s.copyRow}>
            <input className="input" value={photoUrl} placeholder="Or paste an https:// image address" onChange={(e) => setPhotoUrl(e.target.value)} aria-label="Image address" />
            <button
              type="button"
              className="btn"
              disabled={!/^https:\/\/\S+$/.test(photoUrl.trim())}
              onClick={() => {
                addPhoto({ src: photoUrl.trim(), alt: p.name });
                setPhotoUrl("");
              }}
            >
              Add
            </button>
          </div>
          <span className={m.hint}>{uploading ? "Uploading..." : "The first photo is the one people see when you share the link. Uploads are resized and stripped of camera details."}</span>
        </fieldset>

        <fieldset className={m.group} disabled={!canEdit}>
          <legend>Options and prices</legend>
          <OptionEditor options={p.options} onChange={setOptions} />
          <div style={{ overflowX: "auto" }}>
            <table className={s.variants} data-testid="variant-table">
              <thead>
                <tr>
                  {!single && <th>{say("Version", "Option")}</th>}
                  <th>Price</th>
                  <th>Was price</th>
                  <th>SKU</th>
                  {!single && <th>For sale</th>}
                </tr>
              </thead>
              <tbody>
                {p.variants.map((v, i) => (
                  <tr key={variantKey(v.options, p.options) || "only"} data-testid="variant-row">
                    {!single && <td style={{ whiteSpace: "nowrap" }}>{variantLabel(v.options, p.options)}</td>}
                    <td>
                      <MoneyCell label="Price" value={v.priceCents} onChange={(n) => setVariant(i, { priceCents: n ?? 0 })} />
                    </td>
                    <td>
                      <MoneyCell label="Was price" optional value={v.compareAtCents} onChange={(n) => setVariant(i, { compareAtCents: n })} />
                    </td>
                    <td>
                      <input className="input mono" aria-label="SKU" maxLength={64} value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} />
                    </td>
                    {!single && (
                      <td>
                        <input type="checkbox" className="switch" aria-label="For sale" checked={v.active} onChange={(e) => setVariant(i, { active: e.target.checked })} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className={m.hint}>A was price shows struck through next to the price, for a sale. Prices are in {currency.toUpperCase()}.</span>
        </fieldset>

        <fieldset className={m.group} disabled={!canEdit}>
          <legend>{say("Shipping", "Shipping, for gear")}</legend>
          <div className={m.choices} role="radiogroup" aria-label="Weight unit">
            {(["oz", "lb"] as const).map((u) => (
              <button key={u} type="button" role="radio" aria-checked={unit === u} className={m.choice} onClick={() => setUnit(u)}>
                Weights in {u}
              </button>
            ))}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className={s.variants}>
              <thead>
                <tr>
                  {!single && <th>{say("Version", "Option")}</th>}
                  <th>Weight ({unit})</th>
                  <th>Box</th>
                  <th>Fits per box</th>
                  <th>Ships alone</th>
                  <th>Flat shipping</th>
                </tr>
              </thead>
              <tbody>
                {p.variants.map((v, i) => (
                  <tr key={variantKey(v.options, p.options) || "only"}>
                    {!single && <td style={{ whiteSpace: "nowrap" }}>{variantLabel(v.options, p.options)}</td>}
                    <td>
                      <input
                        className="input num"
                        inputMode="decimal"
                        aria-label={`Weight in ${unit}`}
                        defaultValue={weightValue(v.weightOz)}
                        key={unit}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && n >= 0) setVariant(i, { weightOz: Math.round((unit === "lb" ? n * 16 : n) * 100) / 100 });
                        }}
                        data-testid="variant-weight"
                      />
                    </td>
                    <td>
                      <select className="select" aria-label="Box" value={v.box} onChange={(e) => setVariant(i, { box: e.target.value })}>
                        <option value="">Biggest box</option>
                        {boxes.map((b) => (
                          <option key={b.key} value={b.key}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="input num" inputMode="numeric" aria-label="Fits per box" value={v.unitsPerBox} onChange={(e) => setVariant(i, { unitsPerBox: Math.min(1000, Math.max(1, Math.floor(Number(e.target.value)) || 1)) })} />
                    </td>
                    <td>
                      <input type="checkbox" className="switch" aria-label="Ships in its own box" checked={v.shipsAlone} onChange={(e) => setVariant(i, { shipsAlone: e.target.checked })} />
                    </td>
                    <td>
                      <MoneyCell label="Flat shipping per item" optional value={v.flatShipCents} onChange={(n) => setVariant(i, { flatShipCents: n })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className={m.hint}>
            {say(
              `Carriers rate each box by weight. "Ships alone" gives every unit its own box, for bulky items. A flat shipping charge skips the carrier for that item, for freight or local delivery; use 0 for items that don't ship.`,
              "Only gear ships. Give gear a weight and a box, and carriers rate each box by weight. Memberships, packs and training don't ship, so give them no shipping charge (0 in flat shipping).",
            )}{" "}
            Boxes are set in{" "}
            <Link href="/sales/checkout#shipping" className="link">
              Checkout
            </Link>
            .
          </span>
        </fieldset>
      </div>

      <aside className={s.builderSide}>
        <fieldset className={m.group} disabled={!canEdit}>
          <legend>Status</legend>
          <div className={m.choices} role="radiogroup" aria-label="Status">
            {(
              [
                ["active", "Active"],
                ["draft", "Draft"],
                ["archived", "Archived"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={p.status === k} className={m.choice} onClick={() => set("status", k)} data-testid={`status-${k}`}>
                {label}
              </button>
            ))}
          </div>
          <span className={m.hint}>{p.status === "active" ? say("In your shop and at its own address.", "In your club's online store and at its own address.") : p.status === "draft" ? "Hidden until you make it active." : say("Off the shop and out of the list. Past orders keep it.", "Off your online store and out of the list. Past purchases keep it.")}</span>
          <div className={m.field}>
            <label htmlFor="pe-cat" className={m.fieldLabel}>
              Category <em>Optional</em>
            </label>
            <input id="pe-cat" className="input" maxLength={80} value={p.category} onChange={(e) => set("category", e.target.value)} />
          </div>
          <div className={m.field}>
            <label htmlFor="pe-tax" className={m.fieldLabel}>
              Stripe tax code <em>Optional</em>
            </label>
            <input id="pe-tax" className="input mono" maxLength={13} value={p.taxCode} placeholder="txcd_99999999" onChange={(e) => set("taxCode", e.target.value.trim())} />
            <span className={m.hint}>Leave empty for your Stripe account&apos;s default. Only matters with Stripe Tax on.</span>
          </div>
        </fieldset>

        <fieldset className={m.group} disabled={!canEdit}>
          <legend>Its page</legend>
          <div className={s.copyRow}>
            <input className="input mono" readOnly value={url} aria-label={say("Product page address", "Page address")} />
            <button type="button" className={m.iconButton} aria-label="Copy the address" onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true))}>
              <Copy aria-hidden="true" />
            </button>
          </div>
          {copied && <span className={m.hint}>Copied.</span>}
          <div className={m.field}>
            <label htmlFor="pe-slug" className={m.fieldLabel}>
              Address
            </label>
            <input id="pe-slug" className="input mono" maxLength={80} value={p.slug} placeholder={slugify(p.name || "product")} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
          </div>
          <div className={m.field}>
            <label htmlFor="pe-seo-t" className={m.fieldLabel}>
              Search title <em>Optional</em>
            </label>
            <input id="pe-seo-t" className="input" maxLength={70} value={p.seo.title} placeholder={p.name} onChange={(e) => set("seo", { ...p.seo, title: e.target.value })} />
          </div>
          <div className={m.field}>
            <label htmlFor="pe-seo-d" className={m.fieldLabel}>
              Search description <em>Optional</em>
            </label>
            <textarea id="pe-seo-d" className={`input ${m.textarea}`} rows={3} maxLength={170} value={p.seo.description} placeholder="Taken from the description when empty." onChange={(e) => set("seo", { ...p.seo, description: e.target.value })} />
          </div>
        </fieldset>

        {canEdit && (
          <div className={m.saveBar} style={{ position: "static" }}>
            {notice && (
              <p className={`notice ${notice.ok ? "notice-ok" : "notice-error"}`} role={notice.ok ? "status" : "alert"} data-testid="product-notice">
                {notice.text}
              </p>
            )}
            <div className={m.saveRow}>
              <button type="submit" className="btn btn-primary" disabled={pending} data-testid="save-product">
                {pending ? "Saving" : say("Save product", "Save")}
              </button>
              {p.id && (
                <button
                  type="button"
                  className={`btn ${m.danger}`}
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(say(`Delete ${p.name}? Past orders keep what was bought.`, `Delete ${p.name}? Past purchases keep what was bought.`))) return;
                    start(async () => {
                      if (demo) return setNotice({ ok: false, text: "This is a demo, so nothing is deleted." });
                      const r = await deleteProductAction(p.id!);
                      if (r.ok) router.push("/sales/products");
                      else setNotice({ ok: false, text: r.message });
                    });
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </aside>
    </form>
  );
}
