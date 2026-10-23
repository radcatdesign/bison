// DNS names for sending domains. Works in the browser too.

const MULTI_PART = new Set(["co", "com", "org", "net", "gov", "ac", "edu", "ltd", "plc"]);

/** The zone a DNS host manages: example.com, or example.co.uk. A best guess, shown with a note. */
export function zoneOf(domain: string): string {
  const parts = domain.split(".");
  if (parts.length > 2 && parts.at(-1)!.length === 2 && MULTI_PART.has(parts.at(-2)!)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

/** A record name as most DNS hosts want it: relative to the zone, like send.mail for mail.example.com. */
export function relativeName(label: string, domain: string): string {
  const sub = domain.length > zoneOf(domain).length ? domain.slice(0, -zoneOf(domain).length - 1) : "";
  return sub ? `${label}.${sub}` : label;
}

/** The full name, for DNS hosts that ask for it. */
export function fullName(name: string, domain: string): string {
  const zone = zoneOf(domain);
  if (!name || name === "@") return zone;
  return name.endsWith(zone) ? name : `${name}.${zone}`;
}
