"use client";

// Shows a real page at a real device width, scaled to fit. The page loads in a
// sandboxed frame, so it can run but can't reach the dashboard.
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import s from "./page-preview.module.css";

export const DEVICES = {
  desktop: { label: "Desktop", width: 1440, height: 900, icon: Monitor },
  tablet: { label: "Tablet", width: 820, height: 1180, icon: Tablet },
  phone: { label: "Phone", width: 390, height: 844, icon: Smartphone },
} as const;
export type Device = keyof typeof DEVICES;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function Frame({ src, title, device, maxHeight, interactive }: { src: string; title: string; device: Device; maxHeight?: number; interactive: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const d = DEVICES[device];
  const scale = width ? Math.min(width / d.width, maxHeight ? maxHeight / d.height : Infinity, 1) : 0;
  const w = d.width * scale;
  const h = d.height * scale;
  return (
    <div ref={ref} className={s.stage} style={{ height: maxHeight ? Math.min(maxHeight, h || maxHeight) : h || undefined, aspectRatio: maxHeight || h ? undefined : `${d.width} / ${d.height}` }}>
      {scale > 0 && (
        <div className={s.device} data-device={device} style={{ width: w, height: h }}>
          <iframe
            src={src}
            title={title}
            width={d.width}
            height={d.height}
            loading="lazy"
            referrerPolicy="no-referrer"
            // Tenant sites are another origin, so they keep their own. Our sample pages share
            // the dashboard's origin, so they lose it and can't touch the dashboard.
            sandbox={/^https?:\/\//.test(src) ? "allow-scripts allow-same-origin allow-forms allow-popups" : "allow-scripts"}
            tabIndex={interactive ? 0 : -1}
            aria-hidden={interactive ? undefined : true}
            style={{ transform: `scale(${scale})`, pointerEvents: interactive ? "auto" : "none" }}
          />
        </div>
      )}
    </div>
  );
}

/** Small, non-interactive preview for cards. Always desktop. */
export function PageThumb({ src, title }: { src: string; title: string }) {
  return (
    <div className={s.thumb}>
      <Frame src={src} title={title} device="desktop" interactive={false} />
    </div>
  );
}

/** Full preview with a device switch. */
export function PagePreview({ src, title, url }: { src: string; title: string; url: string }) {
  const [device, setDevice] = useState<Device>("desktop");
  return (
    <div className={s.preview}>
      <div className={s.toolbar}>
        <div className={s.address} title={url}>
          <span className={s.dots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className={s.url}>{url}</span>
        </div>
        <div className={s.devices} role="radiogroup" aria-label="Device">
          {(Object.keys(DEVICES) as Device[]).map((key) => {
            const { label, icon: Icon } = DEVICES[key];
            return (
              <button key={key} type="button" role="radio" aria-checked={device === key} className={s.deviceButton} onClick={() => setDevice(key)} data-testid={`device-${key}`}>
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <Frame src={src} title={title} device={device} maxHeight={640} interactive />
    </div>
  );
}
