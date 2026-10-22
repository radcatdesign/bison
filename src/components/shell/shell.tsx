import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { BRAND } from "@/config/brand";
import { MODES } from "@/config/modes";
import { ROLES, seesMode } from "@/config/roles";
import { can } from "@/lib/access/entitlements";
import { getPortalContext } from "@/lib/portal";
import { signOut } from "@/app/sign-in/actions";
import { Dock, ModeMemory, ModeTabs, type NavMode, SideNav, UtilityLinks } from "./nav";
import { PullToRefresh } from "./pull-to-refresh";
import s from "./shell.module.css";

function initials(name: string, email: string) {
  const parts = (name || email).split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export async function Shell({ children }: { children: ReactNode }) {
  const ctx = await getPortalContext();
  const modes: NavMode[] = MODES.filter((m) => seesMode(ctx.member.role, m.key)).map((m) => ({
    key: m.key,
    label: m.label,
    locked: !can(ctx.tenant, m.feature),
    pages: m.pages.map(({ href, label }) => ({ href, label })),
  }));

  return (
    <div className={s.app} style={{ "--bo-accent": ctx.settings.accent } as CSSProperties} data-sample={ctx.settings.sampleData || undefined}>
      <header className={s.header}>
        <ModeMemory />
        <Link href="/analyze" className={s.brand}>
          <span className={s.wordmark}>{BRAND.productName}</span>
          <span className={`label ${s.tenant}`} data-testid="tenant-name">
            {ctx.tenant.name}
          </span>
        </Link>
        <ModeTabs modes={modes} />
        <div className={s.utility}>
          <UtilityLinks />
          <button type="button" className={s.avatar} popoverTarget="account-menu" aria-label="Account">
            {initials(ctx.member.name, ctx.member.email)}
          </button>
          <div id="account-menu" popover="auto" className={s.accountMenu}>
            <div>
              <div>{ctx.member.name || ctx.member.email}</div>
              <div className="label">{ctx.member.email}</div>
            </div>
            <div className="label">
              {ROLES[ctx.member.role].label} at {ctx.tenant.name}
            </div>
            <form action={signOut} style={{ padding: 0 }}>
              <button type="submit" className={`${s.menuButton}`} style={{ padding: "12px 16px" }}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className={s.body}>
        <aside className={s.rail}>
          <SideNav modes={modes} />
          <div className={s.railFoot}>
            {ctx.settings.sampleData ? (
              <Link href="/settings#data" className="pill pill-lit" style={{ justifySelf: "start" }}>
                Sample data on
              </Link>
            ) : (
              <span className="label">{ctx.sites[0]?.domain}</span>
            )}
          </div>
        </aside>
        <main className={s.main} id="main">
          <PullToRefresh>
            <div className={s.content}>{children}</div>
          </PullToRefresh>
        </main>
      </div>

      <Dock modes={modes} signOut={signOut} />
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className={s.app} aria-busy="true">
      <header className={s.header}>
        <div className={s.brand}>
          <span className={s.wordmark}>{BRAND.productName}</span>
        </div>
      </header>
      <div className={s.body}>
        <aside className={s.rail} />
        <main className={s.main}>
          <div className={s.skeletonBar} />
        </main>
      </div>
    </div>
  );
}
