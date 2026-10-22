"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { MODE_COOKIE, type ModeKey } from "@/config/modes";
import s from "./shell.module.css";

export type NavMode = { key: ModeKey; label: string; locked: boolean; pages: { href: string; label: string }[] };

function activeMode(pathname: string, modes: NavMode[]): NavMode | undefined {
  return modes.find((m) => pathname === `/${m.key}` || pathname.startsWith(`/${m.key}/`));
}

function activePage(pathname: string, mode: NavMode | undefined) {
  // Longest matching href wins, so /analyze/contacts beats /analyze.
  return mode?.pages.filter((p) => pathname === p.href || pathname.startsWith(`${p.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
}

function Lock() {
  return (
    <svg className={s.lock} viewBox="0 0 9 11" aria-hidden="true">
      <rect x="0.5" y="4.5" width="8" height="6" fill="none" stroke="currentColor" />
      <path d="M2 4.5V3a2.5 2.5 0 0 1 5 0v1.5" fill="none" stroke="currentColor" />
    </svg>
  );
}

export function ModeTabs({ modes }: { modes: NavMode[] }) {
  const pathname = usePathname();
  const current = activeMode(pathname, modes);
  return (
    <nav className={s.modes} aria-label="Modes">
      {modes.map((m) => (
        <Link key={m.key} href={`/${m.key}`} className={s.modeTab} aria-current={current?.key === m.key ? "page" : undefined}>
          {m.label}
          {m.locked && <Lock />}
          {m.locked && <span className="visually-hidden">(locked)</span>}
        </Link>
      ))}
    </nav>
  );
}

export function UtilityLinks() {
  const pathname = usePathname();
  return (
    <>
      <Link href="/updates" className={s.utilLink} aria-current={pathname.startsWith("/updates") ? "page" : undefined}>
        Updates
      </Link>
      <Link href="/settings" className={s.utilLink} aria-current={pathname.startsWith("/settings") ? "page" : undefined}>
        Settings
      </Link>
    </>
  );
}

export function SideNav({ modes }: { modes: NavMode[] }) {
  const pathname = usePathname();
  const mode = activeMode(pathname, modes);
  const page = activePage(pathname, mode);
  if (!mode) return null;
  return (
    <nav aria-label={`${mode.label} pages`}>
      {mode.pages.map((p) => (
        <Link key={p.href} href={p.href} className={s.railLink} aria-current={page?.href === p.href ? "page" : undefined}>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

export function Dock({ modes, signOut }: { modes: NavMode[]; signOut: () => Promise<void> }) {
  const pathname = usePathname();
  const mode = activeMode(pathname, modes);
  const page = activePage(pathname, mode);
  const sheet = useRef<HTMLDialogElement>(null);
  const close = () => sheet.current?.close();

  return (
    <>
      <nav className={s.dock} aria-label="Modes">
        {modes.map((m) => (
          <Link key={m.key} href={`/${m.key}`} className={s.dockItem} aria-current={mode?.key === m.key ? "page" : undefined}>
            <span className={s.dot} aria-hidden="true" />
            {m.label}
          </Link>
        ))}
        {Array.from({ length: Math.max(0, 3 - modes.length) }, (_, i) => (
          <span key={`gap-${i}`} aria-hidden="true" />
        ))}
        <button type="button" className={s.dockItem} onClick={() => sheet.current?.showModal()} aria-haspopup="dialog">
          <span className={s.dot} aria-hidden="true" />
          Menu
        </button>
      </nav>

      <dialog ref={sheet} className={s.sheet} aria-label="Menu" onClick={(e) => e.target === sheet.current && close()}>
        <div className={s.sheetHead}>
          <span className="label">{mode ? mode.label : "Menu"}</span>
          <button type="button" className="btn" onClick={close}>
            Close
          </button>
        </div>
        {mode?.pages.map((p) => (
          <Link key={p.href} href={p.href} className={s.sheetLink} onClick={close} aria-current={page?.href === p.href ? "page" : undefined}>
            {p.label}
          </Link>
        ))}
        <Link href="/updates" className={s.sheetLink} onClick={close} aria-current={pathname.startsWith("/updates") ? "page" : undefined}>
          Updates
        </Link>
        <Link href="/settings" className={s.sheetLink} onClick={close} aria-current={pathname.startsWith("/settings") ? "page" : undefined}>
          Settings
        </Link>
        <form action={signOut}>
          <button type="submit" className={`${s.sheetLink} ${s.menuButton}`}>
            Sign out
          </button>
        </form>
      </dialog>
    </>
  );
}

/** Remembers the mode in use, so "/" and the next sign-in open it. Only real visits count, not prefetches. */
export function ModeMemory() {
  const pathname = usePathname();
  const mode = pathname.split("/")[1];
  useEffect(() => {
    if (mode === "analyze" || mode === "marketing" || mode === "sales") {
      document.cookie = `${MODE_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`;
    }
  }, [mode]);
  return null;
}
