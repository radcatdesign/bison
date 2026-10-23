"use client";

// The header names the product the company signed up for. The shell already knows it.
import { useEdition } from "@/components/edition";
import { PageHeader } from "@/components/ui";

export function UpdatesHeader() {
  return <PageHeader title="Updates" note={`What changed in ${useEdition().productName}, newest first.`} />;
}
