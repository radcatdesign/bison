"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-reads the page every few seconds while something is still happening, like a newsletter going out. */
export function RefreshWhile({ active, every = 4000 }: { active: boolean; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => router.refresh(), every);
    return () => window.clearInterval(t);
  }, [active, every, router]);
  return null;
}
