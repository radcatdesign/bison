"use client";

// The live preview. The page renders inside a frame at a real device width,
// scaled to fit, so its layout responds to that width exactly as it will live.
//
// No script ever runs inside the frame: it's a blank document (srcdoc, sandboxed
// without scripts) that the editor fills by rendering the page into it from here,
// with the dashboard's own stylesheets copied in. Page content is plain text
// rendered by React and links are checked by the schema.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LandingPage } from "@/components/landing/landing-page";
import { DEVICES, type Device } from "@/components/page-preview";
import type { PageDoc } from "@/lib/pages/schema";
import s from "./builder.module.css";

const SHELL = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><div id="root"></div></body></html>';

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A hidden preview (the phone's other tabs) measures zero. Keep the last size
    // so the frame stays put and shows up instantly when its tab comes back.
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
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  // When the blank frame is ready, give it the dashboard's styles and a place to render.
  const attach = () => {
    const d = frameRef.current?.contentDocument;
    const root = d?.getElementById("root");
    if (!d || !root || d.head.dataset.ready) return;
    d.head.dataset.ready = "1";
    for (const el of document.querySelectorAll('link[rel="stylesheet"], style')) d.head.appendChild(el.cloneNode(true));
    setMount(root);
  };

  // Clicking selects a section. Links, buttons and forms do nothing in the editor.
  useEffect(() => {
    if (!mount || thumb) return;
    const d = mount.ownerDocument;
    const onClick = (e: Event) => {
      const target = e.target as Element | null;
      if (!target?.closest) return;
      if (target.closest("a, button")) e.preventDefault();
      const section = target.closest<HTMLElement>("[data-section]");
      if (section?.dataset.section) onSelectRef.current?.(section.dataset.section);
    };
    const onSubmit = (e: Event) => e.preventDefault();
    d.addEventListener("click", onClick, true);
    d.addEventListener("submit", onSubmit, true);
    return () => {
      d.removeEventListener("click", onClick, true);
      d.removeEventListener("submit", onSubmit, true);
    };
  }, [mount, thumb]);

  // Scroll once per request, not on every page change.
  const scrollId = scrollTo?.id;
  const scrollNonce = scrollTo?.nonce;
  useEffect(() => {
    if (!mount || !scrollId) return;
    const el = mount.ownerDocument.getElementById(scrollId);
    requestAnimationFrame(() => el?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [mount, scrollId, scrollNonce]);

  // srcdoc can finish loading before React attaches onLoad, so check once mounted too.
  useEffect(() => {
    const d = frameRef.current?.contentDocument;
    if (d?.readyState === "complete") attach();
  });

  const d = DEVICES[device];
  const scale = size.width ? Math.min(1, (size.width - (device === "desktop" || thumb ? 0 : 40)) / d.width) : 0;
  // Fill the space top to bottom: a taller frame shows more of the page at once.
  const frameHeight = thumb ? (size.width * 10) / 16 / (scale || 1) : scale ? Math.max(d.height * 0.5, (size.height - (device === "desktop" ? 0 : 36)) / scale) : d.height;

  return (
    <div ref={stageRef} className={thumb ? s.thumbStage : s.stage} data-device={thumb ? undefined : device}>
      {scale > 0 && (
        <div className={s.device} data-device={thumb ? "thumb" : device} data-ready={mount ? true : undefined} style={{ width: d.width * scale, height: frameHeight * scale }}>
          {!mount && <div className={s.frameLoading} aria-hidden="true" />}
          <iframe
            ref={frameRef}
            srcDoc={SHELL}
            onLoad={attach}
            title={title}
            width={d.width}
            height={frameHeight}
            sandbox="allow-same-origin"
            tabIndex={thumb ? -1 : 0}
            aria-hidden={thumb || undefined}
            style={{ transform: `scale(${scale})`, pointerEvents: thumb ? "none" : "auto" }}
            data-testid={thumb ? undefined : "builder-frame"}
          />
          {mount && createPortal(<LandingPage doc={doc} brand={brand} selectedId={selectedId} builder={!thumb} />, mount)}
        </div>
      )}
    </div>
  );
}
