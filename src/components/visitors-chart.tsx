import { formatDay, formatInt } from "@/lib/format";
import type { DailyPoint } from "@/lib/repo/types";
import s from "./visitors-chart.module.css";

/**
 * A smooth line through every point that never overshoots between days
 * (monotone cubic interpolation, the same curve d3 calls monotoneX).
 */
function monotonePath(pts: readonly (readonly [number, number])[]): string {
  const n = pts.length;
  if (n === 0) return "";
  const f = (v: number) => v.toFixed(1);
  if (n === 1) return `M${f(pts[0][0])},${f(pts[0][1])}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    slope[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) tangent[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangent[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
    }
  }
  tangent[n - 1] = slope[n - 2];
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${f(pts[i][0] + h)},${f(pts[i][1] + h * tangent[i])} ${f(pts[i + 1][0] - h)},${f(pts[i + 1][1] - h * tangent[i + 1])} ${f(pts[i + 1][0])},${f(pts[i + 1][1])}`;
  }
  return d;
}

/** Daily visitors as one smooth line over a soft fill. Server-rendered SVG; a hidden table carries the same numbers for screen readers. */
export function VisitorsChart({ points }: { points: DailyPoint[] }) {
  const w = 1000;
  const h = 240;
  const pad = { top: 12, right: 0, bottom: 0, left: 0 };
  const max = Math.max(1, ...points.map((p) => p.visitors));
  const step = max > 200 ? 100 : max > 40 ? 20 : 10;
  const niceMax = Math.ceil((max * 1.1) / step) * step;
  const x = (i: number) => pad.left + (i * (w - pad.left - pad.right)) / Math.max(1, points.length - 1);
  const y = (v: number) => pad.top + (1 - v / niceMax) * (h - pad.top - pad.bottom);

  const pts = points.map((p, i) => [x(i), y(p.visitors)] as const);
  const line = monotonePath(pts);
  const area = pts.length ? `${line} L${x(points.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z` : "";
  const total = points.reduce((sum, p) => sum + p.visitors, 0);
  const last = pts[pts.length - 1];
  const gridLines = [0.25, 0.5, 0.75];
  const ticks = points.length > 1 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [];

  return (
    <figure className={s.figure}>
      <div className={s.plot}>
        <div className={s.area}>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Daily visitors over ${points.length} days, ${formatInt(total)} in total`} className={s.svg}>
          <defs>
            <linearGradient id="visitors-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--bo-accent)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--bo-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridLines.map((f) => (
            <line key={f} x1={0} x2={w} y1={y(niceMax * f)} y2={y(niceMax * f)} className={s.grid} vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill="url(#visitors-fill)" />
          <path d={line} className={s.line} vectorEffect="non-scaling-stroke" pathLength={1} />
        </svg>
        {last && <span className={s.endDot} style={{ left: `${(last[0] / w) * 100}%`, top: `${(last[1] / h) * 100}%` }} aria-hidden="true" />}
        </div>
        <div className={s.yLabels} aria-hidden="true">
          {gridLines.map((f) => (
            <span key={f} className="num" style={{ top: `${(y(niceMax * f) / h) * 100}%` }}>
              {formatInt(niceMax * f)}
            </span>
          ))}
        </div>
      </div>
      <div className={s.xLabels} aria-hidden="true">
        {ticks.map((i) => (
          <span key={i}>{formatDay(points[i].date)}</span>
        ))}
      </div>
      <table className="visually-hidden">
        <caption>Daily visitors</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <th scope="row">{p.date}</th>
              <td>{p.visitors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
