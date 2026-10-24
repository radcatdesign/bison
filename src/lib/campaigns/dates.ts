// A campaign's dates in words, like "Mar 1 to Apr 30, 2026". Pure.
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
const md = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const mdy = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function dateRange(startsOn: string | null, endsOn: string | null): string {
  if (startsOn && endsOn) {
    const sameYear = startsOn.slice(0, 4) === endsOn.slice(0, 4);
    return `${(sameYear ? md : mdy).format(day(startsOn))} to ${mdy.format(day(endsOn))}`;
  }
  if (startsOn) return `From ${mdy.format(day(startsOn))}`;
  if (endsOn) return `Until ${mdy.format(day(endsOn))}`;
  return "No dates set";
}
