// Number and time formatting in one place, so every screen reads the same way.

const int = new Intl.NumberFormat("en-US");

export function formatInt(n: number): string {
  return int.format(Math.round(n));
}

export function formatPercent(fraction: number | null, digits = 0): string {
  if (fraction === null || Number.isNaN(fraction)) return "None yet";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "None yet";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function formatDecimal(n: number | null, digits = 1): string {
  return n === null ? "None yet" : n.toFixed(digits);
}

/** "Up 12% on the previous 30 days". Null when there's nothing to compare. */
export function formatDelta(current: number | null, previous: number | null, rangeDays: number, lowerIsBetter = false): string | null {
  if (current === null || previous === null || previous === 0) return null;
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.005) return `Same as the previous ${rangeDays} days`;
  const direction = change > 0 ? "Up" : "Down";
  const note = lowerIsBetter ? (change > 0 ? " (worse)" : " (better)") : "";
  return `${direction} ${Math.abs(change * 100).toFixed(0)}% on the previous ${rangeDays} days${note}`;
}

const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

export function formatAgo(date: Date, now = new Date()): string {
  const seconds = (date.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(seconds / 86_400), "day");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDay(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export type Change = {
  label: string;
  direction: "up" | "down" | "flat";
  /** Whether the change is good news. Bounce rate going up is bad. */
  tone: "good" | "bad" | "neutral";
  sentence: string;
};

/** A change from the previous period, for the small up or down chip. Null when there's nothing to compare. */
export function formatChange(current: number | null, previous: number | null, rangeDays: number, lowerIsBetter = false): Change | null {
  const sentence = formatDelta(current, previous, rangeDays, lowerIsBetter);
  if (current === null || previous === null || previous === 0 || !sentence) return null;
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.005) return { label: "0%", direction: "flat", tone: "neutral", sentence };
  const up = change > 0;
  return {
    label: `${Math.abs(change * 100).toFixed(0)}%`,
    direction: up ? "up" : "down",
    tone: up !== lowerIsBetter ? "good" : "bad",
    sentence,
  };
}
