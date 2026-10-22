"use client";

// Pull down from the top of any page to refresh it. Works in the installed
// home-screen app, where the browser's own pull to refresh is gone.
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import s from "./shell.module.css";

const TRIGGER = 72;

export function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pull, setPull] = useState(0);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const d = e.touches[0].clientY - start.current;
      pullRef.current = d > 0 ? Math.min(d * 0.5, TRIGGER * 1.4) : 0;
      setPull(pullRef.current);
    };
    const onEnd = () => {
      if (pullRef.current >= TRIGGER) startTransition(() => router.refresh());
      start.current = null;
      pullRef.current = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const label = pending ? "Refreshing" : pull >= TRIGGER ? "Let go to refresh" : "Pull to refresh";
  return (
    <div className={s.pull} style={{ transform: pull ? `translateY(${pull}px)` : undefined }}>
      <div className={s.pullHint} data-on={pull > 8 || pending} aria-live="polite">
        <span className="label">{label}</span>
      </div>
      {children}
    </div>
  );
}
