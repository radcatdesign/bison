import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon: the B mark with one point of the accent.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#0b0d10", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ color: "#fff", fontSize: 104, fontWeight: 800, letterSpacing: -6, lineHeight: 1 }}>B</div>
        <div style={{ position: "absolute", top: 34, right: 34, width: 22, height: 22, borderRadius: 11, background: "#3b5bff" }} />
      </div>
    ),
    size,
  );
}
