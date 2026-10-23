// The marks. Bison Ops has the bison; Fit Funnels has three bars narrowing like
// a funnel. Both are drawn in the current text color, so they follow light and
// dark mode on their own. The original artwork is in public/brand/.
import type { EditionKey } from "@/config/editions";

/** The bison's shapes, from the brand files (viewBox 0 0 49 36). */
export const BISON_PATHS = [
  "M19.2572 5.87347L23.167 8.58114L22.798 22.7265L10.8248 25.2913L8.21826 29.0583L12.0804 34.9199L8.75384 34.1522L5.2547 29.5403L6.60556 24.6367L2.7077 18.6441L2.6958 12.2469L19.2572 5.87347Z",
  "M5.12362 20.5365L8.15859 23.9702L4.77847 28.475L2.98129 29.9151L2.60043 35.1936L0.166504 34.0213L1.16031 27.755L2.89203 26.6421L5.12362 20.5365Z",
  "M21.8697 21.941L27.0649 29.1654L24.3215 32.5872L25.2142 35.7411L22.2804 34.8307L21.9174 32.1587L20.0845 30.3615L21.8697 21.941Z",
  "M44.7867 9.52132L40.5378 10.2354L30.4629 -0.000152588L23.6788 2.19574L16.1807 4.63561L19.4775 9.15831L19.8524 22.8454L29.5702 31.5397L31.665 30.296C31.665 30.296 32.3672 34.1462 32.5754 34.539C32.7837 34.9318 35.2653 35.4554 35.2653 35.4554L33.8132 26.6778L35.3426 24.3986L36.3959 29.1594L38.9251 30.8732L38.33 27.4157L39.1096 24.8806L45.114 25.1425L48.5001 14.5856L44.7867 9.52132ZM39.3952 15.3592L41.4542 10.9376L41.5613 14.7819L42.4302 15.7698L42.1743 17.2159L40.7818 17.2575L39.3952 15.3592ZM42.9658 19.9711C42.785 19.9711 42.6083 19.9177 42.4579 19.8175C42.3074 19.7173 42.19 19.5749 42.1203 19.4081C42.0506 19.2413 42.0317 19.0577 42.0661 18.8802C42.1006 18.7028 42.1867 18.5395 42.3136 18.4109C42.4406 18.2822 42.6028 18.194 42.7798 18.1573C42.9568 18.1206 43.1406 18.1371 43.3083 18.2046C43.4759 18.2722 43.6199 18.3878 43.722 18.5369C43.8241 18.6861 43.8798 18.8621 43.8822 19.0428C43.8854 19.2838 43.7935 19.5164 43.6264 19.6902C43.4594 19.864 43.2305 19.9649 42.9896 19.9711H42.9658Z",
];
/** The tail is drawn as a stroke as well as a fill. */
export const BISON_TAIL = "M4.16549 12.4372L0.606842 15.9542L0.327148 23.5119L2.82058 20.5662L0.755615 15.4543";

/** The bison on its own, `width` wide. */
export function Bison({ width = 40, className }: { width?: number; className?: string }) {
  return (
    <svg width={width} height={(width * 36) / 49} viewBox="0 0 49 36" fill="currentColor" aria-hidden="true" className={className} style={{ flex: "none", display: "block" }}>
      <path d={BISON_TAIL} stroke="currentColor" strokeWidth="0.595" strokeMiterlimit="10" />
      {BISON_PATHS.map((d) => (
        <path key={d.slice(0, 12)} d={d} />
      ))}
    </svg>
  );
}

/** The Fit Funnels bars (viewBox 0 0 32 32): wide, middle, narrow. */
export const FUNNEL_BARS = [
  { x: 3, y: 5, w: 26, h: 6 },
  { x: 8, y: 13, w: 16, h: 6 },
  { x: 12.5, y: 21, w: 7, h: 6 },
] as const;

/** The Fit Funnels mark on its own, `width` wide. */
export function Funnel({ width = 32, className }: { width?: number; className?: string }) {
  return (
    <svg width={width} height={width} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" className={className} style={{ flex: "none", display: "block" }}>
      {FUNNEL_BARS.map((b) => (
        <rect key={b.y} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.h / 2} />
      ))}
    </svg>
  );
}

/** The edition's mark on its own. */
export function Glyph({ edition = "bison", width = 40 }: { edition?: EditionKey; width?: number }) {
  return edition === "fit" ? <Funnel width={Math.round(width * 0.82)} /> : <Bison width={width} />;
}

/** The app mark: the edition's glyph on a rounded tile, `size` square. */
export function Mark({ size = 28, edition = "bison" }: { size?: number; edition?: EditionKey }) {
  return (
    <span
      aria-hidden="true"
      data-mark={edition}
      style={{
        flex: "none",
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: "var(--bo-ink)",
        color: "var(--bo-canvas)",
      }}
    >
      {edition === "fit" ? <Funnel width={Math.round(size * 0.66)} /> : <Bison width={Math.round(size * 0.74)} />}
    </span>
  );
}
