// Times in the company's own time zone, for scheduling. Works in the browser too.

function offsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(at / 1000) * 1000;
}

/** "2026-10-30T09:00" as a wall-clock time in `timeZone`, turned into an instant. */
export function zonedLocalToDate(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (Number.isNaN(guess)) return null;
  let at = guess - offsetMs(guess, timeZone);
  // Near a clock change the offset differs; check once more from the first answer.
  at = guess - offsetMs(at, timeZone);
  return new Date(at);
}

/** An instant as "2026-10-30T09:00" in `timeZone`, for datetime-local inputs. */
export function dateToZonedLocal(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function formatWhen(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(d);
}

/** The default and latest times for scheduling a send: tomorrow at 9 AM, and 30 days out. */
export function scheduleWindow(timeZone: string, days: number, now = new Date()): { defaultWhen: string; maxWhen: string } {
  const tomorrow = dateToZonedLocal(new Date(now.getTime() + 86_400_000), timeZone);
  return { defaultWhen: `${tomorrow.slice(0, 10)}T09:00`, maxWhen: dateToZonedLocal(new Date(now.getTime() + days * 86_400_000 - 60_000), timeZone) };
}
