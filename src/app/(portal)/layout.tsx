import { type ReactNode, Suspense } from "react";
import { Shell, ShellSkeleton } from "@/components/shell/shell";

// The frame paints first; everything that reads the session streams in behind it.
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
