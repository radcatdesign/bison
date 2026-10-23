"use client";

import {
  AppWindow,
  BadgePercent,
  ListChecks,
  Mail,
  Palette,
  Repeat,
  ScanSearch,
  Users,
  ChartLine,
  Inbox,
  LayoutGrid,
  Lock,
  type LucideIcon,
  Megaphone,
  Menu,
  Monitor,
  Moon,
  PanelsTopLeft,
  Receipt,
  Settings,
  ShoppingBag,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useSyncExternalStore } from "react";
import { BRAND, THEME_STORAGE_KEY } from "@/config/brand";
import { MODE_COOKIE, type ModeKey } from "@/config/modes";
import s from "./shell.module.css";

export type NavMode = { key: ModeKey; label: string; locked: boolean; pages: { href: string; label: string }[] };

const MODE_ICONS: Record<ModeKey, LucideIcon> = { analyze: ChartLine, marketing: Megaphone, sales: ShoppingBag };
const PAGE_ICONS: Record<string, LucideIcon> = {
  "/analyze": LayoutGrid,
  "/analyze/pages": PanelsTopLeft,
  "/analyze/contacts": Inbox,
  "/marketing": Megaphone,
  "/marketing/setup": ListChecks,
  "/marketing/newsletters": Mail,
  "/marketing/series": Repeat,
  "/marketing/subscribers": Users,
  "/marketing/pages": AppWindow,
  "/marketing/brand": Palette,
  "/marketing/offer": BadgePercent,
  "/marketing/search": ScanSearch,
  "/sales": Receipt,
};

function activeMode(pathname: string, modes: NavMode[]): NavMode | undefined {
  return modes.find((m) => pathname === `/${m.key}` || pathname.startsWith(`/${m.key}/`));
}

function activePage(pathname: string, mode: NavMode | undefined) {
  // Longest matching href wins, so /analyze/contacts beats /analyze.
  return mode?.pages.filter((p) => pathname === p.href || pathname.startsWith(`${p.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
}

/** The three modes as one segmented control. */
export function ModeSwitch({ modes }: { modes: NavMode[] }) {
  const pathname = usePathname();
  const current = activeMode(pathname, modes);
  return (
    <nav className={s.modeSwitch} aria-label="Modes" style={{ gridTemplateColumns: `repeat(${modes.length}, 1fr)` }}>
      {modes.map((m) => (
        <Link key={m.key} href={`/${m.key}`} className={s.modeItem} aria-current={current?.key === m.key ? "page" : undefined}>
          {m.label}
          {m.locked && <Lock className={s.lock} aria-hidden="true" />}
          {m.locked && <span className="visually-hidden">(locked)</span>}
        </Link>
      ))}
    </nav>
  );
}

function NavLink({ href, icon: Icon, current, children, onClick }: { href: string; icon: LucideIcon; current: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <Link href={href} className={s.navLink} aria-current={current ? "page" : undefined} onClick={onClick}>
      <Icon className={s.navIcon} aria-hidden="true" />
      {children}
    </Link>
  );
}

export function SideNav({ modes }: { modes: NavMode[] }) {
  const pathname = usePathname();
  const mode = activeMode(pathname, modes);
  const page = activePage(pathname, mode);
  if (!mode) return null;
  return (
    <nav aria-label={`${mode.label} pages`} className={s.navGroup}>
      <span className={s.navHeading}>{mode.label}</span>
      {mode.pages.map((p) => (
        <NavLink key={p.href} href={p.href} icon={PAGE_ICONS[p.href] ?? LayoutGrid} current={page?.href === p.href}>
          {p.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function GeneralNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="General" className={s.navGroup}>
      <NavLink href="/updates" icon={Sparkles} current={pathname.startsWith("/updates")} onClick={onNavigate}>
        Updates
      </NavLink>
      <NavLink href="/settings" icon={Settings} current={pathname.startsWith("/settings")} onClick={onNavigate}>
        Settings
      </NavLink>
    </nav>
  );
}

// ── Theme ────────────────────────────────────────────────────────────────────

type ThemeChoice = "system" | "light" | "dark";
const listeners = new Set<() => void>();

function readTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function setTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private windows can refuse storage; the choice still applies to this page.
  }
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  const dark = choice === "dark" || (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? BRAND.themeDark : BRAND.themeLight));
  listeners.forEach((l) => l());
}

const THEMES: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: "system", label: "Match my device", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemeSwitch() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readTheme,
    () => "system" as ThemeChoice,
  );
  return (
    <div className={s.themeSwitch} role="radiogroup" aria-label="Appearance">
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" role="radio" aria-checked={theme === value} aria-label={label} title={label} className={s.themeItem} onClick={() => setTheme(value)}>
          <Icon aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

// ── Phone dock and menu ──────────────────────────────────────────────────────

export function Dock({ modes, signOut }: { modes: NavMode[]; signOut: () => Promise<void> }) {
  const pathname = usePathname();
  const mode = activeMode(pathname, modes);
  const page = activePage(pathname, mode);
  const sheet = useRef<HTMLDialogElement>(null);
  const close = () => sheet.current?.close();

  return (
    <>
      <nav className={s.dock} aria-label="Modes" style={{ gridTemplateColumns: `repeat(${modes.length + 1}, 1fr)` }}>
        {modes.map((m) => {
          const Icon = MODE_ICONS[m.key];
          return (
            <Link key={m.key} href={`/${m.key}`} className={s.dockItem} aria-current={mode?.key === m.key ? "page" : undefined}>
              <Icon aria-hidden="true" />
              {m.label}
            </Link>
          );
        })}
        <button type="button" className={s.dockItem} onClick={() => sheet.current?.showModal()} aria-haspopup="dialog">
          <Menu aria-hidden="true" />
          Menu
        </button>
      </nav>

      <dialog ref={sheet} className={s.sheet} aria-label="Menu" onClick={(e) => e.target === sheet.current && close()}>
        <div className={s.sheetGrab} aria-hidden="true" />
        <div className={s.sheetHead}>
          <span className={s.navHeading}>{mode ? mode.label : "Menu"}</span>
          <button type="button" className={s.iconButton} onClick={close} aria-label="Close menu">
            <X aria-hidden="true" />
          </button>
        </div>
        {mode && (
          <div className={s.navGroup}>
            {mode.pages.map((p) => (
              <NavLink key={p.href} href={p.href} icon={PAGE_ICONS[p.href] ?? LayoutGrid} current={page?.href === p.href} onClick={close}>
                {p.label}
              </NavLink>
            ))}
          </div>
        )}
        <GeneralNav onNavigate={close} />
        <div className={s.sheetFoot}>
          <ThemeSwitch />
          <form action={signOut}>
            <button type="submit" className="btn">
              Sign out
            </button>
          </form>
        </div>
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
