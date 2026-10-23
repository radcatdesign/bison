import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { accentInk } from "@/lib/color";
import { demoMode } from "@/lib/env";
import { getPublishedPage } from "@/lib/pages/repo";

// The social card for a published page: what shows when someone shares the
// link. Made from the page itself, in its own color.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Preview of this page";

export default async function Image({ params }: { params: Promise<{ tenant: string; slug: string }> }) {
  await connection();
  const { tenant, slug } = await params;
  const page = demoMode() ? null : await getPublishedPage(tenant, slug);
  const hero = page?.doc.sections.find((s) => s.type === "hero");
  const headline = (page?.doc.seo.title || (hero?.type === "hero" ? hero.headline : "") || page?.brand || "Page not found").replace(/\[Add [^\]]{1,200}\]/g, "").slice(0, 110);
  const accent = page?.doc.theme.accent ?? "#3b5bff";
  const dark = page?.doc.theme.mode === "dark";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: dark ? "#0d0f14" : "#f7f7f5", color: dark ? "#f5f5f3" : "#14161a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 700 }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: accent }} />
          {page?.brand ?? ""}
        </div>
        <div style={{ display: "flex", fontSize: headline.length > 60 ? 64 : 80, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>{headline}</div>
        <div style={{ display: "flex", alignSelf: "flex-start", padding: "16px 28px", borderRadius: 999, background: accent, color: accentInk(accent), fontSize: 28, fontWeight: 700 }}>
          {hero?.type === "hero" && hero.primary ? hero.primary.label.slice(0, 40) : "Take a look"}
        </div>
      </div>
    ),
    size,
  );
}
