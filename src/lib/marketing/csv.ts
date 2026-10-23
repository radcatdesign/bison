// CSV in and out for subscriber lists. Reads what spreadsheets and other email
// tools export (quoted fields, commas or semicolons, a header row), and writes
// files that are safe to open in a spreadsheet.

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 2_000_000;

/** RFC 4180 style: quotes, doubled quotes inside them, and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const firstLine = input.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

export type ColumnMap = { email: number; name: number | null; first: number | null; last: number | null; kind: number | null };

const is = (h: string, ...names: string[]) => names.includes(h.toLowerCase().replace(/[^a-z]/g, ""));

/** Finds the columns by their headings, or by an email-looking first row when there's no header. */
export function detectColumns(rows: string[][]): { map: ColumnMap; hasHeader: boolean } | null {
  if (!rows.length) return null;
  const head = rows[0];
  let email = head.findIndex((h) => is(h, "email", "emailaddress", "mail", "eaddress", "subscriberemail"));
  if (email >= 0) {
    const find = (...names: string[]) => {
      const i = head.findIndex((h) => is(h, ...names));
      return i >= 0 ? i : null;
    };
    return {
      hasHeader: true,
      map: {
        email,
        name: find("name", "fullname", "contactname", "subscribername"),
        first: find("firstname", "first", "givenname", "fname"),
        last: find("lastname", "last", "surname", "familyname", "lname"),
        kind: find("type", "iama", "kind", "category", "customertype", "segment"),
      },
    };
  }
  email = head.findIndex((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));
  if (email < 0) return null;
  return { hasHeader: false, map: { email, name: head.length > 1 ? (email === 0 ? 1 : 0) : null, first: null, last: null, kind: null } };
}

export type ImportRow = { email: string; name: string; kind: string };

export function rowsFromCsv(rows: string[][], found: { map: ColumnMap; hasHeader: boolean }): ImportRow[] {
  const { map } = found;
  return (found.hasHeader ? rows.slice(1) : rows).map((r) => {
    const name = map.name !== null ? r[map.name] ?? "" : [map.first !== null ? r[map.first] : "", map.last !== null ? r[map.last] : ""].filter(Boolean).join(" ");
    return { email: (r[map.email] ?? "").trim().toLowerCase(), name: name.trim().slice(0, 120), kind: map.kind !== null ? (r[map.kind] ?? "").trim() : "" };
  });
}

/** Cells that start like a formula are prefixed so a spreadsheet shows them as text. */
function cell(value: string): string {
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
