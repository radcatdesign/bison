import { LogOut } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { MODES, NAV_GROUPS } from "@/config/modes";
import { ROLES, seesMode } from "@/config/roles";
import { signOut } from "@/app/sign-in/actions";
import { can } from "@/lib/access/entitlements";
import { accentInk } from "@/lib/color";
import { editionOf } from "@/lib/edition";
import { getPortalContext } from "@/lib/portal";
import { EditionProvider } from "../edition";
import { Dock, GeneralNav, ModeMemory, ModeSwitch, type NavMode, SideNav, ThemeSwitch } from "./nav";
import { PullToRefresh } from "./pull-to-refresh";
import { Mark } from "../mark";
import s from "./shell.module.css";

function initials(name: string, email: string) {
  const parts = (name || email).split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export async function Shell({ children }: { children: ReactNode }) {
  const ctx = await getPortalContext();
  const edition = editionOf(ctx);
  const modes: NavMode[] = MODES.filter((m) => seesMode(ctx.member.role, m.key)).map((m) => ({
    key: m.key,
    label: m.label,
    locked: !can(ctx.tenant, m.feature),
    pages: m.pages.filter((p) => !p.editions || p.editions.includes(edition.key)).map(({ href, label, group }) => ({ href, label: edition.pageLabels[href] ?? label, group: group ? { key: group, label: edition.groupLabels[group] ?? NAV_GROUPS[group] } : undefined })),
  }));
  const who = initials(ctx.member.name, ctx.member.email);
  const theme = { "--bo-accent": ctx.settings.accent, "--bo-accent-ink": accentInk(ctx.settings.accent) } as CSSProperties;

  return (
    <div className={s.app} style={theme} data-edition={edition.key} data-accent="">
      <ModeMemory />

      <aside className={s.sidebar}>
        <Link href="/analyze" className={s.org}>
          <Mark edition={edition.key} />
          <span className={s.orgText}>
            <span className={s.orgName} data-testid="tenant-name">
              {ctx.tenant.name}
            </span>
            <span className={s.orgSub}>{ctx.sites[0]?.domain ?? edition.productName}</span>
          </span>
        </Link>

        <ModeSwitch modes={modes} />
        <SideNav modes={modes} />

        <div className={s.sidebarFoot}>
          <GeneralNav kiosk={edition.key === "fit"} />
          {ctx.settings.sampleData && (
            <Link href="/settings#data" className={s.sampleChip}>
              <span className="dot" aria-hidden="true" />
              Sample data
            </Link>
          )}
          <ThemeSwitch />
          <button type="button" className={s.account} popoverTarget="account-menu">
            <span className={s.avatar} aria-hidden="true">
              {who}
            </span>
            <span className={s.accountText}>
              <span className={s.accountName}>{ctx.member.name || ctx.member.email}</span>
              <span className={s.accountRole}>{ROLES[ctx.member.role].label}</span>
            </span>
            <span className="visually-hidden">Account</span>
          </button>
        </div>
      </aside>

      <header className={s.topbar}>
        <Link href="/analyze" className={s.topbarOrg}>
          <Mark size={26} edition={edition.key} />
          <span className={s.orgName}>{ctx.tenant.name}</span>
        </Link>
        <button type="button" className={s.avatarButton} popoverTarget="account-menu" aria-label="Account">
          <span className={s.avatar}>{who}</span>
        </button>
      </header>

      <div id="account-menu" popover="auto" className={s.accountMenu}>
        <div className={s.menuWho}>
          <span className={s.avatar} aria-hidden="true">
            {who}
          </span>
          <span className={s.accountText}>
            <span className={s.accountName}>{ctx.member.name || ctx.member.email}</span>
            <span className={s.accountRole}>{ctx.member.email}</span>
          </span>
        </div>
        <p className={s.menuNote}>
          {ROLES[ctx.member.role].label} at {ctx.tenant.name}
        </p>
        <form action={signOut}>
          <button type="submit" className={s.menuItem}>
            <LogOut aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>

      <main className={s.main} id="main">
        <PullToRefresh>
          <EditionProvider edition={edition.key}>
            <div className={s.content}>{children}</div>
          </EditionProvider>
        </PullToRefresh>
      </main>

      <Dock modes={modes} signOut={signOut} kiosk={edition.key === "fit"} />
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className={s.app} aria-busy="true">
      <aside className={s.sidebar}>
        <div className={s.org}>
          <Mark />
          <span className={s.skeletonLine} />
        </div>
        <span className={s.skeletonBlock} />
      </aside>
      <header className={s.topbar}>
        <Mark size={26} />
      </header>
      <main className={s.main}>
        <div className={s.content}>
          <span className={s.skeletonTitle} />
        </div>
      </main>
    </div>
  );
}
