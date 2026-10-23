// Every change to a page, by a person or by the agent, is one of these ops.
// Each returns a new, checked page and a short label for the change log.
import {
  MAX_SECTIONS,
  type PageDoc,
  PageDocError,
  type PageTheme,
  parsePageDoc,
  parseSection,
  SECTION_LABELS,
  type Section,
  type SectionType,
  SECTION_TYPES,
  themeSchema,
} from "./schema";

export type PageOp =
  | { op: "add_section"; section: Record<string, unknown>; after?: string | null }
  | { op: "update_section"; id: string; changes: Record<string, unknown> }
  | { op: "remove_section"; id: string }
  | { op: "move_section"; id: string; to: number }
  | { op: "set_theme"; changes: Partial<PageTheme> }
  | { op: "set_seo"; changes: { title?: string; description?: string } };

export type OpResult = { doc: PageDoc; label: string; sectionId?: string };

const label = (type: SectionType) => SECTION_LABELS[type].toLowerCase();

export function uniqueSectionId(doc: PageDoc, base: string): string {
  const clean = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^[^a-z]+/, "").slice(0, 32) || "section";
  const taken = new Set(doc.sections.map((s) => s.id));
  if (!taken.has(clean)) return clean;
  for (let n = 2; ; n++) if (!taken.has(`${clean}-${n}`)) return `${clean}-${n}`;
}

function find(doc: PageDoc, id: string): { section: Section; index: number } {
  const index = doc.sections.findIndex((s) => s.id === id);
  if (index === -1) throw new PageDocError(`There's no section with the id "${id}". Sections on this page: ${doc.sections.map((s) => s.id).join(", ") || "none"}.`);
  return { section: doc.sections[index], index };
}

/** Drops keys set to null, so a change can remove an optional field. */
function merge(base: Record<string, unknown>, changes: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

export function applyOp(doc: PageDoc, op: PageOp): OpResult {
  switch (op.op) {
    case "add_section": {
      if (doc.sections.length >= MAX_SECTIONS) throw new PageDocError(`A page can have up to ${MAX_SECTIONS} sections. Remove one first.`);
      const type = op.section?.type;
      if (typeof type !== "string" || !(SECTION_TYPES as readonly string[]).includes(type)) {
        throw new PageDocError(`Section type must be one of: ${SECTION_TYPES.join(", ")}.`);
      }
      const wanted = typeof op.section.id === "string" && op.section.id ? op.section.id : type;
      const section = parseSection({ ...op.section, id: uniqueSectionId(doc, wanted) });
      const sections = [...doc.sections];
      const at = op.after === "start" ? 0 : op.after ? find(doc, op.after).index + 1 : sections.length;
      sections.splice(at, 0, section);
      return { doc: parsePageDoc({ ...doc, sections }), label: `Added ${label(section.type)}`, sectionId: section.id };
    }
    case "update_section": {
      const { section, index } = find(doc, op.id);
      const changes = { ...op.changes };
      if ("type" in changes && changes.type !== section.type) throw new PageDocError("A section can't change type. Remove it and add a new one.");
      delete changes.type;
      delete changes.id;
      const next = parseSection(merge(section as unknown as Record<string, unknown>, changes));
      const sections = doc.sections.map((s, i) => (i === index ? next : s));
      return { doc: parsePageDoc({ ...doc, sections }), label: `Updated ${label(section.type)}`, sectionId: section.id };
    }
    case "remove_section": {
      const { section } = find(doc, op.id);
      return { doc: { ...doc, sections: doc.sections.filter((s) => s.id !== op.id) }, label: `Removed ${label(section.type)}` };
    }
    case "move_section": {
      const { section, index } = find(doc, op.id);
      const sections = [...doc.sections];
      sections.splice(index, 1);
      const to = Math.max(0, Math.min(sections.length, Math.round(Number(op.to) || 0)));
      sections.splice(to, 0, section);
      return { doc: { ...doc, sections }, label: `Moved ${label(section.type)}`, sectionId: section.id };
    }
    case "set_theme": {
      const theme = themeSchema.safeParse({ ...doc.theme, ...op.changes });
      if (!theme.success) throw new PageDocError(theme.error.issues[0]?.message ?? "That style isn't valid.");
      return { doc: { ...doc, theme: theme.data }, label: "Changed the style" };
    }
    case "set_seo": {
      return { doc: parsePageDoc({ ...doc, seo: { ...doc.seo, ...op.changes } }), label: "Changed the search title and description" };
    }
  }
}

/** Applies ops in order and stops at the first that doesn't fit. */
export function applyOps(doc: PageDoc, ops: PageOp[]): OpResult[] {
  const results: OpResult[] = [];
  let current = doc;
  for (const op of ops) {
    const r = applyOp(current, op);
    results.push(r);
    current = r.doc;
  }
  return results;
}
