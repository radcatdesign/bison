// Runs before every page. It only answers "signed in at all?" and sends "/" to
// the last mode used (remembered by the shell in a cookie). Tenant, role and entitlement checks happen in the data access layer
// (lib/portal.ts), never here.
import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { MODE_COOKIE, modeForPath } from "@/config/modes";
import { DEV_SESSION_COOKIE } from "@/lib/auth/dev-session";
import { clerkConfigured } from "@/lib/env";

// "/p" is published landing pages and "/page-frame" the editor's empty preview frame. Neither reads a session.
const PUBLIC_PREFIXES = ["/sign-in", "/sign-up", "/sign-out", "/api/webhooks", "/api/health", "/api/cron", "/p", "/page-frame", "/manifest.webmanifest", "/icon", "/apple-icon"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}.`) || pathname.startsWith(`${p}?`));
}

function finish(req: NextRequest): NextResponse {
  // "/" opens the mode used last. Only for full page loads; router requests
  // for "/" fall through to app/page.tsx.
  if (req.nextUrl.pathname === "/" && req.headers.get("rsc") !== "1") {
    const last = modeForPath(`/${req.cookies.get(MODE_COOKIE)?.value ?? ""}`) ?? "analyze";
    return NextResponse.redirect(new URL(`/${last}`, req.url));
  }
  return NextResponse.next();
}

const withClerk = clerkMiddleware(async (auth, req) => {
  if (!isPublic(req.nextUrl.pathname)) await auth.protect();
  return finish(req);
});

function withDevAuth(req: NextRequest): NextResponse {
  if (!isPublic(req.nextUrl.pathname) && !req.cookies.get(DEV_SESSION_COOKIE)) {
    const url = new URL("/sign-in", req.url);
    return NextResponse.redirect(url);
  }
  return finish(req);
}

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  return clerkConfigured() ? withClerk(req, event) : withDevAuth(req);
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt|xml)$).*)",
  ],
};
