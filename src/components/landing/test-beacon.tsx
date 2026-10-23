"use client";

// On a landing page in an A/B test that counts button clicks: tells the server
// once per visit that this visitor clicked a button, and which version they saw.
// Uses sendBeacon, so leaving the page right after the click doesn't lose it.
import { useEffect } from "react";

export function TestBeacon({ endpoint, version }: { endpoint: string; version: string }) {
  useEffect(() => {
    let sent = false;
    const onClick = (e: MouseEvent) => {
      if (sent) return;
      const target = e.target instanceof Element ? e.target.closest("[data-cta], button[type='submit']") : null;
      if (!target) return;
      sent = true;
      const body = JSON.stringify({ version });
      if (!(typeof navigator.sendBeacon === "function" && navigator.sendBeacon(endpoint, body))) {
        void fetch(endpoint, { method: "POST", body, keepalive: true }).catch(() => undefined);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [endpoint, version]);
  return null;
}
