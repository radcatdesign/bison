"use client";

import {
  AppWindow,
  ChevronRight,
  BadgePercent,
  Boxes,
  ClipboardList,
  Package,
  ShoppingCart,
  Tag,
  Truck,
  UserRoundCheck,
  ListChecks,
  Mail,
  Palette,
  Repeat,
  ScanSearch,
  Users,
  ChartLine,
  FolderOpen,
  Inbox,
  TabletSmartphone,
  Trophy,
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
  SquareArrowOutUpRight,
  SquareSplitHorizontal,
  Sun,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useSyncExternalStore } from "react";
import { BRAND, THEME_STORAGE_KEY } from "@/config/brand";
import { MODE_COOKIE, type ModeKey } from "@/config/modes";
import s from "./shell.module.css";

export type NavPage = { href: string; label: string; group?: { key: string; label: string } };
export type NavMode = { key: ModeKey; label: string; locked: boolean; pages: NavPage[] };

/** A mode's pages as the nav shows them: loose pages, and categories that open to show theirs. Order follows the config. */
type NavItem = { kind: "page"; page: NavPage } | { kind: "group"; key: string; label: string; pages: NavPage[] };
function navItems(pages: NavPage[]): NavItem[] {
  const out: NavItem[] = [];
  for (const p of pages) {
    if (!p.group) {
      out.push({ kind: "page", page: p });
      continue;
    }
    const g = out.find((i): i is Extract<NavItem, { kind: "group" }> => i.kind === "group" && i.key === p.group!.key);
    if (g) g.pages.push(p);
    else out.push({ kind: "group", key: p.group.key, label: p.group.label, pages: [p] });
  }
  return out;
}

const OPEN_KEY = "bo-nav-open";
const openListeners = new Set<() => void>();
function readOpen(): string {
  try {
    return localStorage.getItem(OPEN_KEY) ?? "";
  } catch {
    return "";
  }
}
function toggleOpen(key: string, open: boolean) {
  const set = new Set(readOpen().split(",").filter(Boolean));
  if (open) set.add(key);
  else set.delete(key);
  try {
    localStorage.setItem(OPEN_KEY, [...set].join(","));
  } catch {
    // Storage can be off; the group still opens for this visit.
  }
  openListeners.forEach((l) => l());
}
/** Which categories the person opened, remembered in this browser. */
function useOpenGroups(): Set<string> {
  const raw = useSyncExternalStore(
    (cb) => {
      openListeners.add(cb);
      return () => openListeners.delete(cb);
    },
    readOpen,
    () => "",
  );
  return new Set(raw.split(",").filter(Boolean));
}

