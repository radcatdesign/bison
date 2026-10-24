"use client";

// A box to sign with a finger or a stylus. Strokes are kept in a 600 by 200
// box whatever size it's drawn at, which is what the server checks and stores.
import { useEffect, useRef } from "react";
import { SIGNATURE_BOX } from "@/lib/kiosk/settings";
import s from "./kiosk.module.css";

export type Strokes = [number, number][][];

export function SignaturePad({ strokes, onChange }: { strokes: Strokes; onChange: (next: Strokes) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<Strokes>(strokes);
  const drawing = useRef(false);

  // Redraw whenever strokes change from outside (cleared, or a new person).
  useEffect(() => {
    live.current = strokes;
    paint();
  }, [strokes]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function paint() {
    const el = canvas.current;
    if (!el) return;
    const ratio = window.devicePixelRatio || 1;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (el.width !== Math.round(w * ratio)) el.width = Math.round(w * ratio);
    if (el.height !== Math.round(h * ratio)) el.height = Math.round(h * ratio);
    const g = el.getContext("2d");
    if (!g) return;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = getComputedStyle(el).color;
    g.lineWidth = 2.5;
    g.lineCap = "round";
    g.lineJoin = "round";
    const sx = w / SIGNATURE_BOX.width;
    const sy = h / SIGNATURE_BOX.height;
    for (const stroke of live.current) {
      g.beginPath();
      stroke.forEach(([x, y], i) => (i ? g.lineTo(x * sx, y * sy) : g.moveTo(x * sx, y * sy)));
      if (stroke.length === 1) g.lineTo(stroke[0][0] * sx + 0.1, stroke[0][1] * sy);
      g.stroke();
    }
  }

  function point(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * SIGNATURE_BOX.width), Math.round(((e.clientY - r.top) / r.height) * SIGNATURE_BOX.height)];
  }

  return (
    <div className={s.signature}>
      <canvas
        ref={canvas}
        className={s.signatureCanvas}
        role="img"
        aria-label="Signature box. Sign with your finger."
        data-testid="signature-pad"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          live.current = [...live.current, [point(e)]];
          paint();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const last = live.current[live.current.length - 1];
          const p = point(e);
          const prev = last[last.length - 1];
          if (prev && Math.abs(prev[0] - p[0]) + Math.abs(prev[1] - p[1]) < 2) return;
          last.push(p);
          paint();
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          onChange([...live.current]);
        }}
        onPointerCancel={() => {
          drawing.current = false;
          onChange([...live.current]);
        }}
      />
      <div className={s.signatureFoot}>
        <span className={s.signatureLine}>Sign above</span>
        <button type="button" className="btn btn-ghost" onClick={() => onChange([])} disabled={strokes.length === 0}>
          Clear
        </button>
      </div>
    </div>
  );
}
