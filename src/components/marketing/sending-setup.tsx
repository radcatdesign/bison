"use client";

// Settings > Email sending, as four steps a company can do on its own: add a
// domain, put the DNS records in at their DNS host, choose the From address,
// and send themselves a test. We check the records for them while the page is
// open, so they can switch tabs to their DNS host and come back to a green tick.
import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { addSendingDomainAction, checkSendingDomainAction, removeSendingDomainAction, sendSetupTestAction, setFromAddressAction } from "@/app/(portal)/marketing/actions";
import type { DomainRecord } from "@/lib/email/provider";
import { fullName, relativeName, zoneOf } from "@/lib/marketing/dns";
import type { SendingState } from "@/lib/marketing/sending";
import { useIsClient } from "@/lib/use-is-client";
import { useDemoMarketing } from "./demo-setup";
import { writeDemo } from "./demo-store";
import s from "./marketing.module.css";

type Props = {
  state: SendingState;
  storage: "server" | "browser";
  tenantId: string;
  providerReady: boolean;
  canManage: boolean;
  suggested: string;
  fromName: string;
  me: string;
  team: { email: string; name: string }[];
  tested: boolean;
};

function demoRecords(domain: string, status: string): DomainRecord[] {
  const at = (n: string) => relativeName(n, domain);
  return [
    { record: "SPF", name: at("send"), type: "MX", value: "feedback-smtp.us-east-1.amazonses.com", priority: 10, status },
    { record: "SPF", name: at("send"), type: "TXT", value: '"v=spf1 include:amazonses.com ~all"', status },
    { record: "DKIM", name: at("resend._domainkey"), type: "TXT", value: "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDdemo0nly1sk3y0v3r1fy1ngn0th1ngr3al0nly4sh0w1ngh0w1tl00ksIDAQAB", status },
  ];
}

const PURPOSE: Record<string, string> = {
  SPF: "Says Resend may send for this domain, and where bounces go.",
  DKIM: "A signature key, so inboxes can tell the email really came from you.",
  DMARC: "Tells inboxes what to do with email that fails the checks.",
};

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  verified: { label: "Verified", tone: "pill pill-good" },
  pending: { label: "Waiting for DNS", tone: "pill pill-warn" },
  not_started: { label: "Not checked yet", tone: "pill" },
  failed: { label: "Didn't match", tone: "pill pill-bad" },
  partially_verified: { label: "Partly verified", tone: "pill pill-warn" },
  partially_failed: { label: "Partly failed", tone: "pill pill-bad" },
  none: { label: "No domain yet", tone: "pill" },
};

export function SendingSetup(props: Props) {
  const demo = useDemoMarketing(props.tenantId);
  const state: SendingState =
    props.storage === "browser"
      ? demo.sending?.domain
        ? { ...props.state, domain: demo.sending.domain, domainId: "demo", status: demo.sending.checked ? "verified" : "pending", records: demoRecords(demo.sending.domain, demo.sending.checked ? "verified" : "pending") }
        : props.state
      : props.state;
  const tested = props.storage === "browser" ? Boolean(demo.sending?.tested) : props.tested;
  return <Wizard {...props} state={state} tested={tested} />;
}

