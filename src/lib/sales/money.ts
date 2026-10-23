// Money in the smallest unit of the currency (cents for USD), as integers.
// Formatting and parsing live here so every screen and email says amounts the same way.

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, whole: boolean): Intl.NumberFormat {
  const key = `${currency}:${whole}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}) });
    formatters.set(key, f);
  }
  return f;
}

/** How many minor units make one whole unit: 100 for USD, 1 for JPY. */
export function minorPerMajor(currency: string): number {
  const digits = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2;
  return 10 ** digits;
}

/** "$1,240.50". Whole amounts drop the cents when `trim` is on: "$1,240". */
export function formatMoney(minor: number, currency = "usd", opts: { trim?: boolean } = {}): string {
  const per = minorPerMajor(currency);
  const major = minor / per;
  const whole = Boolean(opts.trim) && Number.isInteger(major);
  return formatter(currency, whole).format(major);
}

/**
 * Reads what a person typed as an amount: "12", "12.5", "$1,240.50". Returns
 * minor units, or null if it isn't a plain non-negative amount.
 */
export function parseMoney(input: string, currency = "usd"): number | null {
  const cleaned = input.trim().replace(/[$€£,\s]/g, "");
  if (!/^\d{1,9}(\.\d{0,2})?$/.test(cleaned)) return null;
  const per = minorPerMajor(currency);
  return Math.round(Number(cleaned) * per);
}

/** The amount as a plain number for an input field: 1240.5 → "1240.50". */
export function moneyInput(minor: number | null | undefined, currency = "usd"): string {
  if (minor === null || minor === undefined) return "";
  const per = minorPerMajor(currency);
  return per === 1 ? String(minor) : (minor / per).toFixed(Math.log10(per));
}

/** Percent of an amount, rounded to the nearest minor unit, never more than the amount. */
export function percentOf(minor: number, percent: number): number {
  return Math.min(minor, Math.round((minor * percent) / 100));
}

export function formatPercentOff(percent: number): string {
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}
