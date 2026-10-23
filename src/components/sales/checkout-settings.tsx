"use client";

// Sales, Checkout: the shop link, who hears about orders, tax, order limits,
// estimate defaults, left-behind carts, and everything about shipping.
import { Copy, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { saveSalesSettingsAction } from "@/app/(portal)/sales/actions";
import { useEditionKey, useSay } from "@/components/edition";
import m from "@/components/marketing/marketing.module.css";
import { moneyInput, parseMoney } from "@/lib/sales/money";
import type { Box, ShippingSettings, StoreSettings } from "@/lib/sales/settings";
import s from "./sales.module.css";

type Props = {
  store: StoreSettings;
  shipping: ShippingSettings;
  team: { email: string; name: string }[];
  shopUrl: string;
  canEdit: boolean;
  taxActive: boolean;
  carriers: { shipstation: boolean; ups: boolean };
  demo: boolean;
};

function Notice({ value, testId }: { value: { ok: boolean; text: string } | null; testId?: string }) {
  if (!value) return null;
  return (
    <p className={`notice ${value.ok ? "notice-ok" : "notice-error"}`} role={value.ok ? "status" : "alert"} data-testid={testId}>
      {value.text}
    </p>
  );
}

function MoneyField({ id, label, value, onChange, hint, optional }: { id: string; label: string; value: number | null; onChange: (v: number | null) => void; hint?: string; optional?: boolean }) {
  const [text, setText] = useState(moneyInput(value));
  return (
    <div className={m.field}>
      <label htmlFor={id} className={m.fieldLabel}>
        {label} {optional && <em>Optional</em>}
      </label>
      <input
        id={id}
        className="input num"
        inputMode="decimal"
        value={text}
        placeholder={optional ? "None" : "0.00"}
        onChange={(e) => {
          setText(e.target.value);
          const v = e.target.value.trim() === "" ? null : parseMoney(e.target.value);
          if (v !== null || e.target.value.trim() === "") onChange(v);
        }}
      />
      {hint && <span className={m.hint}>{hint}</span>}
    </div>
  );
}

export function CheckoutSettings(p: Props) {
  return (
    <div className={s.stack}>
      <ShopCard {...p} />
      <StoreForm {...p} />
      <ShippingForm {...p} />
    </div>
  );
}

function ShopCard({ shopUrl }: Props) {
  const say = useSay();
  const [copied, setCopied] = useState(false);
  return (
    <fieldset className={m.group} id="shop">
      <legend>{say("Your shop", "Your online store")}</legend>
      <p className={m.hint}>{say("Every active product has its own page, and this page lists them all. Share either one. When the tracking script is on your own site, the cart and checkout can sit there too.", "Every active membership, pack and piece of gear has its own page, and this page lists them all, so people can join online. Share either one. When the tracking script is on your club's site, the cart and checkout can sit there too.")}</p>
      <div className={s.copyRow}>
        <input className="input mono" readOnly value={shopUrl} aria-label={say("Shop address", "Online store address")} data-testid="shop-url" />
        <button
          type="button"
          className="btn"
          onClick={() => {
            navigator.clipboard?.writeText(shopUrl).then(() => setCopied(true), () => setCopied(false));
          }}
        >
          <Copy aria-hidden="true" />
          {copied ? "Copied" : "Copy"}
        </button>
        <a href={shopUrl} className="btn" target="_blank" rel="noopener">
          Open
        </a>
      </div>
    </fieldset>
  );
}

function StoreForm({ store, team, canEdit, taxActive, demo }: Props) {
  const say = useSay();
  const [v, setV] = useState<StoreSettings>(store);
  const [extra, setExtra] = useState("");
  const [countries, setCountries] = useState(store.checkout.countries.join(", "));
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof StoreSettings>(k: K, value: StoreSettings[K]) => setV((x) => ({ ...x, [k]: value }));
  const toggleEmail = (email: string, on: boolean) => set("alertEmails", on ? [...new Set([...v.alertEmails, email])].slice(0, 10) : v.alertEmails.filter((e) => e !== email));
  const others = v.alertEmails.filter((e) => !team.some((t) => t.email === e));

  const save = () =>
    start(async () => {
      if (demo) return setNotice({ ok: false, text: "This is a demo, so settings aren't saved." });
      const list = countries
        .split(/[\s,]+/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      const r = await saveSalesSettingsAction("store", { ...v, checkout: { ...v.checkout, countries: list.length ? list : ["US"] } });
      setNotice({ ok: r.ok, text: r.message });
    });

  return (
    <form
      className={s.stack}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <fieldset className={m.group} id="alerts" disabled={!canEdit}>
        <legend>{say("Who hears about orders", "Who hears about purchases")}</legend>
        <p className={m.hint}>{say("They get an email for every paid order, quote request, estimate reply and trade application. Each email records who it went to and when, so a missed one shows up on the order.", "They get an email for every paid purchase, quote request, quote reply and corporate account application. Each email records who it went to and when, so a missed one shows up on the purchase.")}</p>
        <div className={m.formCol} style={{ gap: 8 }}>
          {team.map((t) => (
            <label key={t.email} className={m.checkRow}>
              <input type="checkbox" checked={v.alertEmails.includes(t.email)} onChange={(e) => toggleEmail(t.email, e.target.checked)} data-testid={`alert-${t.email}`} />
              <span>
                {t.name || t.email} <span className="muted">{t.name ? t.email : ""}</span>
              </span>
            </label>
          ))}
          {others.map((e) => (
            <label key={e} className={m.checkRow}>
              <input type="checkbox" checked onChange={() => toggleEmail(e, false)} />
              <span>{e}</span>
            </label>
          ))}
        </div>
        <div className={s.copyRow}>
          <input className="input" type="email" value={extra} placeholder={say("Someone else, like orders@yourcompany.com", "Someone else, like frontdesk@yourclub.com")} onChange={(e) => setExtra(e.target.value)} aria-label="Add an email" />
          <button
            type="button"
            className="btn"
            disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(extra.trim())}
            onClick={() => {
              toggleEmail(extra.trim().toLowerCase(), true);
              setExtra("");
            }}
          >
            Add
          </button>
        </div>
      </fieldset>

      <fieldset className={m.group} id="tax" disabled={!canEdit}>
        <legend>Checkout</legend>
        <div className={m.field}>
          <label htmlFor="co-countries" className={m.fieldLabel}>
            {say("Countries you ship to", "Countries you sell to")}
          </label>
          <input id="co-countries" className="input mono" value={countries} onChange={(e) => setCountries(e.target.value)} />
          <span className={m.hint}>Two-letter codes with commas, like US, CA. Checkout only takes addresses in these.</span>
        </div>
        <label className={m.checkRow}>
          <input type="checkbox" checked={v.checkout.collectPhone} onChange={(e) => set("checkout", { ...v.checkout, collectPhone: e.target.checked })} />
          <span>{say("Ask for a phone number (carriers use it for delivery problems)", "Ask for a phone number (your front desk, and carriers for gear)")}</span>
        </label>
        <label className={m.checkRow}>
          <input type="checkbox" checked={v.checkout.tax} disabled={!taxActive && !v.checkout.tax} onChange={(e) => set("checkout", { ...v.checkout, tax: e.target.checked })} data-testid="tax-toggle" />
          <span>
            Collect sales tax with Stripe Tax
            <span className={m.hint} style={{ display: "block" }}>
              {taxActive ? "Tax is added at checkout and on invoices, for each address." : (
                <>
                  Turn on Stripe Tax in your Stripe account first. <Link href="/settings/payments" className="link">Payments</Link> shows whether it&apos;s on.
                </>
              )}
            </span>
          </span>
        </label>
        <div className={m.field}>
          <label htmlFor="co-note" className={m.fieldLabel}>
            A line under the Pay button <em>Optional</em>
          </label>
          <input id="co-note" className="input" maxLength={300} value={v.checkout.note} placeholder={say("Returns accepted within 30 days.", "Ask the front desk about pausing or canceling.")} onChange={(e) => set("checkout", { ...v.checkout, note: e.target.value })} />
        </div>
      </fieldset>

      <fieldset className={m.group} id="limits" disabled={!canEdit}>
        <legend>{say("Big orders", "Big purchases")}</legend>
        <label className={m.checkRow}>
          <input type="checkbox" checked={v.inquiry.on} onChange={(e) => set("inquiry", { ...v.inquiry, on: e.target.checked })} data-testid="inquiry-toggle" />
          <span>
            {say("Quote big orders instead of taking payment", "Quote big purchases instead of taking payment")}
            <span className={m.hint} style={{ display: "block" }}>
              {say(
                `Above either limit, checkout becomes "Ask for a quote". It lands as a draft estimate with their cart in it, and the team gets an email.`,
                `Above either limit, checkout becomes "Ask for a quote". It lands as a draft quote with their cart in it, and your team gets an email. Handy when a company buys many memberships at once.`,
              )}
            </span>
          </span>
        </label>
        {v.inquiry.on && (
          <div className={m.twoUp}>
            <MoneyField id="inq-amount" label="Over this amount" optional value={v.inquiry.overCents} onChange={(n) => set("inquiry", { ...v.inquiry, overCents: n })} />
            <div className={m.field}>
              <label htmlFor="inq-qty" className={m.fieldLabel}>
                Or more items than <em>Optional</em>
              </label>
              <input id="inq-qty" className="input num" inputMode="numeric" value={v.inquiry.overQuantity ?? ""} placeholder="None" onChange={(e) => set("inquiry", { ...v.inquiry, overQuantity: e.target.value.trim() ? Math.max(1, Math.floor(Number(e.target.value)) || 1) : null })} />
            </div>
          </div>
        )}
        {v.inquiry.on && (
          <div className={m.field}>
            <label htmlFor="inq-msg" className={m.fieldLabel}>
              {say("What shoppers see", "What people see")} <em>Optional</em>
            </label>
            <input id="inq-msg" className="input" maxLength={300} value={v.inquiry.message} placeholder={say("Orders this size get a quote with freight. Send your cart and we'll reply within a day.", "Purchases this size get a corporate quote. Send your cart and we'll be in touch.")} onChange={(e) => set("inquiry", { ...v.inquiry, message: e.target.value })} />
          </div>
        )}
      </fieldset>

      <fieldset className={m.group} id="estimates" disabled={!canEdit}>
        <legend>{say("Estimates", "Quotes")}</legend>
        <div className={m.twoUp}>
          <div className={m.field}>
            <label htmlFor="est-valid" className={m.fieldLabel}>
              Good for, in days
            </label>
            <input id="est-valid" className="input num" inputMode="numeric" value={v.estimates.validDays} onChange={(e) => set("estimates", { ...v.estimates, validDays: Math.min(365, Math.max(1, Number(e.target.value) || 1)) })} />
          </div>
          <div className={m.field}>
            <label htmlFor="est-due" className={m.fieldLabel}>
              Invoice due in, days
            </label>
            <input id="est-due" className="input num" inputMode="numeric" value={v.estimates.dueDays} onChange={(e) => set("estimates", { ...v.estimates, dueDays: Math.min(120, Math.max(0, Number(e.target.value) || 0)) })} />
          </div>
        </div>
        <div className={m.field}>
          <label htmlFor="est-terms" className={m.fieldLabel}>
            Standard terms <em>Optional</em>
          </label>
          <textarea id="est-terms" className={`input ${m.textarea}`} rows={4} maxLength={2000} value={v.estimates.terms} placeholder={say("A 50% deposit holds your spot. Lead time is about two weeks.", "Memberships start on the first of the month after you approve.")} onChange={(e) => set("estimates", { ...v.estimates, terms: e.target.value })} data-testid="estimate-terms" />
          <span className={m.hint}>{say("They go on every new estimate. You can change them on each one.", "They go on every new quote. You can change them on each one.")}</span>
        </div>
      </fieldset>

      <fieldset className={m.group} id="carts" disabled={!canEdit}>
        <legend>{say("Left-behind carts", "Unfinished joins")}</legend>
        <div className={m.field}>
          <label htmlFor="ab-hours" className={m.fieldLabel}>
            {say("A cart counts as left behind after this many quiet hours", "A join counts as unfinished after this many quiet hours")}
          </label>
          <input id="ab-hours" className="input num" inputMode="numeric" value={v.abandonedAfterHours} style={{ maxWidth: 120 }} onChange={(e) => set("abandonedAfterHours", Math.min(168, Math.max(1, Number(e.target.value) || 1)))} />
          <span className={m.hint}>
            {say(`Only carts where we have an email count. With Marketing, an email series set to "Someone leaves a cart" starts for them, and stops if they buy.`, "Only joins where we have an email count. With Marketing, a follow-up set to start when someone leaves a cart goes to them, and stops if they buy.")}
          </span>
        </div>
      </fieldset>

      {canEdit && (
        <div className={m.saveBar}>
          <Notice value={notice} testId="store-notice" />
          <div className={m.saveRow}>
            <button type="submit" className="btn btn-primary" disabled={pending} data-testid="save-store">
              {pending ? "Saving" : "Save checkout settings"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function newBox(boxes: Box[]): Box {
  let n = boxes.length + 1;
  while (boxes.some((b) => b.key === `box-${n}`)) n++;
  return { key: `box-${n}`, name: `Box ${n}`, lengthIn: 12, widthIn: 10, heightIn: 6, maxWeightLb: 20, emptyWeightOz: 8 };
}

function ShippingForm({ shipping, canEdit, carriers, demo }: Props) {
  const say = useSay();
  const club = useEditionKey() === "fit";
  const [v, setV] = useState<ShippingSettings>(shipping);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ShippingSettings>(k: K, value: ShippingSettings[K]) => setV((x) => ({ ...x, [k]: value }));
  const from = (k: keyof ShippingSettings["from"], value: string) => set("from", { ...v.from, [k]: value });
  const box = (i: number, patch: Partial<Box>) => set("boxes", v.boxes.map((b, n) => (n === i ? { ...b, ...patch } : b)));
  const anyCarrier = carriers.shipstation || carriers.ups;

  return (
    <form
      className={s.stack}
      id="shipping"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          if (demo) return setNotice({ ok: false, text: "This is a demo, so settings aren't saved." });
          const r = await saveSalesSettingsAction("shipping", v);
          setNotice({ ok: r.ok, text: r.message });
        });
      }}
    >
      <fieldset className={m.group} disabled={!canEdit}>
        <legend>{say("Where orders ship from", "Where gear ships from")}</legend>
        {club && <p className={m.hint}>Only gear ships. Memberships, class packs and personal training don&apos;t, so give them a flat shipping charge of 0 on their page.</p>}
        <div className={m.twoUp}>
          <div className={m.field}>
            <label htmlFor="sf-company" className={m.fieldLabel}>Company</label>
            <input id="sf-company" className="input" value={v.from.company} onChange={(e) => from("company", e.target.value)} />
          </div>
          <div className={m.field}>
            <label htmlFor="sf-phone" className={m.fieldLabel}>Phone</label>
            <input id="sf-phone" className="input" value={v.from.phone} onChange={(e) => from("phone", e.target.value)} />
          </div>
        </div>
        <div className={m.field}>
          <label htmlFor="sf-line1" className={m.fieldLabel}>Street address</label>
          <input id="sf-line1" className="input" value={v.from.line1} onChange={(e) => from("line1", e.target.value)} data-testid="ship-from-line1" />
          <input className="input" aria-label="Second address line" value={v.from.line2} placeholder="Suite, unit, building (optional)" onChange={(e) => from("line2", e.target.value)} />
        </div>
        <div className={m.twoUp}>
          <div className={m.field}>
            <label htmlFor="sf-city" className={m.fieldLabel}>City</label>
            <input id="sf-city" className="input" value={v.from.city} onChange={(e) => from("city", e.target.value)} data-testid="ship-from-city" />
          </div>
          <div className={m.twoUp}>
            <div className={m.field}>
              <label htmlFor="sf-state" className={m.fieldLabel}>State</label>
              <input id="sf-state" className="input" value={v.from.state} maxLength={60} onChange={(e) => from("state", e.target.value)} data-testid="ship-from-state" />
            </div>
            <div className={m.field}>
              <label htmlFor="sf-postal" className={m.fieldLabel}>ZIP</label>
              <input id="sf-postal" className="input" value={v.from.postal} onChange={(e) => from("postal", e.target.value)} data-testid="ship-from-postal" />
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className={m.group} disabled={!canEdit}>
        <legend>How shipping is charged</legend>
        <div className={m.choices} role="radiogroup" aria-label="How shipping is charged">
          {(
            [
              ["carrier", "Live carrier rates"],
              ["flat", "A flat charge"],
              ["free", "Always free"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={v.source === key} className={m.choice} onClick={() => set("source", key)} data-testid={`rate-${key}`}>
              {label}
            </button>
          ))}
        </div>
        {v.source === "carrier" && (
          <>
            {!anyCarrier && (
              <p className="notice">
                Connect ShipStation or UPS in <Link href="/settings/shipping" className="link">Settings, Shipping</Link> first. Until then, checkout can&apos;t quote shipping.
              </p>
            )}
            <div className={m.field}>
              <label htmlFor="carrier" className={m.fieldLabel}>Rates from</label>
              <select id="carrier" className="select" value={v.carrier ?? ""} onChange={(e) => set("carrier", (e.target.value || null) as ShippingSettings["carrier"])} data-testid="carrier-choice">
                <option value="">Pick one</option>
                <option value="shipstation">ShipStation{carriers.shipstation ? "" : " (not connected)"}</option>
                <option value="ups">UPS{carriers.ups ? "" : " (not connected)"}</option>
              </select>
            </div>
            <div className={m.field}>
              <label htmlFor="max-opts" className={m.fieldLabel}>Options to show at checkout, cheapest first</label>
              <input id="max-opts" className="input num" inputMode="numeric" value={v.maxOptions} style={{ maxWidth: 100 }} onChange={(e) => set("maxOptions", Math.min(8, Math.max(1, Number(e.target.value) || 1)))} />
            </div>
          </>
        )}
        {v.source === "flat" && (
          <div className={m.formCol}>
            <div className={m.twoUp}>
              <MoneyField id="flat-order" label="Per order" value={v.flat.perOrderCents} onChange={(n) => set("flat", { ...v.flat, perOrderCents: n ?? 0 })} />
              <MoneyField id="flat-item" label="Plus, per item" value={v.flat.perItemCents} onChange={(n) => set("flat", { ...v.flat, perItemCents: n ?? 0 })} />
            </div>
            <div className={m.field}>
              <label htmlFor="flat-label" className={m.fieldLabel}>Called</label>
              <input id="flat-label" className="input" maxLength={60} value={v.flat.label} onChange={(e) => set("flat", { ...v.flat, label: e.target.value })} />
            </div>
          </div>
        )}
        <div className={m.twoUp}>
          <MoneyField id="handling" label="Handling, added to every rate" value={v.handlingCents} onChange={(n) => set("handlingCents", n ?? 0)} />
          <MoneyField id="free-over" label="Free shipping over" optional value={v.freeOverCents} onChange={(n) => set("freeOverCents", n)} hint="After discounts, before tax." />
        </div>
        <p className={m.hint}>{say("A discount code that takes the whole order off always ships free. Products with a flat shipping charge add it on top of any rate.", "A promo code that takes the whole purchase off always ships free. Anything with a flat shipping charge adds it on top of any rate. A flat charge, per order or per item, applies to every purchase, gear or not.")}</p>
      </fieldset>

      <fieldset className={m.group} disabled={!canEdit}>
        <legend>Boxes</legend>
        <p className={m.hint}>{say("Each product ships in one of these. Products fill their box by count (set on the product) and by weight, and carriers rate each box.", "Gear ships in one of these. Gear fills its box by count (set on each item) and by weight, and carriers rate each box.")}</p>
        <div style={{ overflowX: "auto" }}>
          <table className={s.variants}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Inside, inches (L × W × H)</th>
                <th>Holds up to, lb</th>
                <th>Empty, oz</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {v.boxes.map((b, i) => (
                <tr key={b.key}>
                  <td>
                    <input className="input" value={b.name} aria-label="Box name" onChange={(e) => box(i, { name: e.target.value })} />
                  </td>
                  <td>
                    <span style={{ display: "flex", gap: 4 }}>
                      {(["lengthIn", "widthIn", "heightIn"] as const).map((k) => (
                        <input key={k} className="input num" inputMode="decimal" aria-label={k} value={b[k]} style={{ minWidth: 56 }} onChange={(e) => box(i, { [k]: Number(e.target.value) || 0 } as Partial<Box>)} />
                      ))}
                    </span>
                  </td>
                  <td>
                    <input className="input num" inputMode="decimal" aria-label="Most it holds, lb" value={b.maxWeightLb} onChange={(e) => box(i, { maxWeightLb: Number(e.target.value) || 0 })} />
                  </td>
                  <td>
                    <input className="input num" inputMode="decimal" aria-label="Empty weight, oz" value={b.emptyWeightOz} onChange={(e) => box(i, { emptyWeightOz: Number(e.target.value) || 0 })} />
                  </td>
                  <td>
                    <button type="button" className={m.iconButton} aria-label={`Remove ${b.name}`} onClick={() => set("boxes", v.boxes.filter((_, n) => n !== i))}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className={m.linkButton} onClick={() => set("boxes", [...v.boxes, newBox(v.boxes)])} style={{ justifySelf: "start" }}>
          <Plus aria-hidden="true" />
          Add a box
        </button>
      </fieldset>

      <fieldset className={m.group} disabled={!canEdit}>
        <legend>Fulfillment</legend>
        <label className={m.checkRow}>
          <input type="checkbox" checked={v.fulfillment === "shipstation"} onChange={(e) => set("fulfillment", e.target.checked ? "shipstation" : "none")} data-testid="fulfillment-toggle" />
          <span>
            {say("Send paid orders to ShipStation to pack and label", "Send paid purchases to ShipStation to pack and label gear")}
            <span className={m.hint} style={{ display: "block" }}>
              {carriers.shipstation ? say("Each paid order lands in ShipStation with what was bought, where it's going and the shipping they paid for. If ShipStation is down, we try again.", "Each paid purchase lands in ShipStation with what was bought, where it's going and the shipping they paid for. If ShipStation is down, we try again.") : "Connect ShipStation in Settings, Shipping first."}
            </span>
          </span>
        </label>
      </fieldset>

      {canEdit && (
        <div className={m.saveBar}>
          <Notice value={notice} testId="shipping-notice" />
          <div className={m.saveRow}>
            <button type="submit" className="btn btn-primary" disabled={pending} data-testid="save-shipping">
              {pending ? "Saving" : "Save shipping"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
