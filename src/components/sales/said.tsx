"use client";

// Words that change by edition, for the parts of a Sales page that paint
// before the session is read (headers outside Suspense, back links, fallbacks).
// The shell's edition provider is already there, so these read it.
import { PageHeader } from "@/components/ui";
import { useSay } from "@/components/edition";

/** One phrase: `<Said b="Products" f="Memberships" />`. */
export function Said({ b, f }: { b: string; f: string }) {
  return useSay()(b, f);
}

/** A page header with both editions' title and note. */
export function SaidHeader({ title, note }: { title: [bison: string, fit: string]; note?: [bison: string, fit: string] }) {
  const say = useSay();
  return <PageHeader title={say(...title)} note={note ? say(...note) : undefined} />;
}
