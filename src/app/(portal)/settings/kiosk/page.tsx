import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PairPanel } from "@/components/kiosk/pair-panel";
import s from "@/components/kiosk/kiosk-settings.module.css";
import { Card, PageHeader, Row, Rows } from "@/components/ui";
import { ActionForm } from "@/components/ui/action-form";
import { itemOf } from "@/config/editions";
import { may } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { withTenant } from "@/lib/db";
import { appUrl, demoMode } from "@/lib/env";
import { formatAgo } from "@/lib/format";
import { demoWaiver } from "@/lib/kiosk/demo";
import { DEFAULT_CONFIG, hasPlaceholder, IDLE_CHOICES, type KioskConfig, MAX_JOIN_PRODUCTS, starterWaiver, waiverReady, type WaiverText } from "@/lib/kiosk/settings";
import { type KioskDevice, listDevices, readKiosk, waitingCode } from "@/lib/kiosk/store";
import { getPortalContext } from "@/lib/portal";
import { scopeOf } from "@/lib/portal";
import { formatMoney } from "@/lib/sales/money";
import { publicProducts } from "@/lib/sales/products";
import { demoItems } from "@/lib/sales/shop-demo";
import { getSalesSettings, readPayments } from "@/lib/sales/store";
import { pairTablet, saveKioskSettings, saveWaiverText, setPin, unpairTablet } from "./actions";

export const metadata: Metadata = { title: "Kiosk" };

type Product = { id: string; name: string; price: string; ships: boolean };
type Loaded = {
  config: KioskConfig;
  pinSet: boolean;
  pinSetAt: Date | null;
  waiver: WaiverText;
  devices: KioskDevice[];
  waiting: { name: string; expiresAt: Date } | null;
  products: Product[];
  /** Why the join screen can't show yet, or null when it can. */
  joinBlocked: string | null;
};

const IDLE_LABEL: Record<(typeof IDLE_CHOICES)[number], string> = { 30: "30 seconds", 60: "1 minute", 120: "2 minutes", 300: "5 minutes" };

async function load(ctx: Awaited<ReturnType<typeof getPortalContext>>): Promise<Loaded> {
  const sales = itemOf("fit", "module:sales").name;
  if (demoMode()) {
    const items = can(ctx.tenant, "sales.checkout") ? demoItems({ tenantId: ctx.tenant.id }) : [];
    return {
      config: DEFAULT_CONFIG,
      pinSet: false,
      pinSetAt: null,
      waiver: demoWaiver(ctx.tenant.name),
      devices: [],
      waiting: null,
      products: items.map((p) => ({ id: p.slug, name: p.name, price: formatMoney(p.minCents), ships: false })),
      joinBlocked: can(ctx.tenant, "sales.checkout") ? null : `Joining from the kiosk needs ${sales}.`,
    };
  }
  return withTenant(scopeOf(ctx), async (tx) => {
    const setup = await readKiosk(tx);
    const hasSales = can(ctx.tenant, "sales.checkout");
    let products: Product[] = [];
    let joinBlocked: string | null = `Joining from the kiosk needs ${sales}.`;
    if (hasSales) {
      const [store, pay, list] = [await getSalesSettings(tx), await readPayments(tx), await publicProducts(tx, 200)];
      products = list.map((p) => ({ id: p.id, name: p.name, price: p.minCents === p.maxCents ? formatMoney(p.minCents, store.store.currency) : `From ${formatMoney(p.minCents, store.store.currency)}`, ships: p.variants.some((v) => v.active && v.weightOz > 0) }));
      joinBlocked = !pay.chargesEnabled ? "Joining from the kiosk needs your Stripe account connected, so people can pay. Set it up in Settings, Payments." : !store.store.shopOn ? "Your online store is off, so there's nothing to join. Turn it on in Membership sales, Checkout." : !products.length ? "Add a membership or pass in Membership sales first." : null;
    }
    return { ...setup, devices: await listDevices(tx), waiting: await waitingCode(tx), products, joinBlocked };
  });
}

function Toggle({ name, title, note, checked, disabled }: { name: string; title: string; note: string; checked: boolean; disabled?: boolean }) {
  return (
    <label className={s.toggle} data-disabled={disabled || undefined}>
      <span>
        <span className={s.toggleTitle}>{title}</span>
        <span className={s.toggleNote}>{note}</span>
      </span>
      <input type="checkbox" className="switch" name={name} defaultChecked={checked} disabled={disabled} data-testid={`kiosk-${name}`} />
    </label>
  );
}

