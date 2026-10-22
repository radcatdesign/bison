import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { BRAND } from "@/config/brand";
import { clerkConfigured } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: BRAND.productName, template: `%s · ${BRAND.productName}` },
  description: "Measure every visitor, work every lead, and sell from your own site.",
  applicationName: BRAND.productName,
  appleWebApp: { capable: true, title: BRAND.shortName, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: BRAND.themeColor,
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const body = (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
  return clerkConfigured() ? <ClerkProvider>{body}</ClerkProvider> : body;
}
