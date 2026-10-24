"use client";
/* eslint-disable @next/next/no-img-element -- the club's logo can live on any https host. */

// The kiosk on the tablet at the front desk. One screen at a time, big
// buttons, and back to the welcome screen on its own when nobody's touched it
// for a while, with whatever was typed cleared. In preview, nothing is sent.
import { ArrowLeft, CalendarCheck, Check, CreditCard, Delete, Lock, PenLine, ScanLine, Ticket, UserCheck } from "lucide-react";
import { type CSSProperties, type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { accentInk } from "@/lib/color";
import type { JoinOption, KioskView } from "@/lib/kiosk/store";
import { SignaturePad, type Strokes } from "./signature-pad";
import s from "./kiosk.module.css";

type Screen = "home" | "pass" | "tour" | "join" | "checkin" | "waiver" | "done" | "staff";
type Answer = { ok: boolean; status?: number; message: string; name?: string; visits?: number; needsWaiver?: boolean };
type Person = { name: string; email: string; phone: string };
type Done = { title: string; body: string; waiver?: boolean };

const EMPTY: Person = { name: "", email: "", phone: "" };
const DONE_SECONDS = 10;

/** In preview, answers come from here and nothing leaves the browser. */
function previewAnswer(action: string, body: Record<string, unknown>): Answer {
  const first = typeof body.name === "string" ? body.name.trim().split(/\s+/)[0] : "";
  if (action === "checkin") return { ok: true, message: "You're checked in.", name: "Alex", visits: 4 };
  if (action === "leave") return body.pin ? { ok: true, message: "" } : { ok: false, message: "That PIN isn't right." };
  return { ok: true, message: "Done.", name: first };
}

export function Kiosk({ view, preview = false, previewExit }: { view: KioskView; preview?: boolean; previewExit?: string }) {
  const [screen, setScreen] = useState<Screen>("home");
  const [person, setPerson] = useState<Person>(EMPTY);
  const [done, setDone] = useState<Done | null>(null);
  const [join, setJoin] = useState<JoinOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef(0);

  const home = useCallback(() => {
    setScreen("home");
    setPerson(EMPTY);
    setDone(null);
    setJoin(null);
    setError(null);
  }, []);

  const go = (next: Screen) => {
    setError(null);
    setScreen(next);
  };

  // Back to the start when nobody's touched the screen for a while.
  useEffect(() => {
    last.current = Date.now();
    const touch = () => (last.current = Date.now());
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("keydown", touch);
    const timer = window.setInterval(() => {
      const quiet = (Date.now() - last.current) / 1000;
      if (screen === "done" ? quiet > DONE_SECONDS : screen !== "home" && quiet > view.idleSeconds) home();
    }, 1000);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      window.clearInterval(timer);
    };
  }, [screen, view.idleSeconds, home]);

  // Now and then, ask whether this tablet is still paired. Unpaired from Settings: back to the pairing screen.
  useEffect(() => {
    if (preview) return;
    const timer = window.setInterval(() => {
      fetch("/kiosk/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ping" }) })
        .then((r) => {
          if (r.status === 401) window.location.reload();
        })
        .catch(() => {});
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [preview]);

  async function send(action: string, body: Record<string, unknown>): Promise<Answer> {
    if (preview) return previewAnswer(action, body);
    try {
      const r = await fetch("/kiosk/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...body }) });
      if (r.status === 401) {
        window.location.reload();
        return { ok: false, message: "This tablet isn't paired anymore." };
      }
      const data = (await r.json().catch(() => null)) as Answer | null;
      return data ?? { ok: false, message: "Something went wrong. Try again, or ask at the desk." };
    } catch {
      return { ok: false, message: "The tablet lost its connection. Check the Wi-Fi, then try again." };
    }
  }

  async function run(action: string, body: Record<string, unknown>, onOk: (a: Answer) => void) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const a = await send(action, body);
    setBusy(false);
    if (!a.ok) return setError(a.message);
    last.current = Date.now();
    onOk(a);
  }

  const tiles: { key: Screen; label: string; note: string; icon: ReactNode; on: boolean }[] = [
    { key: "checkin", label: "Check in", note: "Members and guests", icon: <UserCheck aria-hidden="true" />, on: view.checkIn },
    { key: "pass", label: view.pass?.label ?? "", note: "New here? Try us first", icon: <Ticket aria-hidden="true" />, on: Boolean(view.pass) },
    { key: "tour", label: "Book a tour", note: "We'll show you around", icon: <CalendarCheck aria-hidden="true" />, on: Boolean(view.tour) },
    { key: "join", label: "Join today", note: "Pay on your own phone", icon: <CreditCard aria-hidden="true" />, on: Boolean(view.join) },
    { key: "waiver", label: "Sign the waiver", note: "Takes a minute", icon: <PenLine aria-hidden="true" />, on: Boolean(view.waiver) },
  ];
  const shown = tiles.filter((t) => t.on);

  const style = { "--bo-accent": view.accent, "--bo-accent-ink": accentInk(view.accent) } as CSSProperties;

  return (
    <div className={s.kiosk} style={style} data-accent="" data-edition="fit" data-testid="kiosk" data-screen={screen}>
      {preview && (
        <div className={s.previewBar} data-testid="kiosk-preview">
          <span>Preview. Nothing here is saved or sent.</span>
          {previewExit && (
            <a href={previewExit} className={s.previewLink}>
              Back to Settings
            </a>
          )}
        </div>
      )}

      <header className={s.top}>
        {screen !== "home" ? (
          <button type="button" className={s.back} onClick={home}>
            <ArrowLeft aria-hidden="true" />
            Start over
          </button>
        ) : (
          <span />
        )}
        <span className={s.brand}>
          {view.logo ? <img src={view.logo} alt="" className={s.logo} /> : null}
          <span>{view.club}</span>
        </span>
        <span />
      </header>

      <main className={s.stage}>
        {screen === "home" && (
          <div className={s.home}>
            <h1 className={s.welcome}>{view.welcome}</h1>
            {shown.length === 0 ? (
              <p className={s.lead}>Ask at the desk and we&apos;ll help you out.</p>
            ) : (
              <>
                <p className={s.lead}>Tap one to get started.</p>
                <div className={s.tiles} data-count={shown.length}>
                  {shown.map((t) => (
                    <button key={t.key} type="button" className={s.tile} onClick={() => go(t.key)} data-testid={`kiosk-tile-${t.key}`}>
                      <span className={s.tileIcon}>{t.icon}</span>
                      <span className={s.tileLabel}>{t.label}</span>
                      <span className={s.tileNote}>{t.note}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {screen === "checkin" && <CheckIn busy={busy} error={error} onSubmit={(lookup) => run("checkin", { lookup }, (a) => finish({ title: `Welcome back, ${a.name || "friend"}.`, body: a.message === "You're already checked in." ? "You're already checked in. Have a great workout." : a.visits && a.visits > 1 ? `You're checked in. That's visit ${a.visits} this month.` : "You're checked in. Have a great workout.", waiver: a.needsWaiver }))} />}

        {screen === "pass" && view.pass && (
          <PersonForm
            title={view.pass.label}
            note="Tell us who you are and the front desk will get you started."
            person={person}
            setPerson={setPerson}
            optIn={view.emailOptIn ? view.club : null}
            busy={busy}
            error={error}
            submit="Claim my pass"
            testId="kiosk-pass-form"
            onSubmit={(optIn) => run("pass", { ...person, optIn }, (a) => finish({ title: `You're all set, ${a.name || person.name.split(" ")[0]}.`, body: "Show this screen at the desk and we'll start your pass.", waiver: a.needsWaiver }))}
          />
        )}

        {screen === "tour" && view.tour && (
          <TourForm person={person} setPerson={setPerson} times={view.tour.times} optIn={view.emailOptIn ? view.club : null} busy={busy} error={error} onSubmit={(extra) => run("tour", { ...person, ...extra }, (a) => finish({ title: `Thanks, ${a.name || person.name.split(" ")[0]}.`, body: "Someone from the team will be in touch to set a time." }))} />
        )}

        {screen === "join" && view.join && (join ? <JoinItem item={join} onBack={() => setJoin(null)} /> : <JoinList items={view.join} onPick={setJoin} />)}

        {screen === "waiver" && view.waiver && (
          <WaiverForm
            waiver={view.waiver}
            person={person}
            setPerson={setPerson}
            busy={busy}
            error={error}
            onSubmit={(signature, agree) => run("waiver", { ...person, signature, agree, version: view.waiver!.version }, (a) => finish({ title: `Thanks, ${a.name || person.name.split(" ")[0]}.`, body: "Your waiver is signed. You're good to go." }))}
          />
        )}

        {screen === "done" && done && (
          <div className={s.done} data-testid="kiosk-done" role="status">
            <span className={s.doneIcon} aria-hidden="true">
              <Check />
            </span>
            <h1 className={s.doneTitle}>{done.title}</h1>
            <p className={s.lead}>{done.body}</p>
            {done.waiver && view.waiver && (
              <div className={s.doneMore}>
                <p>Before you head in, please sign the club&apos;s waiver.</p>
                <button type="button" className={s.primary} onClick={() => go("waiver")} data-testid="kiosk-sign-now">
                  Sign the waiver now
                </button>
              </div>
            )}
            <button type="button" className={s.secondary} onClick={home}>
              Done
            </button>
          </div>
        )}

        {screen === "staff" && <StaffExit busy={busy} error={error} onSubmit={(pin) => run("leave", { pin }, () => (preview ? window.location.assign(previewExit ?? "/settings/kiosk") : window.location.reload()))} />}
      </main>

      <footer className={s.foot}>
        <span className="muted">{preview ? "Preview" : view.deviceName}</span>
        {screen !== "staff" && (
          <button type="button" className={s.staff} onClick={() => go("staff")} data-testid="kiosk-staff">
            <Lock aria-hidden="true" />
            Staff
          </button>
        )}
      </footer>
    </div>
  );

  function finish(d: Done) {
    setDone(d);
    setScreen("done");
  }
}

// ---- Screens ---------------------------------------------------------------------

function Problem({ error }: { error: string | null }) {
  return (
    <div aria-live="assertive">
      {error && (
        <p className={s.error} data-testid="kiosk-error">
          {error}
        </p>
      )}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className={s.field}>
      <span className={s.fieldLabel}>
        {label}
        {hint && <span className={s.fieldHint}> {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function PersonFields({ person, setPerson, phoneOptional = true }: { person: Person; setPerson: (p: Person) => void; phoneOptional?: boolean }) {
  return (
    <>
      <Field label="Your name">
        <input className={s.input} name="name" autoComplete="off" autoCapitalize="words" required value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} />
      </Field>
      <Field label="Email">
        <input className={s.input} name="email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" required value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} />
      </Field>
      <Field label="Phone" hint={phoneOptional ? "(optional)" : undefined}>
        <input className={s.input} name="phone" type="tel" inputMode="tel" autoComplete="off" value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} />
      </Field>
    </>
  );
}

function OptIn({ club, checked, onChange }: { club: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={s.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} name="optIn" />
      <span>Send me tips and offers from {club}. You can stop them any time.</span>
    </label>
  );
}

function PersonForm({ title, note, person, setPerson, optIn, busy, error, submit, testId, onSubmit }: { title: string; note: string; person: Person; setPerson: (p: Person) => void; optIn: string | null; busy: boolean; error: string | null; submit: string; testId: string; onSubmit: (optIn: boolean) => void }) {
  const [yes, setYes] = useState(false);
  return (
    <form
      className={s.form}
      data-testid={testId}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(yes);
      }}
    >
      <h1 className={s.title}>{title}</h1>
      <p className={s.lead}>{note}</p>
      <PersonFields person={person} setPerson={setPerson} />
      {optIn && <OptIn club={optIn} checked={yes} onChange={setYes} />}
      <Problem error={error} />
      <button type="submit" className={s.primary} disabled={busy}>
        {busy ? "Sending" : submit}
      </button>
    </form>
  );
}

function TourForm({ person, setPerson, times, optIn, busy, error, onSubmit }: { person: Person; setPerson: (p: Person) => void; times: string[]; optIn: string | null; busy: boolean; error: string | null; onSubmit: (extra: { when: string; note: string; optIn: boolean }) => void }) {
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [yes, setYes] = useState(false);
  return (
    <form
      className={s.form}
      data-testid="kiosk-tour-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ when, note, optIn: yes });
      }}
    >
      <h1 className={s.title}>Book a tour</h1>
      <p className={s.lead}>We&apos;ll show you the club and answer your questions.</p>
      <PersonFields person={person} setPerson={setPerson} />
      <fieldset className={s.choices}>
        <legend className={s.fieldLabel}>When works for you?</legend>
        <div className={s.choiceRow}>
          {times.map((t) => (
            <button key={t} type="button" className={s.choice} aria-pressed={when === t} onClick={() => setWhen(t)}>
              {t}
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Anything we should know?" hint="(optional)">
        <input className={s.input} name="note" autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>
      {optIn && <OptIn club={optIn} checked={yes} onChange={setYes} />}
      <Problem error={error} />
      <button type="submit" className={s.primary} disabled={busy}>
        {busy ? "Sending" : "Request a tour"}
      </button>
    </form>
  );
}

function CheckIn({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (lookup: string) => void }) {
  const [by, setBy] = useState<"phone" | "email">("phone");
  const [value, setValue] = useState("");
  return (
    <form
      className={s.form}
      data-testid="kiosk-checkin-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <h1 className={s.title}>Check in</h1>
      <p className={s.lead}>Use the phone number or email you signed up with.</p>
      <div className={s.choiceRow} role="group" aria-label="Check in with">
        <button type="button" className={s.choice} aria-pressed={by === "phone"} onClick={() => (setBy("phone"), setValue(""))}>
          Phone number
        </button>
        <button type="button" className={s.choice} aria-pressed={by === "email"} onClick={() => (setBy("email"), setValue(""))}>
          Email
        </button>
      </div>
      <Field label={by === "phone" ? "Phone number" : "Email"}>
        <input key={by} className={`${s.input} ${s.big}`} name="lookup" type={by === "phone" ? "tel" : "email"} inputMode={by === "phone" ? "tel" : "email"} autoComplete="off" autoCapitalize="none" required value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <Problem error={error} />
      <button type="submit" className={s.primary} disabled={busy}>
        {busy ? "Checking" : "Check in"}
      </button>
    </form>
  );
}

function JoinList({ items, onPick }: { items: JoinOption[]; onPick: (o: JoinOption) => void }) {
  return (
    <div className={s.form}>
      <h1 className={s.title}>Join today</h1>
      <p className={s.lead}>Pick one, then scan the code with your phone to join and pay.</p>
      <div className={s.joinList}>
        {items.map((o) => (
          <button key={o.id} type="button" className={s.joinItem} onClick={() => onPick(o)} data-testid="kiosk-join-item">
            <span className={s.joinName}>{o.name}</span>
            <span className={`num ${s.joinPrice}`}>{o.price}</span>
            {o.description && <span className={s.tileNote}>{o.description}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function JoinItem({ item, onBack }: { item: JoinOption; onBack: () => void }) {
  return (
    <div className={s.qrScreen} data-testid="kiosk-join-qr">
      <h1 className={s.title}>{item.name}</h1>
      <p className={`num ${s.joinPrice}`}>{item.price}</p>
      <div className={s.qr}>
        <svg viewBox={`-2 -2 ${item.qr.size + 4} ${item.qr.size + 4}`} role="img" aria-label={`Code to join ${item.name}`}>
          <rect x="-2" y="-2" width={item.qr.size + 4} height={item.qr.size + 4} fill="#fff" />
          <path d={item.qr.path} fill="#000" />
        </svg>
      </div>
      <p className={s.lead}>
        <ScanLine aria-hidden="true" className={s.inline} /> Point your phone&apos;s camera at the code. You&apos;ll join and pay on your own phone, so your card never touches this tablet.
      </p>
      <button type="button" className={s.secondary} onClick={onBack}>
        See the other options
      </button>
    </div>
  );
}

function WaiverForm({ waiver, person, setPerson, busy, error, onSubmit }: { waiver: { title: string; body: string }; person: Person; setPerson: (p: Person) => void; busy: boolean; error: string | null; onSubmit: (signature: Strokes, agree: boolean) => void }) {
  const [strokes, setStrokes] = useState<Strokes>([]);
  const [agree, setAgree] = useState(false);
  return (
    <form
      className={s.form}
      data-testid="kiosk-sign-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(strokes, agree);
      }}
    >
      <h1 className={s.title}>{waiver.title}</h1>
      <div className={s.waiverText} tabIndex={0} aria-label="The waiver">
        {waiver.body.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <PersonFields person={person} setPerson={setPerson} />
      <label className={s.check}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} name="agree" />
        <span>I&apos;ve read this waiver and I agree to it.</span>
      </label>
      <SignaturePad strokes={strokes} onChange={setStrokes} />
      <Problem error={error} />
      <button type="submit" className={s.primary} disabled={busy}>
        {busy ? "Signing" : "Sign"}
      </button>
    </form>
  );
}

function StaffExit({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const press = (d: string) => setPin((p) => (p.length < 8 ? p + d : p));
  return (
    <form
      className={s.form}
      data-testid="kiosk-staff-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (pin.length >= 4) onSubmit(pin);
      }}
    >
      <h1 className={s.title}>Staff only</h1>
      <p className={s.lead}>Enter the staff PIN to leave the kiosk. This tablet will need a new code to come back.</p>
      <div className={s.pinDots} aria-label={`${pin.length} digits entered`} role="status">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} data-on={i < pin.length || undefined} />
        ))}
      </div>
      <div className={s.keypad}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={s.key} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={s.key} onClick={() => setPin("")} aria-label="Clear">
          C
        </button>
        <button type="button" className={s.key} onClick={() => press("0")}>
          0
        </button>
        <button type="button" className={s.key} onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete a digit">
          <Delete aria-hidden="true" />
        </button>
      </div>
      <Problem error={error} />
      <button type="submit" className={s.primary} disabled={busy || pin.length < 4} data-testid="kiosk-leave">
        {busy ? "Checking" : "Leave the kiosk"}
      </button>
    </form>
  );
}
