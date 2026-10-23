"use client";

// Shows a rendered email exactly as it will go out: the real HTML, written into
// a sandboxed frame that can't run scripts, at desktop or phone width. The
// frame grows to the email's full height, so the page around it scrolls and
// edits never jump you back to the top. Clicking a section selects it.
import { useEffect, useRef, useState } from "react";
import s from "./marketing.module.css";

export type EmailDevice = "desktop" | "phone";

const WIDTH: Record<EmailDevice, number> = { desktop: 680, phone: 390 };

type Props = {
  html: string;
  device?: EmailDevice;
  onSelect?: (id: string) => void;
  /** Change the nonce to scroll to a section again. */
  scrollTo?: { id: string; nonce: number } | null;
  title?: string;
  testId?: string;
  /** A small card preview: scaled down, not clickable, cut off at a set height. */
  thumb?: { height: number };
};

export function EmailFrame({ html, device = "desktop", onSelect, scrollTo, title = "Email preview", testId = "email-frame", thumb }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);
  const [wrapWidth, setWrapWidth] = useState(0);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0) setWrapWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Write the email in. document.open() also clears old listeners, so they're added back each time.
  useEffect(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    const measure = () => {
      const h = Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0);
      if (h) setHeight(h);
    };
    measure();
    const timers = [100, 400, 1200].map((ms) => window.setTimeout(measure, ms));
    doc.addEventListener("load", measure, true);
    if (!thumb) {
      doc.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          const target = e.target as Element | null;
          const section = target?.closest?.<HTMLElement>("[data-section]");
          if (section?.dataset.section) onSelectRef.current?.(section.dataset.section);
        },
        true,
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [html, device, thumb]);

  // Scroll the page (not the frame) to a section when asked.
  const scrollId = scrollTo?.id;
  const nonce = scrollTo?.nonce;
  useEffect(() => {
    if (!scrollId) return;
    const frame = frameRef.current;
    const el = frame?.contentDocument?.querySelector(`[data-section="${CSS.escape(scrollId)}"]`);
    if (!frame || !el) return;
    const box = frame.getBoundingClientRect();
    const shown = box.width / (frame.offsetWidth || box.width || 1);
    const top = box.top + (el as HTMLElement).getBoundingClientRect().top * shown;
    const scroller = frame.closest("[data-email-scroll]") as HTMLElement | null;
    if (scroller) scroller.scrollBy({ top: top - scroller.getBoundingClientRect().top - 80, behavior: "smooth" });
    else window.scrollBy({ top: top - 120, behavior: "smooth" });
  }, [scrollId, nonce]);

  const width = WIDTH[device];
  const scale = wrapWidth ? Math.min(1, wrapWidth / width) : 1;
  const shownHeight = thumb ? thumb.height : height * scale;

  return (
    <div ref={wrapRef} className={thumb ? s.frameThumb : s.frameWrap} data-device={device}>
      <div className={s.frameBox} style={{ width: width * scale, height: shownHeight }}>
        <iframe
          ref={frameRef}
          title={title}
          sandbox="allow-same-origin"
          width={width}
          height={thumb ? thumb.height / scale : height}
          tabIndex={thumb ? -1 : 0}
          aria-hidden={thumb ? true : undefined}
          style={{ transform: `scale(${scale})`, pointerEvents: thumb ? "none" : "auto" }}
          data-testid={thumb ? undefined : testId}
        />
      </div>
    </div>
  );
}
