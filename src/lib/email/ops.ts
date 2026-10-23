// Every change to an email goes through these, and every result is checked
// against the schema, so the builder can't produce an email that won't send.
// Works in the browser and on the server.
import { type EmailDoc, EmailDocError, type EmailSection, type EmailSectionType, emailDocSchema, MAX_EMAIL_SECTIONS, describeIssues } from "./schema";

export type EmailOp =
  | { op: "add"; section: EmailSection; after?: string | null }
  | { op: "update"; section: EmailSection }
  | { op: "remove"; id: string }
  | { op: "move"; id: string; to: number }
  | { op: "duplicate"; id: string }
  | { op: "settings"; changes: Partial<Pick<EmailDoc, "signOff" | "fallbackName">> };

export function sectionId(type: EmailSectionType, taken: Set<string>): string {
  for (;;) {
    const id = `${type}-${Math.random().toString(36).slice(2, 7)}`;
    if (!taken.has(id)) return id;
  }
}

function check(doc: EmailDoc): EmailDoc {
  const r = emailDocSchema.safeParse(doc);
  if (!r.success) throw new EmailDocError(describeIssues(r.error));
  return r.data;
}

export function applyEmailOp(doc: EmailDoc, op: EmailOp): { doc: EmailDoc; selected: string | null } {
  const sections = [...doc.sections];
  const index = (id: string) => {
    const i = sections.findIndex((s) => s.id === id);
    if (i < 0) throw new EmailDocError("That section isn't in this email anymore.");
    return i;
  };
  switch (op.op) {
    case "add": {
      if (sections.length >= MAX_EMAIL_SECTIONS) throw new EmailDocError(`An email can have up to ${MAX_EMAIL_SECTIONS} sections.`);
      const taken = new Set(sections.map((s) => s.id));
      const section = taken.has(op.section.id) ? { ...op.section, id: sectionId(op.section.type, taken) } : op.section;
      const at = op.after ? sections.findIndex((s) => s.id === op.after) + 1 : sections.length;
      sections.splice(at > 0 ? at : sections.length, 0, section);
      return { doc: check({ ...doc, sections }), selected: section.id };
    }
    case "update": {
      sections[index(op.section.id)] = op.section;
      return { doc: check({ ...doc, sections }), selected: op.section.id };
    }
    case "remove": {
      const i = index(op.id);
      sections.splice(i, 1);
      return { doc: check({ ...doc, sections }), selected: null };
    }
    case "move": {
      const i = index(op.id);
      const [s] = sections.splice(i, 1);
      sections.splice(Math.max(0, Math.min(op.to, sections.length)), 0, s);
      return { doc: check({ ...doc, sections }), selected: op.id };
    }
    case "duplicate": {
      if (sections.length >= MAX_EMAIL_SECTIONS) throw new EmailDocError(`An email can have up to ${MAX_EMAIL_SECTIONS} sections.`);
      const i = index(op.id);
      const copy = { ...structuredClone(sections[i]), id: sectionId(sections[i].type, new Set(sections.map((s) => s.id))) };
      sections.splice(i + 1, 0, copy);
      return { doc: check({ ...doc, sections }), selected: copy.id };
    }
    case "settings":
      return { doc: check({ ...doc, ...op.changes }), selected: null };
  }
}

/** A new section with sensible starting content, so it shows up looking right. */
export function starterEmailSection(type: EmailSectionType, site = "https://example.com", taken: Set<string> = new Set()): EmailSection {
  const id = sectionId(type, taken);
  switch (type) {
    case "text":
      return { id, type, heading: "A heading", body: "Write a few sentences here. A blank line starts a new paragraph, **two stars** make text bold, and [words in brackets](https://example.com) become a link.", align: "left" };
    case "photo":
      return { id, type, image: null, alt: "", width: "inset" };
    case "photo-text":
      return { id, type, image: null, alt: "", heading: "A heading", body: "A sentence or two to go with the photo.", side: "left" };
    case "header-photo":
      return { id, type, image: null, alt: "", heading: "A big headline", body: "One line under it." };
    case "cards":
      return {
        id,
        type,
        columns: 2,
        cards: [
          { image: null, alt: "", heading: "First card", body: "A short line about it." },
          { image: null, alt: "", heading: "Second card", body: "A short line about it." },
        ],
      };
    case "button":
      return { id, type, label: "Take a look", href: site, align: "left", style: "solid" };
    case "highlight":
      return { id, type, heading: "Don't miss this", body: "The one thing nobody should skip, like a date or a deadline." };
    case "divider":
      return { id, type, style: "line" };
    case "offer":
      return { id, type, heading: "A welcome gift", body: "Here's a code for your first order." };
  }
}

/** Problems that stop an email going out, in plain words, each pointing at its section. */
export function emailProblems(doc: EmailDoc, subject: string, preheader = ""): { sectionId: string | null; text: string }[] {
  const out: { sectionId: string | null; text: string }[] = [];
  if (!subject.trim()) out.push({ sectionId: null, text: "Add a subject line." });
  if (!doc.sections.length) out.push({ sectionId: null, text: "The email is empty. Add a section." });
  for (const s of doc.sections) {
    if ((s.type === "photo" || s.type === "header-photo" || s.type === "photo-text") && !s.image) out.push({ sectionId: s.id, text: "A photo section has no photo yet." });
    if (s.type === "text" && !s.body && !s.heading) out.push({ sectionId: s.id, text: "A text section is empty." });
  }
  const PLACEHOLDER = /\[Add [^\]]{1,200}\]/g;
  for (const m of subject.matchAll(PLACEHOLDER)) out.push({ sectionId: null, text: `Fill in ${m[0]} in the subject.` });
  for (const m of preheader.matchAll(PLACEHOLDER)) out.push({ sectionId: null, text: `Fill in ${m[0]} in the preview text.` });
  for (const s of doc.sections) {
    const found = JSON.stringify(s).match(PLACEHOLDER);
    if (found) out.push({ sectionId: s.id, text: `Fill in ${found[0]}.` });
  }
  return out;
}
