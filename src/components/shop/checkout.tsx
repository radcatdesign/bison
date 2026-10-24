"use client";

// The shop's checkout. Step one takes an email; then, depending on the cart:
// Stripe's payment form on the company's own Stripe account (shipping rated
// live from the address), the stand-in in local work and tests, a free order
// when a code covers everything, or a quote request over the order limit.
import { loadStripe, type StripeCheckoutLoadActionsSuccess, type StripeCheckoutSession } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useEdition, useEditionKey, useSay } from "@/components/edition";
import type { Say } from "@/config/editions";
import type { CheckoutStart } from "@/lib/sales/checkout";
import { formatMoney } from "@/lib/sales/money";
import { clearCart, useCart } from "./cart-store";
import s from "./shop.module.css";

type Option = { id: string; label: string; amountCents: number; days: number | null };
type Address = { name: string; company: string; phone: string; line1: string; line2: string; city: string; state: string; postal: string; country: string };
type Extra = { shippingCents: number | null; taxCents: number | null; totalCents: number | null };
type Stage = { kind: "details" } | { kind: "stripe"; start: Extract<CheckoutStart, { kind: "stripe" }> } | { kind: "stand-in"; start: Extract<CheckoutStart, { kind: "stand-in" }> } | { kind: "free" } | { kind: "inquiry" } | { kind: "done"; title: string; message: string };

export type CheckoutProps = { slug: string; accent: string; countries: string[]; collectPhone: boolean; note: string; inquiryMessage: string; testMode: boolean; inquiryToken: string };

const NO_EXTRA: Extra = { shippingCents: null, taxCents: null, totalCents: null };

type Reply<T> = { ok: boolean; message?: string } & Partial<T>;

async function post<T = object>(url: string, body: unknown, say?: Say): Promise<Reply<T>> {
  const fail = (message: string) => ({ ok: false, message }) as Reply<T>;
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as Reply<T> | null;
    return data ?? fail("Something went wrong. Try again.");
  } catch {
    return fail(say ? say("Couldn't reach the shop. Check your connection and try again.", "Couldn't reach the store. Check your connection and try again.") : "Couldn't reach the shop. Check your connection and try again.");
  }
}

const days = (n: number | null) => (n ? `${n} business ${n === 1 ? "day" : "days"}` : "");

