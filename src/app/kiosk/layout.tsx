import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

// The front desk kiosk runs on its own, without the dashboard around it, and
// installs to a tablet's home screen as its own full-screen app.
export const metadata: Metadata = {
  title: { absolute: "Front desk" },
  robots: { index: false, follow: false },
  icons: { icon: "/brand/fit-icon.svg", apple: "/brand/fit-apple-icon.png" },
  manifest: "/brand/kiosk.webmanifest",
  appleWebApp: { capable: true, title: "Front desk", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover" };

export default function KioskLayout({ children }: { children: ReactNode }) {
  return children;
}