function Wizard({ state, storage, tenantId, providerReady, canManage, suggested, fromName, me, team, tested }: Props) {
  const [domainInput, setDomainInput] = useState(suggested);
  const [local, setLocal] = useState(state.fromLocal);
  const [to, setTo] = useState(me);
  const [notice, setNotice] = useState<Record<string, { ok: boolean; text: string } | undefined>>({});
  const [pending, start] = useTransition();
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(state.checkedAt);
  const browser = storage === "browser";
  const client = useIsClient();

  const verified = state.status === "verified";
  const hasDomain = Boolean(state.domain);
  const say = (step: string, ok: boolean, text: string) => setNotice((n) => ({ ...n, [step]: { ok, text } }));

  const check = useCallback(async () => {
    setChecking(true);
    if (browser) {
      writeDemo(tenantId, (d) => ({ ...d, sending: { ...(d.sending ?? { domain: "", tested: false }), checked: true } }));
      say("records", true, "Verified. In the demo the records count as added; in your own account we check them for real.");
    } else {
      const r = await checkSendingDomainAction();
      say("records", r.ok && r.status === "verified", r.message);
    }
    setLastChecked(new Date().toISOString());
    setChecking(false);
  }, [browser, tenantId]);

  // Keep checking every 20 seconds while the page is open and the domain isn't verified yet.
  const tries = useRef(0);
  useEffect(() => {
    if (!hasDomain || verified || browser || !canManage) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || tries.current >= 45) return;
      tries.current++;
      void check();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [hasDomain, verified, browser, canManage, check]);

  const stepState = (n: number) => {
    const current = !hasDomain ? 1 : !verified ? 2 : !tested ? 4 : 0;
    if (n === 1) return hasDomain ? "done" : "current";
    if (n === 2) return verified ? "done" : hasDomain ? "current" : "later";
    if (n === 3) return verified ? "done" : "later";
    return tested ? "done" : current === 4 ? "current" : "later";
  };

  const status = STATUS_LABEL[state.status] ?? STATUS_LABEL.none;

  return (
    <div className={s.wizard} data-testid="sending-setup">
      {!providerReady && !browser && (
        <p className="notice notice-error" role="alert">
          Email sending isn&apos;t switched on for this Bison Ops server yet (no RESEND_API_KEY). The steps below work once it is.
        </p>
      )}
      {!canManage && <p className="notice">Only owners and admins can change sending. You can still send yourself a test once it&apos;s set up.</p>}

      <StepCard n={1} id="domain" state={stepState(1)} title="Add the domain you'll send from">
        <p>
          Use a subdomain of your website, like <span className="mono">{suggested}</span>. Marketing email then has its own reputation, and your everyday email from your main domain isn&apos;t affected by it.
        </p>
        {hasDomain ? (
          <div className={s.statusLine}>
            <span>
              Sending domain: <strong className="mono" data-testid="sending-domain">{state.domain}</strong>
            </span>
            <span className={status.tone} data-testid="sending-status">
              {status.label}
            </span>
            {canManage && (
              <button
                type="button"
                className={s.linkButton}
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Stop sending from ${state.domain}? Scheduled emails won't go out until a domain is verified again.`)) return;
                  start(async () => {
                    if (browser) writeDemo(tenantId, (d) => ({ ...d, sending: undefined }));
                    else {
                      const r = await removeSendingDomainAction();
                      say("domain", r.ok, r.message);
                    }
                  });
                }}
              >
                Use a different domain
              </button>
            )}
          </div>
        ) : (
          <form
            className={s.inline}
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                if (browser) {
                  const d = domainInput.trim().toLowerCase();
                  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return say("domain", false, "That doesn't look like a domain. Try something like mail.yourcompany.com.");
                  writeDemo(tenantId, (x) => ({ ...x, sending: { domain: d, checked: false, tested: false } }));
                  return say("domain", true, `Added ${d}. In your own account, Bison Ops asks Resend for the real records.`);
                }
                const r = await addSendingDomainAction(domainInput);
                say("domain", r.ok, r.message);
              });
            }}
          >
            <div className={s.field}>
              <label htmlFor="sending-domain-input" className={s.fieldLabel}>
                Domain
              </label>
              <input id="sending-domain-input" className="input" value={domainInput} onChange={(e) => setDomainInput(e.target.value)} placeholder="mail.yourcompany.com" disabled={!canManage} autoComplete="off" spellCheck={false} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={pending || !canManage || !domainInput.trim()} data-testid="add-domain">
              {pending ? "Adding" : "Add domain"}
            </button>
          </form>
        )}
        <Notice value={notice.domain} />
      </StepCard>

      <StepCard n={2} id="records" state={stepState(2)} title="Add these records at your DNS host, then check">
        {!hasDomain ? (
          <p>Once you add a domain, the records to copy show up here.</p>
        ) : (
          <>
            <p>
              Sign in where your domain&apos;s DNS is managed (often where you bought the domain) and add each record below exactly as shown. Most hosts add <span className="mono">{zoneOf(state.domain!)}</span> to the end of the name for you; if yours asks for the full name, use the one under it.
            </p>
            <div className={s.records} data-testid="dns-records">
              {state.records.map((r, i) => (
                <div key={`${r.type}-${r.name}-${i}`} className={s.record}>
                  <div className={s.recordHead}>
                    <strong>
                      {r.type} record{r.record ? ` (${r.record})` : ""}
                    </strong>
                    <span className={STATUS_LABEL[r.status]?.tone ?? "pill"}>{STATUS_LABEL[r.status]?.label ?? r.status}</span>
                  </div>
                  {PURPOSE[r.record] && <span className={s.hint}>{PURPOSE[r.record]}</span>}
                  <dl className={s.recordGrid}>
                    <dt>Name</dt>
                    <dd>{r.name || "@"}</dd>
                    <CopyButton value={r.name || "@"} label="name" />
                    <dt>Full name</dt>
                    <dd>{fullName(r.name, state.domain!)}</dd>
                    <CopyButton value={fullName(r.name, state.domain!)} label="full name" />
                    <dt>Value</dt>
                    <dd>{r.value}</dd>
                    <CopyButton value={r.value} label="value" />
                    {r.priority !== undefined && (
                      <>
                        <dt>Priority</dt>
                        <dd>{r.priority}</dd>
                        <span />
                      </>
                    )}
                    <dt>TTL</dt>
                    <dd>Auto, or 3600</dd>
                    <span />
                  </dl>
                </div>
              ))}
            </div>

            <div className={s.hosts}>
              <span className={s.fieldLabel}>Help for your DNS host</span>
              <HostTip name="Cloudflare">
                <ol>
                  <li>Open your domain, then DNS, then Records, and press Add record.</li>
                  <li>Pick the Type, paste the Name and the Value. For MX, set Priority to 10.</li>
                  <li>Leave Proxy status off (DNS only). TTL can stay on Auto.</li>
                </ol>
              </HostTip>
              <HostTip name="GoDaddy">
                <ol>
                  <li>Go to My Products, find the domain and choose DNS.</li>
                  <li>Press Add New Record. Put the Name in Host; GoDaddy adds your domain itself.</li>
                  <li>Paste the Value. For MX, Priority is 10. Save each one.</li>
                </ol>
              </HostTip>
              <HostTip name="Namecheap">
                <ol>
                  <li>Domain List, then Manage, then Advanced DNS.</li>
                  <li>Add the TXT records under Host Records with the Name in Host. Paste TXT values without the outer quotes.</li>
                  <li>Add the MX record under Mail Settings, set to Custom MX, priority 10.</li>
                </ol>
              </HostTip>
              <HostTip name="Squarespace (and former Google Domains)">
                <ol>
                  <li>Open Domains, pick the domain, then DNS, then DNS Settings.</li>
                  <li>Under Custom records, press Add record. Put the Name in Host and paste the Data.</li>
                  <li>For MX, priority 10.</li>
                </ol>
              </HostTip>
              <HostTip name="Wix, Shopify and others">
                <p>Look for Domains, then Manage DNS or DNS records, and add each record. If the host asks for the full name, use the Full name. If the TXT record gets rejected, try it with and without the outer quotes.</p>
              </HostTip>
              <HostTip name="Someone else manages our DNS">
                <p>Send them this page&apos;s three records. It&apos;s a five-minute job for whoever handles your website or IT.</p>
              </HostTip>
            </div>

            <div className={s.statusLine}>
              <button type="button" className={verified ? "btn" : "btn btn-primary"} onClick={() => void check()} disabled={checking || !providerReady && !browser} data-testid="check-domain">
                {checking ? "Checking" : verified ? "Check again" : "Check now"}
              </button>
              <span className={status.tone}>{status.label}</span>
              {lastChecked && client && <span className={s.hint}>Last checked {new Date(lastChecked).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
              {!verified && !browser && <span className={s.hint}>We check every 20 seconds while this page is open. DNS changes usually show up within an hour, and can take up to a day.</span>}
            </div>
          </>
        )}
        <Notice value={notice.records} testId="records-notice" />
      </StepCard>

      <StepCard n={3} id="from" state={stepState(3)} title="Choose your From address">
        <p>
          This is who your emails come from. Something people recognize, like hello or news, works best. The name in front comes from your{" "}
          <Link href="/marketing/brand#name" className="link">
            brand kit
          </Link>
          .
        </p>
        <form
          className={s.inline}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              if (browser) return say("from", true, "Saved in this browser.");
              const r = await setFromAddressAction(local);
              say("from", r.ok, r.message);
            });
          }}
        >
          <div className={s.field}>
            <label htmlFor="from-local" className={s.fieldLabel}>
              Address
            </label>
            <input id="from-local" className="input" value={local} onChange={(e) => setLocal(e.target.value.toLowerCase())} disabled={!canManage} maxLength={40} autoComplete="off" spellCheck={false} />
          </div>
          <button type="submit" className="btn" disabled={pending || !canManage}>
            Save
          </button>
        </form>
        <p className={s.fromPreview} data-testid="from-preview">
          &quot;{fromName}&quot; &lt;{local || "hello"}@{state.domain ?? suggested}&gt;
        </p>
        <Notice value={notice.from} />
      </StepCard>

      <StepCard n={4} id="test" state={stepState(4)} title="Send yourself a test">
        <p>See it the way subscribers will: in your own inbox, from your own address, in your brand kit. Check that it isn&apos;t in spam.</p>
        <form
          className={s.inline}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              if (browser) {
                writeDemo(tenantId, (d) => ({ ...d, sending: { ...(d.sending ?? { domain: "", checked: false }), tested: true } }));
                return say("test", true, "This is a demo, so nothing was sent. In your own account the test arrives in a minute or so.");
              }
              const r = await sendSetupTestAction(to);
              say("test", r.ok, r.message);
            });
          }}
        >
          <div className={s.field}>
            <label htmlFor="test-to" className={s.fieldLabel}>
              Send to
            </label>
            <select id="test-to" className="select" value={to} onChange={(e) => setTo(e.target.value)}>
              {team.map((m) => (
                <option key={m.email} value={m.email}>
                  {m.name ? `${m.name} (${m.email})` : m.email}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={stepState(4) === "current" ? "btn btn-primary" : "btn"} disabled={pending || (!verified && !browser)} data-testid="send-setup-test">
            {pending ? "Sending" : "Send test"}
          </button>
        </form>
        {!verified && !browser && <p className={s.hint}>Available once your domain is verified.</p>}
        <Notice value={notice.test} testId="test-notice" />
      </StepCard>
    </div>
  );
}

function StepCard({ n, id, state, title, children }: { n: number; id: string; state: string; title: string; children: React.ReactNode }) {
  return (
    <section className={s.wizardStep} id={id} data-state={state} aria-labelledby={`${id}-title`} data-testid={`wizard-${id}`}>
      <span className={s.wizardNum} aria-hidden="true">
        {state === "done" ? <Check /> : n}
      </span>
      <div className={s.wizardBody}>
        <h2 id={`${id}-title`}>
          {title}
          {state === "done" && <span className="visually-hidden"> (done)</span>}
        </h2>
        {children}
      </div>
    </section>
  );
}

function HostTip({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <details>
      <summary>{name}</summary>
      {children}
    </details>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`btn ${s.copy}`}
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard can be blocked; the value is on screen to select by hand */
        }
      }}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Notice({ value, testId }: { value?: { ok: boolean; text: string }; testId?: string }) {
  if (!value) return null;
  return (
    <p className={`notice ${value.ok ? "notice-ok" : "notice-error"}`} role={value.ok ? "status" : "alert"} data-testid={testId}>
      {value.text}
    </p>
  );
}