/** One category: a button that opens and closes it, and its pages, indented. The one holding the current page is always open. */
function NavCategory({ modeKey, item, currentHref, onNavigate }: { modeKey: string; item: Extract<NavItem, { kind: "group" }>; currentHref?: string; onNavigate?: () => void }) {
  const opened = useOpenGroups();
  const id = `${modeKey}:${item.key}`;
  const holdsCurrent = item.pages.some((p) => p.href === currentHref);
  const open = holdsCurrent || opened.has(id);
  const listId = `nav-${modeKey}-${item.key}`;
  return (
    <div className={s.navCategory} data-open={open || undefined}>
      <button type="button" className={s.navCategoryButton} aria-expanded={open} aria-controls={listId} onClick={() => !holdsCurrent && toggleOpen(id, !open)} data-testid={`nav-group-${item.key}`}>
        <ChevronRight className={s.navChevron} aria-hidden="true" />
        <span>{item.label}</span>
        {!open && <span className={s.navCount}>{item.pages.length}</span>}
      </button>
      <div id={listId} className={s.navSub} hidden={!open}>
        {item.pages.map((p) => (
          <NavLink key={p.href} href={p.href} icon={PAGE_ICONS[p.href] ?? LayoutGrid} current={currentHref === p.href} onClick={onNavigate}>
            {p.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function NavList({ mode, currentHref, onNavigate }: { mode: NavMode; currentHref?: string; onNavigate?: () => void }) {
  return (
    <>
      {navItems(mode.pages).map((item) =>
        item.kind === "page" ? (
          <NavLink key={item.page.href} href={item.page.href} icon={PAGE_ICONS[item.page.href] ?? LayoutGrid} current={currentHref === item.page.href} onClick={onNavigate}>
            {item.page.label}
          </NavLink>
        ) : (
          <NavCategory key={item.key} modeKey={mode.key} item={item} currentHref={currentHref} onNavigate={onNavigate} />
        ),
      )}
    </>
  );
}

const MODE_ICONS: Record<ModeKey, LucideIcon> = { analyze: ChartLine, marketing: Megaphone, sales: ShoppingBag };
const PAGE_ICONS: Record<string, LucideIcon> = {
  "/analyze": LayoutGrid,
  "/analyze/pages": PanelsTopLeft,
  "/analyze/contacts": Inbox,
  "/analyze/front-desk": TabletSmartphone,
  "/marketing/campaigns": FolderOpen,
  "/marketing": Megaphone,
  "/marketing/setup": ListChecks,
  "/marketing/newsletters": Mail,
  "/marketing/series": Repeat,
  "/marketing/subscribers": Users,
  "/marketing/pages": AppWindow,
  "/marketing/tests": SquareSplitHorizontal,
  "/marketing/brand": Palette,
  "/marketing/offer": BadgePercent,
  "/marketing/search": ScanSearch,
  "/sales": Receipt,
  "/sales/setup": ListChecks,
  "/sales/estimates": ClipboardList,
  "/sales/orders": Package,
  "/sales/products": Boxes,
  "/sales/discounts": Tag,
  "/sales/trade": UserRoundCheck,
  "/sales/carts": ShoppingCart,
  "/sales/checkout": Truck,
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
      <NavList mode={mode} currentHref={page?.href} />
    </nav>
  );
}

export type LevelInfo = { level: number; into: number; perLevel: number };

/** The company's level and how far into it they are, linking to Progress. */
export function LevelChip({ info }: { info: LevelInfo }) {
  const pathname = usePathname();
  return (
    <Link href="/progress" className={s.levelChip} aria-current={pathname.startsWith("/progress") ? "page" : undefined} data-testid="level-chip">
      <Trophy className={s.levelIcon} aria-hidden="true" />
      <span className={s.levelText}>
        <span className={s.levelName}>Level {info.level}</span>
        <span className={s.levelBar} aria-hidden="true">
          <span style={{ width: `${(info.into / info.perLevel) * 100}%` }} />
        </span>
      </span>
      <span className={`num ${s.levelXp}`}>
        {info.into}/{info.perLevel} XP
      </span>
    </Link>
  );
}

export function GeneralNav({ onNavigate, kiosk = false, level }: { onNavigate?: () => void; kiosk?: boolean; level?: LevelInfo }) {
  const pathname = usePathname();
  return (
    <nav aria-label="General" className={s.navGroup}>
      {level && onNavigate && (
        <NavLink href="/progress" icon={Trophy} current={pathname.startsWith("/progress")} onClick={onNavigate}>
          Progress, level {level.level}
        </NavLink>
      )}
      {kiosk && (
        // The kiosk runs full screen on its own, so it opens in a new tab.
        <a href="/kiosk/preview" target="_blank" rel="noopener" className={s.navLink} data-testid="nav-kiosk">
          <TabletSmartphone className={s.navIcon} aria-hidden="true" />
          Open the kiosk
          <SquareArrowOutUpRight className={s.navExternal} aria-hidden="true" />
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      )}
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

export function Dock({ modes, signOut, kiosk = false, level }: { modes: NavMode[]; signOut: () => Promise<void>; kiosk?: boolean; level?: LevelInfo }) {
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
            <NavList mode={mode} currentHref={page?.href} onNavigate={close} />
          </div>
        )}
        <GeneralNav onNavigate={close} kiosk={kiosk} level={level} />
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
