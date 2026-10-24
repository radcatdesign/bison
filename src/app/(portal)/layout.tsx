import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import { Shell, ShellSkeleton } from "@/components/shell/shell";
import { editionOf } from "@/lib/edition";
import { getPortalContext } from "@/lib/portal";

// Tab titles, the app icon and the install manifest follow the company's edition.
export async function generateMetadata(): Promise<Metadata> {
  const edition = editionOf(await getPortalContext());
  if (edition.key === "bison") return {};
  return {
    title: { default: edition.productName, template: `%s · ${edition.productName}` },
    applicationName: edition.productName,
    appleWebApp: { capable: true, title: edition.shortName, statusBarStyle: "default" },
    icons: { icon: "/brand/fit-icon.svg", apple: "/brand/fit-apple-icon.png" },
    manifest: "/brand/fit.webmanifest",
  };
}

// The frame paints first; everything that reads the session streams in behind it.
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