async function Body() {
  const ctx = await getPortalContext();
  if (ctx.tenant.edition !== "fit") notFound();
  const demo = demoMode();
  const canManage = may(ctx.member.role, "settings.manage") && !demo;
  const k = await load(ctx);
  const c = k.config;
  const marketing = can(ctx.tenant, "marketing.subscribers");
  const ready = waiverReady(k.waiver);
  const draft = k.waiver.version ? k.waiver : { ...starterWaiver(ctx.tenant.name), version: 0 };
  const picked = new Set(c.join.productIds);
  const defaultPick = !picked.size;
  const kioskUrl = `${appUrl().replace(/^https?:\/\//, "")}/kiosk`;

  return (
    <div className={s.stack}>
      <Card
        title="Preview"
        note="See the kiosk the way people at your desk will. Every button works, and nothing is saved or sent."
        aside={
          <Link href="/kiosk/preview" className="btn" data-testid="kiosk-preview-link">
            <ExternalLink aria-hidden="true" />
            Preview the kiosk
          </Link>
        }
      >
        <p className="muted" style={{ margin: 0 }}>
          On the tablet itself, the kiosk lives at <span className="mono">{kioskUrl}</span>.
        </p>
      </Card>

      <Card title="Tablets" id="tablets" note="Any iPad or Android tablet with a browser works. Pairing takes a code from here, and leaving the kiosk on the tablet takes your staff PIN." testId="kiosk-tablets">
        {k.devices.length > 0 && (
          <Rows>
            {k.devices.map((d) => (
              <Row
                key={d.id}
                testId="kiosk-device"
                main={
                  <>
                    <strong>{d.name}</strong>
                    <span className="muted">
                      Paired {formatAgo(d.pairedAt)}
                      {d.pairedBy ? ` by ${d.pairedBy}` : ""}. Last seen {formatAgo(d.lastSeenAt)}.
                    </span>
                  </>
                }
                side={
                  canManage ? (
                    <ActionForm action={unpairTablet} submitLabel="Unpair" pendingLabel="Unpairing">
                      <input type="hidden" name="deviceId" value={d.id} />
                    </ActionForm>
                  ) : undefined
                }
              />
            ))}
          </Rows>
        )}
        {k.devices.length === 0 && <p className="muted">No tablets yet.</p>}
        {k.waiting && <p className="muted">A code for {k.waiting.name} works until {k.waiting.expiresAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ctx.settings.timezone })}. Making a new one stops it.</p>}
        <PairPanel action={pairTablet} kioskUrl={kioskUrl} disabled={!canManage || !k.pinSet} disabledNote={demo ? "This is a demo, so tablets can't be paired. Try the preview instead." : !canManage ? "Only owners and admins can pair tablets." : !k.pinSet ? "Set a staff PIN below first." : null} />
      </Card>

      <Card title="Staff PIN" id="pin" note="Staff type this on the tablet to leave the kiosk. After 5 wrong tries the tablet waits 15 minutes. Changing it works on every tablet right away." testId="kiosk-pin">
        <p className="muted" style={{ marginTop: 0 }}>{k.pinSet ? `Set ${k.pinSetAt ? formatAgo(k.pinSetAt) : ""}.` : "Not set yet."}</p>
        <ActionForm action={setPin} submitLabel={k.pinSet ? "Change PIN" : "Set PIN"} testId="kiosk-pin-form" className={s.pinForm}>
          <label className={s.field}>
            <span className="label">New PIN</span>
            <input className="input" name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="\d{4,8}" maxLength={8} required disabled={!canManage} data-testid="kiosk-pin-input" />
          </label>
          <label className={s.field}>
            <span className="label">Type it again</span>
            <input className="input" name="confirm" type="password" inputMode="numeric" autoComplete="new-password" pattern="\d{4,8}" maxLength={8} required disabled={!canManage} data-testid="kiosk-pin-confirm" />
          </label>
        </ActionForm>
      </Card>

      <Card title="What the kiosk shows" id="screens" testId="kiosk-config">
        <ActionForm action={saveKioskSettings} submitLabel="Save" primary testId="kiosk-config-form">
          <div className={s.config}>
            <label className={s.field}>
              <span className="label">Welcome line</span>
              <input className="input" name="welcome" defaultValue={c.welcome} placeholder={`Welcome to ${ctx.tenant.name}`} maxLength={80} disabled={!canManage} />
            </label>
            <Toggle name="checkInOn" title="Check in" note="Members and guests check in with their phone number or email. The screen shows their first name only." checked={c.checkIn.on} disabled={!canManage} />
            <Toggle name="passOn" title="Free pass" note="Walk-ins leave their name and email and land in Leads, ready for the front desk." checked={c.pass.on} disabled={!canManage} />
            <label className={s.field}>
              <span className="label">What to call the pass</span>
              <input className="input" name="passLabel" defaultValue={c.pass.label} maxLength={40} disabled={!canManage} />
            </label>
            <Toggle name="tourOn" title="Book a tour" note="They pick a time of day that suits them. They show as Visit booked in Leads." checked={c.tour.on} disabled={!canManage} />
            <Toggle name="joinOn" title="Join today" note="They pick a membership or pass and scan a code to pay on their own phone, so no card goes into a shared tablet." checked={c.join.on} disabled={!canManage} />
            {k.joinBlocked ? (
              <p className={`notice ${s.inset}`}>{k.joinBlocked}</p>
            ) : (
              <fieldset className={s.products}>
                <legend className="label">
                  Show these, up to {MAX_JOIN_PRODUCTS}. {defaultPick ? "With none picked, it shows up to 4 that don't ship." : ""}
                </legend>
                {k.products.map((p) => (
                  <label key={p.id} className={s.product}>
                    <input type="checkbox" name="product" value={p.id} defaultChecked={picked.has(p.id)} disabled={!canManage} />
                    <span>{p.name}</span>
                    <span className="num muted">{p.price}</span>
                    {p.ships && <span className="pill">Ships</span>}
                  </label>
                ))}
              </fieldset>
            )}
            <Toggle name="waiverOn" title="Sign the waiver" note={ready ? "People sign with a finger. Anyone who checks in without signing the current version is asked to sign it." : "Write and save your waiver below first."} checked={c.waiver.on && ready} disabled={!canManage || !ready} />
            <Toggle name="emailOptIn" title="Ask about email" note={marketing ? "Pass and tour forms offer a box to get your tips and offers. Ticking it adds them to your list and starts your new lead follow-up." : "Needs Marketing. Without it, nobody is added to an email list from the kiosk."} checked={c.emailOptIn && marketing} disabled={!canManage || !marketing} />
            <label className={s.field}>
              <span className="label">Back to the welcome screen after</span>
              <select className="select" name="idleSeconds" defaultValue={String(c.idleSeconds)} disabled={!canManage}>
                {IDLE_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {IDLE_LABEL[n]} without a touch
                  </option>
                ))}
              </select>
            </label>
          </div>
        </ActionForm>
      </Card>

      <Card title="Waiver" id="waiver" note="What people sign at the desk. We keep a copy of the exact words each person signed, with their signature and the time. Have a lawyer read it before you turn it on; ours is only a starting point." testId="kiosk-waiver">
        <p className="muted" style={{ marginTop: 0 }}>
          {k.waiver.version ? `Version ${k.waiver.version}. ${ready ? "Ready to sign." : "Fill in anything marked [Add ...] before it can go on the tablet."}` : "Not saved yet. Below is a starting point with your club's name in it."}
        </p>
        <ActionForm action={saveWaiverText} submitLabel="Save waiver" testId="kiosk-waiver-form">
          <div className={s.config}>
            <label className={s.field}>
              <span className="label">Title</span>
              <input className="input" name="title" defaultValue={draft.title} maxLength={120} disabled={!canManage} />
            </label>
            <label className={s.field}>
              <span className="label">The waiver{hasPlaceholder(draft.body) ? ", with your details still to add" : ""}</span>
              <textarea className={`input ${s.textarea}`} name="body" defaultValue={draft.body} maxLength={20000} rows={14} disabled={!canManage} data-testid="kiosk-waiver-body" />
            </label>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}

export default function KioskSettingsPage() {
  return (
    <>
      <Link href="/settings" className="link" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: "var(--bo-text-sm)" }}>
        <ArrowLeft aria-hidden="true" style={{ width: 15, height: 15 }} />
        Settings
      </Link>
      <PageHeader title="Front desk kiosk" note="Turn a tablet at your front desk into a kiosk: check-ins, free passes, tours, joining and your waiver." />
      <Suspense fallback={null}>
        <Body />
      </Suspense>
    </>
  );
}
