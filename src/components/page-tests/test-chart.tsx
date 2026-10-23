"use client";

// Each version's rate so far, day by day, as one line per version. A is dashed
// and gray (the page as it was); every line is labeled at its end, and a hidden
// table carries the same numbers for screen readers. Hover or touch shows a day.
import { useRef, useState } from "react";
import type { VersionKey } from "@/lib/pages/test-stats";
import s from "./tests.module.css";

export type ChartPoint = { day: string; rates: Partial<Record<VersionKey, number | null>> };

const W = 1000;
const H = 240;

const pctText = (x: number) => {
  const v = x * 100;
  return `${v < 10 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v)}%`;
};
const dayText = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Nice steps for the scale: 1%, 2%, 5%, 10%... */
function niceMax(max: number): { top: number; step: number } {
  const steps = [0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5];
  const step = steps.find((x) => max * 1.15 <= x * 4) ?? 0.25;
  return { top: Math.max(step, Math.ceil((max * 1.15) / step) * step), step };
}

export function TestChart({ points, keys, goalLabel, aLabel = "A, the live page" }: { points: ChartPoint[]; keys: VersionKey[]; goalLabel: string; aLabel?: string }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <p className={s.chartEmpty}>The chart starts after the second day of visitors.</p>;

  const max = Math.max(0.001, ...points.flatMap((p) => keys.map((k) => p.rates[k] ?? 0)));
  const { top, step } = niceMax(max);
  const x = (i: number) => (i * W) / (points.length - 1);
  const y = (v: number) => (1 - v / top) * H;
  const grid = Array.from({ length: Math.round(top / step) }, (_, i) => (i + 1) * step).filter((v) => v <= top + 1e-9);

  const lineFor = (k: VersionKey) => {
    let d = "";
    points.forEach((p, i) => {
      const r = p.rates[k];
      if (r === null || r === undefined) return;
      d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(r).toFixed(1)}`;
    });
    return d;
  };
  const last = points[points.length - 1];
  // End labels: nudged apart so two close lines don't print on top of each other.
  const ends = keys
    .map((k) => ({ k, r: last.rates[k] ?? null }))
    .filter((e): e is { k: VersionKey; r: number } => e.r !== null)
    .sort((a, b) => b.r - a.r)
    .map((e) => ({ ...e, top: (y(e.r) / H) * 100 }));
  for (let i = 1; i < ends.length; i++) if (ends[i].top - ends[i - 1].top < 9) ends[i].top = ends[i - 1].top + 9;

  const pick = (clientX: number) => {
    const el = plotRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    setHover(Math.round(f * (points.length - 1)));
  };
  const h = hover === null ? null : points[hover];
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <figure className={s.figure}>
      <div className={s.legend} aria-hidden="true">
        {keys.map((k) => (
          <span key={k}>
            <span className={s.swatch} data-key={k} />
            {k === "a" ? aLabel : k.toUpperCase()}
          </span>
        ))}
      </div>
      <div
        ref={plotRef}
        className={s.plot}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={s.svg} role="img" aria-label={`${goalLabel} rate so far for each version, over ${points.length} days`}>
          {grid.map((v) => (
            <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} className={s.grid} vectorEffect="non-scaling-stroke" />
          ))}
          {keys.map((k) => (
            <path key={k} d={lineFor(k)} className={s.line} data-key={k} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {grid.map((v) => (
          <span key={v} className={`num ${s.yLabel}`} style={{ top: `${(y(v) / H) * 100}%` }} aria-hidden="true">
            {pctText(v)}
          </span>
        ))}
        {hover === null &&
          ends.map((e) => (
            <span key={e.k} className={s.endLabel} style={{ top: `${e.top}%` }} aria-hidden="true">
              <span className={s.key} data-key={e.k}>
                {e.k.toUpperCase()}
              </span>
              <span className="num">{pctText(e.r)}</span>
            </span>
          ))}
        {h && hover !== null && (
          <>
            <span className={s.cross} style={{ left: `${(x(hover) / W) * 100}%` }} />
            {keys.map((k) => {
              const r = h.rates[k];
              return r === null || r === undefined ? null : <span key={k} className={s.dot} data-key={k} style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(r) / H) * 100}%` }} />;
            })}
            <div className={s.tip} style={hover > points.length / 2 ? { right: `${100 - (x(hover) / W) * 100 + 2}%` } : { left: `${(x(hover) / W) * 100 + 2}%` }}>
              <strong>{dayText(h.day)}</strong>
              {keys.map((k) => (
                <span key={k} className={s.tipRow}>
                  <span>
                    <span className={s.swatch} data-key={k} />
                    {k.toUpperCase()}
                  </span>
                  <span className="num">{h.rates[k] === null || h.rates[k] === undefined ? "No visitors" : pctText(h.rates[k]!)}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <div className={s.xLabels} aria-hidden="true">
        {ticks.map((i) => (
          <span key={i}>{dayText(points[i].day)}</span>
        ))}
      </div>
      <table className="visually-hidden">
        <caption>{goalLabel} rate so far, by day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {keys.map((k) => (
              <th key={k} scope="col">
                {k.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <th scope="row">{p.day}</th>
              {keys.map((k) => (
                <td key={k}>{p.rates[k] === null || p.rates[k] === undefined ? "No visitors" : pctText(p.rates[k]!)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
