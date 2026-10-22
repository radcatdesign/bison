import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon: black square, white mark, one point of light.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ position: "absolute", inset: 30, border: "2px solid #fff" }} />
        <div style={{ color: "#fff", fontSize: 92, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>B</div>
        <div style={{ position: "absolute", top: 40, right: 40, width: 14, height: 14, borderRadius: 7, background: "#7df9ff", boxShadow: "0 0 18px #7df9ff" }} />
      </div>
    ),
    size,
  );
}
