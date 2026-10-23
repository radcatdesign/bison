"use client";

// The live preview. The page renders inside a sandboxed frame at a real device
// width, scaled to fit, and updates as the page changes. Clicking a section in
// the preview selects it for editing.
import { useEffect, useRef, useState } from "react";
import type { FromFrame, ToFrame } from "@/app/page-frame/frame-client";
import { DEVICES, type Device } from "@/components/page-preview";
import type { PageDoc } from "@/lib/pages/schema";
import s from "./builder.module.css";

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A hidden preview (the phone's other tabs) measures zero. Keep the last size
    // so the frame stays loaded and shows up instantly when its tab comes back.
    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

type Props = {
  doc: PageDoc;
  brand: string;
  device?: Device;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Change the nonce to scroll the preview to a section again. */
  scrollTo?: { id: string; nonce: number } | null;
  /** A small, non-interactive card preview. */
  thumb?: boolean;
  title?: string;
};

export function Canvas({ doc, brand, device = "desktop", selectedId = null, onSelect, scrollTo, thumb, title = "Page preview" }: Props) {
  const [stageRef, size] = useSize<HTMLDivElement>();
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Counts "ready" messages, so a frame that reloads gets the page again.
  const [ready, setReady] = useState(0);
  const lastScroll = useRef<number | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const data = e.data as FromFrame | null;
      if (data?.type === "bo-frame-ready") setReady((n) => n + 1);
      if (data?.type === "bo-select" && typeof data.id === "string") onSelectRef.current?.(data.id);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const scroll = scrollTo && scrollTo.nonce !== lastScroll.current ? scrollTo.id : null;
    if (scrollTo) lastScroll.current = scrollTo.nonce;
    const msg: ToFrame = { type: "bo-page", doc, brand, selectedId, scrollTo: scroll };
    frameRef.current?.contentWindow?.postMessage(msg, "*");
  }, [ready, doc, brand, selectedId, scrollTo]);

  const d = DEVICES[device];
  const scale = size.width ? Math.min(1, (size.width - (device === "desktop" || thumb ? 0 : 40)) / d.width) : 0;
  // Fill the space top to bottom: a taller frame shows more of the page at once.
  const frameHeight = thumb ? (size.width * 10) / 16 / (scale || 1) : scale ? Math.max(d.height * 0.5, (size.height - (device === "desktop" ? 0 : 36)) / scale) : d.height;

  return (
    <div ref={stageRef} className={thumb ? s.thumbStage : s.stage} data-device={thumb ? undefined : device}>
      {scale > 0 && (
        <div className={s.device} data-device={thumb ? "thumb" : device} data-ready={ready > 0 || undefined} style={{ width: d.width * scale, height: frameHeight * scale }}>
          {ready === 0 && <div className={s.frameLoading} aria-hidden="true" />}
          <iframe
            ref={frameRef}
            src="/page-frame"
            title={title}
            width={d.width}
            height={frameHeight}
            sandbox="allow-scripts"
            tabIndex={thumb ? -1 : 0}
            aria-hidden={thumb || undefined}
            style={{ transform: `scale(${scale})`, pointerEvents: thumb ? "none" : "auto" }}
            data-testid={thumb ? undefined : "builder-frame"}
          />
        </div>
      )}
    </div>
  );
}