export function CheckoutFlow(props: CheckoutProps) {
  const { slug } = props;
  const say = useSay();
  const { cart, loaded } = useCart(slug);
  const [stage, setStage] = useState<Stage>({ kind: "details" });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState<Extra>(NO_EXTRA);
  const currency = cart?.currency ?? "usd";
  const money = (n: number) => formatMoney(n, currency);

  if (stage.kind === "done") {
    return (
      <div className={s.step} data-testid="checkout-done">
        <h2>{stage.title}</h2>
        <p>{stage.message}</p>
        <a className={s.button} href={`/p/${slug}/shop`}>
          {say("Back to the shop", "Back to the store")}
        </a>
      </div>
    );
  }

  if (loaded && (!cart || !cart.lines.length)) {
    return (
      <div className={s.step}>
        <h2>Your cart is empty</h2>
        <p className={s.note}>{say("Add something from the shop first.", "Add a membership or pack first.")}</p>
        <a className={s.button} href={`/p/${slug}/shop`}>
          {say("Go to the shop", "Go to the store")}
        </a>
      </div>
    );
  }

  async function begin(e: React.FormEvent) {
    e.preventDefault();
    if (!cart) return;
    setBusy(true);
    setError(null);
    const r = await post<{ start: CheckoutStart }>(`/p/${slug}/checkout/start`, { cartId: cart.cartId, email, name }, say);
    setBusy(false);
    if (!r.ok || !r.start) return setError(r.message ?? "Checkout didn't start. Try again.");
    const st = r.start;
    if (st.kind === "stripe") setStage({ kind: "stripe", start: st });
    else if (st.kind === "stand-in") setStage({ kind: "stand-in", start: st });
    else setStage({ kind: st.kind });
  }

  const finish = (title: string, message: string) => {
    clearCart(slug);
    setStage({ kind: "done", title, message });
  };

  return (
    <div className={s.checkout}>
      <div className={s.panel}>
        <form className={s.step} onSubmit={(e) => void begin(e)} aria-labelledby="co-you">
          <h2 id="co-you">{cart?.inquiry ? "Ask for a quote" : "Your details"}</h2>
          {cart?.inquiry && <p className={s.note}>{props.inquiryMessage || say("Orders this size get a quote from the team. Send your cart and we'll be in touch.", "Purchases this size get a quote from the club. Send your cart and we'll be in touch.")}</p>}
          <label className={s.field}>
            Email
            <input className={s.input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={stage.kind !== "details"} data-testid="checkout-email" />
          </label>
          <label className={s.field}>
            Name
            <input className={s.input} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={stage.kind !== "details"} data-testid="checkout-name" />
          </label>
          {error && (
            <p className={s.message} data-tone="error" role="alert" data-testid="checkout-error">
              {error}
            </p>
          )}
          {stage.kind === "details" ? (
            <button type="submit" className={s.button} disabled={busy || !cart} data-testid="checkout-continue">
              {busy ? "One moment" : "Continue"}
            </button>
          ) : (
            <button
              type="button"
              className={s.linkButton}
              onClick={() => {
                setStage({ kind: "details" });
                setExtra(NO_EXTRA);
              }}
            >
              Change
            </button>
          )}
        </form>

        {stage.kind === "stripe" && <StripePay key={stage.start.sessionId} start={stage.start} accent={props.accent} collectPhone={props.collectPhone} slug={slug} onTotals={setExtra} />}
        {stage.kind === "stand-in" && cart && <StandInPay start={stage.start} props={props} money={money} onTotals={setExtra} subtotal={cart.merchandiseCents} />}
        {stage.kind === "free" && cart && (
          <FreeOrder
            props={props}
            cartId={cart.cartId}
            email={email}
            name={name}
            onDone={(n) => finish(say(`Order #${n} is placed`, `Purchase #${n} is placed`), say(`A code covered the whole order, so there's nothing to pay. We'll email ${email} when it ships.`, `A code covered the whole purchase, so there's nothing to pay. If it has gear in it, we'll email ${email} when it ships.`))}
          />
        )}
        {stage.kind === "inquiry" && cart && <Inquiry slug={slug} cartId={cart.cartId} email={email} name={name} token={props.inquiryToken} onDone={(m) => finish("Request sent", m)} />}
        {props.note && <p className={s.note}>{props.note}</p>}
      </div>

      <aside className={s.summary} aria-label={say("Order summary", "Summary")}>
        <strong>{say("Order summary", "Summary")}</strong>
        {cart?.lines.map((l) => (
          <div key={l.variantId} className={s.sumLine}>
            <div>
              <span>
                {l.qty} × {l.name}
              </span>
              <span>{money(l.lineCents)}</span>
            </div>
            {l.variant && <small>{l.variant}</small>}
          </div>
        ))}
        {cart && (
          <dl className={s.sums}>
            {cart.trade && (
              <>
                <dt>{say("Trade pricing", "Corporate pricing")}</dt>
                <dd>{cart.trade.name}</dd>
              </>
            )}
            <dt>Subtotal</dt>
            <dd>{money(cart.subtotalCents)}</dd>
            {cart.discount && (
              <>
                <dt>{cart.discount.code}</dt>
                <dd>−{money(cart.discount.amountCents)}</dd>
              </>
            )}
            <dt>Shipping</dt>
            <dd>{extra.shippingCents !== null ? (extra.shippingCents ? money(extra.shippingCents) : "Free") : cart.freeShipping ? "Free" : "Next step"}</dd>
            {extra.taxCents !== null && extra.taxCents > 0 && (
              <>
                <dt>Tax</dt>
                <dd>{money(extra.taxCents)}</dd>
              </>
            )}
            <dt className={s.total}>Total</dt>
            <dd className={s.total} data-testid="checkout-total">
              {money(extra.totalCents ?? cart.merchandiseCents + (extra.shippingCents ?? 0))}
            </dd>
          </dl>
        )}
        {props.testMode && <p className={s.note}>Test checkout: Stripe isn&apos;t connected on this server, so payment is played by a stand-in.</p>}
      </aside>
    </div>
  );
}

// ---- Address fields, for the stand-in and free orders ----------------------------------------

const EMPTY: Address = { name: "", company: "", phone: "", line1: "", line2: "", city: "", state: "", postal: "", country: "US" };

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function AddressFields({ value, onChange, countries, phone, disabled }: { value: Address; onChange: (a: Address) => void; countries: string[]; phone: boolean; disabled?: boolean }) {
  const f = (k: keyof Address) => ({ value: value[k], disabled, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value }) });
  return (
    <>
      <label className={s.field}>
        Full name
        <input className={s.input} autoComplete="shipping name" required {...f("name")} data-testid="ship-name" />
      </label>
      <label className={s.field}>
        Street address
        <input className={s.input} autoComplete="shipping address-line1" required {...f("line1")} data-testid="ship-line1" />
      </label>
      <label className={s.field}>
        Apartment, suite, unit <span>Optional</span>
        <input className={s.input} autoComplete="shipping address-line2" {...f("line2")} />
      </label>
      <div className={s.row2}>
        <label className={s.field}>
          City
          <input className={s.input} autoComplete="shipping address-level2" required {...f("city")} data-testid="ship-city" />
        </label>
        <label className={s.field}>
          State or region
          <input className={s.input} autoComplete="shipping address-level1" required={value.country === "US"} {...f("state")} data-testid="ship-state" />
        </label>
      </div>
      <div className={s.row2}>
        <label className={s.field}>
          ZIP or postal code
          <input className={s.input} autoComplete="shipping postal-code" required {...f("postal")} data-testid="ship-postal" />
        </label>
        <label className={s.field}>
          Country
          <select className={s.input} autoComplete="shipping country" {...f("country")}>
            {countries.map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {phone && (
        <label className={s.field}>
          Phone <span>For delivery questions</span>
          <input className={s.input} type="tel" autoComplete="tel" {...f("phone")} />
        </label>
      )}
    </>
  );
}

