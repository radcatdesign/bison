import { formatDay, formatInt } from "@/lib/format";
import type { DailyPoint } from "@/lib/repo/types";

/** Daily visitors as one lit line. Server-rendered SVG; a table carries the same numbers for screen readers. */
export function VisitorsChart({ points }: { points: DailyPoint[] }) {
  const w = 1000;
  const h = 220;
  const pad = { top: 16, right: 8, bottom: 28, left: 8 };
  const max = Math.max(1, ...points.map((p) => p.visitors));
  const niceMax = Math.ceil(max / 10) * 10;
  const x = (i: number) => pad.left + (i * (w - pad.left - pad.right)) / Math.max(1, points.length - 1);
  const y = (v: number) => pad.top + (1 - v / niceMax) * (h - pad.top - pad.bottom);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.visitors).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${h - pad.bottom} L${x(0).toFixed(1)},${h - pad.bottom} Z`;
  const total = points.reduce((s, p) => s + p.visitors, 0);

  return (
    <figure style={{ margin: 0, borderTop: "1px solid var(--bo-rule)", borderBottom: "1px solid var(--bo-rule)" }}>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Daily visitors over ${points.length} days, ${formatInt(total)} in total`} style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}>
        <defs>
          <linearGradient id="visitors-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--bo-accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--bo-accent)" stopOpacity="0" />
          </linearGradient>
          <filter id="visitors-glow" x="-5%" y="-30%" width="110%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.left} x2={w - pad.right} y1={y(niceMax * f)} y2={y(niceMax * f)} stroke="var(--bo-rule)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x={w - pad.right} y={y(niceMax * f) - 6} textAnchor="end" fill="var(--bo-fg-3)" fontSize="11" fontFamily="var(--bo-font-mono)">
              {formatInt(niceMax * f)}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#visitors-fill)" />
        <path d={line} fill="none" stroke="var(--bo-accent)" strokeWidth="2" filter="url(#visitors-glow)" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {points.length > 1 && (
          <>
            <text x={pad.left} y={h - 8} fill="var(--bo-fg-3)" fontSize="11" fontFamily="var(--bo-font-mono)">
              {formatDay(points[0].date)}
            </text>
            <text x={w - pad.right} y={h - 8} textAnchor="end" fill="var(--bo-fg-3)" fontSize="11" fontFamily="var(--bo-font-mono)">
              {formatDay(points[points.length - 1].date)}
            </text>
          </>
        )}
      </svg>
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
