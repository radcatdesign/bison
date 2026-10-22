import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { BRAND, THEME_STORAGE_KEY } from "@/config/brand";
import { clerkConfigured } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: BRAND.productName, template: `%s · ${BRAND.productName}` },
  description: "Measure every visitor, work every lead, and sell from your own site.",
  applicationName: BRAND.productName,
  appleWebApp: { capable: true, title: BRAND.shortName, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND.themeLight },
    { media: "(prefers-color-scheme: dark)", color: BRAND.themeDark },
  ],
  colorScheme: "light dark",
};

// Applies a saved light or dark choice before the first paint, so there's no flash.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute("content",t==="dark"?${JSON.stringify(BRAND.themeDark)}:${JSON.stringify(BRAND.themeLight)})}}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  const body = (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
  return clerkConfigured() ? <ClerkProvider>{body}</ClerkProvider> : body;
}