// ---- Stripe ----------------------------------------------------------------------------------

function StripePay({ start, accent, collectPhone, slug, onTotals }: { start: Extract<CheckoutStart, { kind: "stripe" }>; accent: string; collectPhone: boolean; slug: string; onTotals: (e: Extra) => void }) {
  const say = useSay();
  const club = useEditionKey() === "fit";
  const fallbackAccent = useEdition().defaultAccent;
  const shipRef = useRef<HTMLDivElement>(null);
  const payRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<StripeCheckoutLoadActionsSuccess | null>(null);
  const phoneRef = useRef("");
  const [session, setSession] = useState<StripeCheckoutSession | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    const seen = (x: StripeCheckoutSession) => {
      setSession(x);
      onTotals({ shippingCents: x.shipping ? x.total.shippingRate.minorUnitsAmount : null, taxCents: x.total.taxExclusive.minorUnitsAmount, totalCents: x.shipping ? x.total.total.minorUnitsAmount : null });
    };
    (async () => {
      const stripe = await loadStripe(start.publishableKey, { stripeAccount: start.accountId });
      if (!stripe || cancelled) return;
      const checkout = stripe.initCheckoutElementsSdk({
        clientSecret: start.clientSecret,
        elementsOptions: { appearance: { theme: "stripe", variables: { colorPrimary: /^#[0-9a-f]{6}$/i.test(accent) ? accent : fallbackAccent, borderRadius: "10px" } } },
      });
      checkout.on("change", seen);
      const loaded = await checkout.loadActions();
      if (cancelled) return;
      if (loaded.type === "error") return setMessage(loaded.error.message);
      actionsRef.current = loaded.actions;
      seen(loaded.actions.getSession());
      const ship = checkout.createShippingAddressElement({ fields: { phone: collectPhone ? "always" : "never" } });
      const pay = checkout.createPaymentElement();
      let last = "";
      ship.on("change", (ev) => {
        if (!ev.complete) {
          last = "";
          return;
        }
        const a = ev.value.address;
        phoneRef.current = ev.value.phone ?? "";
        const address = { name: ev.value.name, company: "", phone: ev.value.phone ?? "", line1: a.line1, line2: a.line2 ?? "", city: a.city, state: a.state, postal: a.postal_code, country: a.country };
        const key = JSON.stringify(address);
        if (key === last) return;
        last = key;
        setQuoting(true);
        setMessage(null);
        const actions = actionsRef.current;
        if (!actions) return;
        actions
          .runServerUpdate(async () => {
            const r = await post<{ options: Option[] }>(`/p/${slug}/checkout/shipping`, { sessionId: start.sessionId, address });
            if (!r.ok) setMessage(r.message ?? "Couldn't get shipping for that address.");
            return r;
          })
          .then((res) => {
            if (res.type === "error") setMessage(res.error.message);
            else seen(res.session);
          })
          .catch(() => setMessage("Couldn't get shipping for that address. Try again."))
          .finally(() => setQuoting(false));
      });
      if (shipRef.current) ship.mount(shipRef.current);
      if (payRef.current) pay.mount(payRef.current);
      setReady(true);
      cleanup = () => {
        ship.destroy();
        pay.destroy();
      };
    })().catch(() => setMessage("The payment form didn't load. Reload the page and try again."));
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [start, accent, fallbackAccent, collectPhone, slug, onTotals]);

  async function payNow() {
    const actions = actionsRef.current;
    if (!actions) return;
    setPaying(true);
    setMessage(null);
    const r = await actions.confirm(phoneRef.current ? { phoneNumber: phoneRef.current } : undefined);
    // On success Stripe moves the page to the order page itself.
    if (r.type === "error") {
      setMessage(r.error.message);
      setPaying(false);
    }
  }

  const chosen = session?.shipping?.shippingOption.id ?? null;
  const options = session?.shippingOptions ?? [];
  return (
    <>
      <section className={s.step} aria-labelledby="co-ship">
        <h2 id="co-ship">{say("Shipping", "Your address")}</h2>
        {club && <p className={s.note}>Gear ships here. Memberships, class packs and training don&apos;t ship.</p>}
        {!ready && <p className={s.note}>Loading the secure payment form.</p>}
        <div ref={shipRef} />
        {quoting && <p className={s.note}>Getting shipping options.</p>}
        {options.length > 0 && (
          <div className={s.options} role="radiogroup" aria-label="Shipping options">
            {options.map((o) => (
              <label key={o.id} className={s.option}>
                <input type="radio" name="ship" checked={chosen === o.id} onChange={() => void actionsRef.current?.updateShippingOption(o.id)} />
                <span>
                  {o.displayName}
                  {o.deliveryEstimate?.maximum && <small>{days(o.deliveryEstimate.maximum.value)}</small>}
                </span>
                <span>{o.minorUnitsAmount ? o.amount : "Free"}</span>
              </label>
            ))}
          </div>
        )}
      </section>
      <section className={s.step} aria-labelledby="co-pay">
        <h2 id="co-pay">Payment</h2>
        <div ref={payRef} />
        {message && (
          <p className={s.message} data-tone="error" role="alert">
            {message}
          </p>
        )}
        <button type="button" className={s.button} disabled={!session?.canConfirm || paying || quoting} onClick={() => void payNow()}>
          {paying ? "Paying" : session?.shipping ? `Pay ${session.total.total.amount}` : "Pay"}
        </button>
      </section>
    </>
  );
}

// ---- The stand-in ------------------------------------------------------------------------------

function StandInPay({ start, props, money, onTotals, subtotal }: { start: Extract<CheckoutStart, { kind: "stand-in" }>; props: CheckoutProps; money: (n: number) => string; onTotals: (e: Extra) => void; subtotal: number }) {
  const router = useRouter();
  const say = useSay();
  const club = useEditionKey() === "fit";
  const [address, setAddress] = useState<Address>({ ...EMPTY, country: props.countries[0] ?? "US" });
  const [options, setOptions] = useState<Option[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pick = (o: Option | undefined) => {
    setChosen(o?.id ?? null);
    onTotals(o ? { shippingCents: o.amountCents, taxCents: null, totalCents: subtotal + o.amountCents } : NO_EXTRA);
  };

  async function rates(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const r = await post<{ options: Option[] }>(`/p/${props.slug}/checkout/shipping`, { sessionId: start.sessionId, address });
    setBusy(false);
    if (!r.ok || !r.options) {
      setOptions(null);
      pick(undefined);
      return setMessage(r.message ?? "Couldn't get shipping for that address.");
    }
    setOptions(r.options);
    pick(r.options[0]);
  }

  async function pay() {
    setBusy(true);
    setMessage(null);
    const r = await post(`/api/dev/payments`, { sessionId: start.sessionId, option: chosen, phone: address.phone });
    if (!r.ok) {
      setBusy(false);
      return setMessage(r.message ?? "The test payment didn't go through.");
    }
    router.push(`/p/${props.slug}/order?session_id=${encodeURIComponent(start.sessionId)}`);
  }

  return (
    <>
      <form className={s.step} onSubmit={(e) => void rates(e)} aria-labelledby="co-ship">
        <h2 id="co-ship">{say("Shipping address", "Your address")}</h2>
        {club && <p className={s.note}>Gear ships here. Memberships, class packs and training don&apos;t ship.</p>}
        <AddressFields value={address} onChange={(a) => {
            setAddress(a);
            setOptions(null);
            pick(undefined);
          }} countries={props.countries} phone={props.collectPhone} disabled={busy} />
        {!options && (
          <button type="submit" className={s.ghost} disabled={busy} data-testid="ship-rates">
            {busy ? "Checking" : "See shipping options"}
          </button>
        )}
        {options && (
          <div className={s.options} role="radiogroup" aria-label="Shipping options">
            {options.map((o) => (
              <label key={o.id} className={s.option} data-testid="ship-option">
                <input type="radio" name="ship" checked={chosen === o.id} onChange={() => pick(o)} />
                <span>
                  {o.label}
                  {o.days && <small>{days(o.days)}</small>}
                </span>
                <span>{o.amountCents ? money(o.amountCents) : "Free"}</span>
              </label>
            ))}
          </div>
        )}
      </form>
      <section className={s.step} aria-labelledby="co-pay">
        <h2 id="co-pay">Payment</h2>
        <p className={s.note}>{say("On a live shop, Stripe's card form is here. This one pays with a test card.", "On a live store, Stripe's card form is here. This one pays with a test card.")}</p>
        {message && (
          <p className={s.message} data-tone="error" role="alert" data-testid="pay-error">
            {message}
          </p>
        )}
        <button type="button" className={s.button} disabled={!options || !chosen || busy} onClick={() => void pay()} data-testid="pay-test">
          {busy && options ? "Paying" : "Pay with a test card"}
        </button>
      </section>
    </>
  );
}

// ---- Free orders and quote requests ---------------------------------------------------------------

function FreeOrder({ props, cartId, email, name, onDone }: { props: CheckoutProps; cartId: string; email: string; name: string; onDone: (number: number) => void }) {
  const say = useSay();
  const [address, setAddress] = useState<Address>({ ...EMPTY, name, country: props.countries[0] ?? "US" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className={s.step}
      aria-labelledby="co-free"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        void post<{ number: number }>(`/p/${props.slug}/checkout/free`, { cartId, email, name: name || address.name, phone: address.phone, address }).then((r) => {
          setBusy(false);
          if (r.ok && r.number) onDone(r.number);
          else setMessage(r.message ?? say("The order didn't go through. Try again.", "That didn't go through. Try again."));
        });
      }}
    >
      <h2 id="co-free">{say("Where should we send it?", "Your address")}</h2>
      <p className={s.note}>{say("Your code covers the whole order, so there's nothing to pay.", "Your code covers the whole purchase, so there's nothing to pay. If it has gear in it, we'll send it here.")}</p>
      <AddressFields value={address} onChange={setAddress} countries={props.countries} phone={props.collectPhone} disabled={busy} />
      {message && (
        <p className={s.message} data-tone="error" role="alert">
          {message}
        </p>
      )}
      <button type="submit" className={s.button} disabled={busy} data-testid="place-free-order">
        {busy ? say("Placing the order", "Finishing") : say("Place the order", "Finish")}
      </button>
    </form>
  );
}

function Inquiry({ slug, cartId, email, name, token, onDone }: { slug: string; cartId: string; email: string; name: string; token: string; onDone: (message: string) => void }) {
  const say = useSay();
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [trap, setTrap] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className={s.step}
      aria-labelledby="co-quote"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        void post(`/p/${slug}/checkout/inquiry`, { cartId, email, name, phone, message: text, token, trap }).then((r) => {
          setBusy(false);
          if (r.ok) onDone(r.message ?? "We have your request.");
          else setMessage(r.message ?? "That didn't send. Try again.");
        });
      }}
    >
      <h2 id="co-quote">Your request</h2>
      <label className={s.field}>
        Phone <span>Optional</span>
        <input className={s.input} type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label className={s.field}>
        Anything we should know? <span>{say("Delivery dates, the job, where it's going", "How many people, start dates, anything else")}</span>
        <textarea className={s.input} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
      </label>
      {/* People never see this field. Bots fill it in. */}
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className={s.trap} value={trap} onChange={(e) => setTrap(e.target.value)} />
      {message && (
        <p className={s.message} data-tone="error" role="alert">
          {message}
        </p>
      )}
      <button type="submit" className={s.button} disabled={busy} data-testid="send-inquiry">
        {busy ? "Sending" : "Send the request"}
      </button>
    </form>
  );
}
