import "server-only";
// The kiosk preview in the public demo, where there's no database: the club's
// default kiosk, its made-up memberships to join, and a finished waiver.
import { can } from "@/lib/access/entitlements";
import { appUrl } from "@/lib/env";
import type { PortalContext } from "@/lib/portal";
import { formatMoney } from "@/lib/sales/money";
import { demoItems } from "@/lib/sales/shop-demo";
import { qrFor } from "./qr";
import { DEFAULT_CONFIG, starterWaiver, TOUR_TIMES, welcomeLine } from "./settings";
import type { KioskView } from "./store";

/** The starter waiver with the club's details filled in, as a club would have it. */
export function demoWaiver(club: string) {
  const w = starterWaiver(club);
  const body = w.body
    .replace("[Add your club's legal name]", `${club} LLC`)
    .split("\n\n")
    .filter((p) => !p.startsWith("[Add"))
    .join("\n\n");
  return { title: w.title, body, version: 1 };
}

export function demoKioskView(ctx: PortalContext): KioskView {
  const club = ctx.tenant.name;
  const c = DEFAULT_CONFIG;
  const join = can(ctx.tenant, "sales.checkout")
    ? demoItems({ tenantId: ctx.tenant.id })
        .filter((p) => p.variants.every((v) => v.priceCents > 0) && ["Memberships", "Class packs", "Passes", "Intro"].includes(p.category))
        .slice(0, 4)
        .map((p) => {
          const url = `${appUrl()}/p/${ctx.tenant.slug}/shop/${p.slug}?from=kiosk`;
          return { id: p.slug, name: p.name, price: p.minCents === p.maxCents ? formatMoney(p.minCents) : `From ${formatMoney(p.minCents)}`, description: p.description.split("\n")[0] ?? "", url, qr: qrFor(url) };
        })
    : null;
  return {
    club,
    accent: ctx.settings.accent,
    logo: null,
    welcome: welcomeLine(c, club),
    idleSeconds: c.idleSeconds,
    pass: { label: c.pass.label },
    tour: { times: [...TOUR_TIMES] },
    join: join?.length ? join : null,
    checkIn: true,
    waiver: demoWaiver(club),
    emailOptIn: can(ctx.tenant, "marketing.subscribers"),
    deviceName: "Preview",
  };
}
