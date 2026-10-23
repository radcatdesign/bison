"use client";

// Settings, Shipping: the company's own ShipStation or UPS account, for live
// rates at checkout and (ShipStation) sending paid orders to be packed. Keys
// are tested, encrypted and never shown again; only the last four characters.
import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { connectCarrierAction, removeCarrierAction } from "@/app/(portal)/sales/actions";
import { useSay } from "@/components/edition";
import m from "@/components/marketing/marketing.module.css";

type Conn = { connected: boolean; detail: string; keyHint: string; accountNumber: string; error: string | null };

export function CarrierSetup({ shipstation, ups, canManage, demo }: { shipstation: Conn; ups: Conn; canManage: boolean; demo: boolean }) {
  return (
    <div className={m.wizard}>
      <ShipStationCard conn={shipstation} canManage={canManage} demo={demo} />
      <UpsCard conn={ups} canManage={canManage} demo={demo} />
    </div>
  );
}

function useRun() {
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return { notice, pending, run: (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => setNotice(await fn().then((r) => ({ ok: r.ok, text: r.message })))) , setNotice };
}

function Status({ conn }: { conn: Conn }) {
  if (conn.connected) return <span className="pill pill-good"><Check aria-hidden="true" style={{ width: 13, height: 13 }} /> Connected</span>;
  if (conn.error) return <span className="pill pill-warn">Needs attention</span>;
  return <span className="pill">Not set up</span>;
}

function ShipStationCard({ conn, canManage, demo }: { conn: Conn; canManage: boolean; demo: boolean }) {
  const say = useSay();
  const [key, setKey] = useState("");
  const { notice, pending, run, setNotice } = useRun();
  return (
    <section className={m.wizardStep} data-state={conn.connected ? "done" : "current"} data-testid="carrier-shipstation">
      <span className={m.wizardNum} aria-hidden="true">{conn.connected ? <Check /> : 1}</span>
      <div className={m.wizardBody}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>ShipStation <Status conn={conn} /></h2>
        <p className={m.hint}>{say("Live rates from every carrier in your ShipStation account, and paid orders sent straight to ShipStation to pack and label. Needs a ShipStation plan with API access.", "Live gear rates from every carrier in your ShipStation account, and paid purchases sent straight to ShipStation so your team can pack and label the gear. Needs a ShipStation plan with API access.")}</p>
        {conn.connected && <p className={m.hint}>{conn.detail} Key ending <span className="mono">{conn.keyHint}</span>.</p>}
        {conn.error && !conn.connected && <p className="notice notice-error">{conn.error}</p>}
        {canManage && (
          <form
            className={m.field}
            onSubmit={(e) => {
              e.preventDefault();
              if (demo) return setNotice({ ok: false, text: "This is a demo, so it can't connect a real ShipStation account." });
              run(async () => {
                const r = await connectCarrierAction("shipstation", { apiKey: key });
                if (r.ok) setKey("");
                return r;
              });
            }}
          >
            <label htmlFor="ss-key" className={m.fieldLabel}>
              {conn.connected ? "Replace the API key" : "API key (v2)"}
            </label>
            <ol className={m.hint} style={{ margin: "0 0 4px 18px", padding: 0 }}>
              <li>In ShipStation, open Settings, then Account, then API Settings.</li>
              <li>Choose API v2 and generate a key. ShipStation shows it once.</li>
              <li>Paste it here. We test it, encrypt it, and never show it again.</li>
            </ol>
            <input id="ss-key" className="input mono" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste the key" data-testid="ss-key" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-primary" disabled={pending || !key.trim()} data-testid="ss-connect">
                {pending ? "Testing" : conn.connected ? "Test and replace" : "Test and connect"}
              </button>
              {(conn.connected || conn.error) && (
                <button type="button" className="btn" disabled={pending} onClick={() => run(() => removeCarrierAction("shipstation"))}>
                  Remove
                </button>
              )}
            </div>
          </form>
        )}
        {notice && <p className={`notice ${notice.ok ? "notice-ok" : "notice-error"}`} role={notice.ok ? "status" : "alert"} data-testid="ss-notice">{notice.text}</p>}
      </div>
    </section>
  );
}

function UpsCard({ conn, canManage, demo }: { conn: Conn; canManage: boolean; demo: boolean }) {
  const [v, setV] = useState({ clientId: "", clientSecret: "", accountNumber: conn.accountNumber, sandbox: false });
  const { notice, pending, run, setNotice } = useRun();
  return (
    <section className={m.wizardStep} data-state={conn.connected ? "done" : "current"} data-testid="carrier-ups">
      <span className={m.wizardNum} aria-hidden="true">{conn.connected ? <Check /> : 2}</span>
      <div className={m.wizardBody}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>UPS <Status conn={conn} /></h2>
        <p className={m.hint}>Live UPS rates with your own account&apos;s prices, including any discounts you&apos;ve negotiated. Use this if you ship UPS and don&apos;t use ShipStation.</p>
        {conn.connected && <p className={m.hint}>{conn.detail}</p>}
        {conn.error && !conn.connected && <p className="notice notice-error">{conn.error}</p>}
        {canManage && (
          <form
            className={m.formCol}
            onSubmit={(e) => {
              e.preventDefault();
              if (demo) return setNotice({ ok: false, text: "This is a demo, so it can't connect a real UPS account." });
              run(async () => {
                const r = await connectCarrierAction("ups", v);
                if (r.ok) setV((x) => ({ ...x, clientId: "", clientSecret: "" }));
                return r;
              });
            }}
          >
            <ol className={m.hint} style={{ margin: "0 0 0 18px", padding: 0 }}>
              <li>Sign in at developer.ups.com with your UPS account and add an app.</li>
              <li>Give it the Rating product and link your shipper account.</li>
              <li>Copy its client ID and client secret here, with your six-character account number.</li>
            </ol>
            <div className={m.twoUp}>
              <div className={m.field}>
                <label htmlFor="ups-id" className={m.fieldLabel}>Client ID</label>
                <input id="ups-id" className="input mono" autoComplete="off" value={v.clientId} onChange={(e) => setV({ ...v, clientId: e.target.value })} />
              </div>
              <div className={m.field}>
                <label htmlFor="ups-secret" className={m.fieldLabel}>Client secret</label>
                <input id="ups-secret" className="input mono" type="password" autoComplete="off" value={v.clientSecret} onChange={(e) => setV({ ...v, clientSecret: e.target.value })} />
              </div>
            </div>
            <div className={m.field}>
              <label htmlFor="ups-acct" className={m.fieldLabel}>Account number</label>
              <input id="ups-acct" className="input mono" value={v.accountNumber} maxLength={6} onChange={(e) => setV({ ...v, accountNumber: e.target.value.toUpperCase() })} style={{ maxWidth: 160 }} />
            </div>
            <label className={m.checkRow}>
              <input type="checkbox" checked={v.sandbox} onChange={(e) => setV({ ...v, sandbox: e.target.checked })} />
              <span>Use the UPS test environment (for trying it out)</span>
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-primary" disabled={pending || !v.clientId || !v.clientSecret}>
                {pending ? "Testing" : "Test and connect"}
              </button>
              {(conn.connected || conn.error) && (
                <button type="button" className="btn" disabled={pending} onClick={() => run(() => removeCarrierAction("ups"))}>
                  Remove
                </button>
              )}
            </div>
          </form>
        )}
        {notice && <p className={`notice ${notice.ok ? "notice-ok" : "notice-error"}`} role={notice.ok ? "status" : "alert"}>{notice.text}</p>}
      </div>
    </section>
  );
}
