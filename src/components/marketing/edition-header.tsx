"use client";

// A page header for Suspense fallbacks, which load before the page knows much:
// the shell already knows the edition, so the title and note read right in it.
import { useSay } from "@/components/edition";
import { PageHeader } from "@/components/ui";

type Words = readonly [bison: string, fit: string];

export function EditionPageHeader({ title, note }: { title: Words; note?: Words }) {
  const say = useSay();
  return <PageHeader title={say(...title)} note={note ? say(...note) : undefined} />;
}
