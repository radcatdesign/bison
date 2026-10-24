import { ImageResponse } from "next/og";
import { BISON_PATHS, BISON_TAIL } from "@/components/mark";

// Home-screen icon for Bison Ops: the bison on the dark tile. Fit Funnels' is a
// static file in public/brand. Linked from the root layout's metadata, so a
// Fit Funnels company's pages can point at their own.
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#0b0d10", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="118" height="87" viewBox="0 0 49 36" fill="#F5F5F3">
          <path d={BISON_TAIL} stroke="#F5F5F3" strokeWidth="0.595" />
          {BISON_PATHS.map((d) => (
            <path key={d.slice(0, 12)} d={d} />
          ))}
        </svg>
      </div>
    ),
    { width: 180, height: 180, headers: { "cache-control": "public, max-age=86400" } },
  );
}
