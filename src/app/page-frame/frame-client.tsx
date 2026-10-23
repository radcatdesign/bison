"use client";

import { useEffect, useState } from "react";
import { LandingPage } from "@/components/landing/landing-page";
import { type PageDoc, pageDocSchema } from "@/lib/pages/schema";

type Shown = { doc: PageDoc; brand: string; selectedId: string | null };

/** Messages between the editor and this frame. Both sides check who sent them. */
export type ToFrame = { type: "bo-page"; doc: unknown; brand: string; selectedId: string | null; scrollTo?: string | null };
export type FromFrame = { type: "bo-frame-ready" } | { type: "bo-frame-boot" } | { type: "bo-frame-error"; message: string } | { type: "bo-select"; id: string };

export function FrameClient() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const post = (msg: FromFrame) => window.parent.postMessage(msg, "*");

    const onMessage = (e: MessageEvent) => {
      // Only the editor that framed this page, on this app's own address.
      if (e.source !== window.parent || e.origin !== window.location.origin) return;
      const data = e.data as Partial<ToFrame> | null;
      if (data?.type !== "bo-page") return;
      const parsed = pageDocSchema.safeParse(data.doc);
      if (!parsed.success) return;
      setShown({ doc: parsed.data, brand: String(data.brand ?? "").slice(0, 80), selectedId: typeof data.selectedId === "string" ? data.selectedId : null });
      if (data.scrollTo) {
        const id = data.scrollTo;
        requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    };

    // Links and buttons don't go anywhere in the editor. Clicking a section selects it.
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("a, button")) e.preventDefault();
      const section = target.closest<HTMLElement>("[data-section]");
      if (section?.dataset.section) post({ type: "bo-select", id: section.dataset.section });
    };
    const onSubmit = (e: Event) => e.preventDefault();

    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    post({ type: "bo-frame-ready" });
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  if (!shown) return null;
  return <LandingPage doc={shown.doc} brand={shown.brand} selectedId={shown.selectedId} builder />;
}
