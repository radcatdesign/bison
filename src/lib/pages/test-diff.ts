// What a test version changes from the live page, in a few words, so the team
// can see at a glance what's being tested. Pure.
import type { EditionKey } from "@/config/editions";
import { type PageDoc, type Section, sectionLabel } from "./schema";

const THEME_WORDS: Record<keyof PageDoc["theme"], string> = { mode: "light or dark mode", accent: "accent color", font: "type", corners: "corners" };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The parts of one section that differ, like "headline" or "button". */
function fieldsChanged(a: Section, b: Section): string[] {
  const out: string[] = [];
  const ra = a as unknown as Record<string, unknown>;
  const rb = b as unknown as Record<string, unknown>;
  const words: Record<string, string> = { headline: "headline", heading: "heading", body: "text", eyebrow: "small line above", primary: "main button", secondary: "second button", cta: "button", items: "items", bullets: "list", price: "price", note: "note", fields: "fields", submit: "button", success: "thank-you note", quote: "quote", align: "layout", art: "background" };
  for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    if (k === "id" || k === "type" || same(ra[k], rb[k])) continue;
    const w = words[k] ?? "details";
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** "Changes the hero headline and the accent color." Empty string when the two are the same. */
export function describeChanges(live: PageDoc | null, version: PageDoc | null, edition?: EditionKey): string {
  if (!live || !version) return "";
  if (same(live, version)) return "";
  const parts: string[] = [];
  const byId = new Map(live.sections.map((s) => [s.id, s]));
  const kept = new Set<string>();
  const name = (s: Section) => sectionLabel(s.type, edition).toLowerCase();
  for (const s of version.sections) {
    const was = byId.get(s.id);
    if (!was || was.type !== s.type) {
      parts.push(`adds ${name(s)}`);
      continue;
    }
    kept.add(s.id);
    const f = fieldsChanged(was, s);
    if (f.length) parts.push(`the ${name(s)} ${list(f)}`);
  }
  const removed = live.sections.filter((s) => !kept.has(s.id) && !version.sections.some((v) => v.id === s.id && v.type === s.type));
  for (const s of removed) parts.push(`removes ${name(s)}`);
  const order = (d: PageDoc) => d.sections.filter((s) => kept.has(s.id)).map((s) => s.id);
  if (!same(order(live), order(version))) parts.push("the section order");
  const theme = (Object.keys(THEME_WORDS) as (keyof PageDoc["theme"])[]).filter((k) => live.theme[k] !== version.theme[k]).map((k) => THEME_WORDS[k]);
  if (theme.length) parts.push(`the ${list(theme)}`);
  if (!parts.length) return "Small changes to the search details.";
  // "Changes the hero headline, adds questions" reads oddly; keep "changes" for the parts that don't start with a verb.
  const changes = parts.filter((p) => p.startsWith("the "));
  const other = parts.filter((p) => !p.startsWith("the "));
  const sentence = [changes.length ? `changes ${list(changes.slice(0, 3))}${changes.length > 3 ? ` and ${changes.length - 3} more` : ""}` : "", ...other.slice(0, 3)].filter(Boolean).join(", ");
  return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
}
