"use client";

import { Copy } from "lucide-react";
import { useTransition } from "react";
import { duplicateNewsletterAction } from "@/app/(portal)/marketing/newsletters/actions";

export function DuplicateButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn" disabled={pending} onClick={() => start(async () => void (await duplicateNewsletterAction(id)))} data-testid="duplicate-newsletter">
      <Copy aria-hidden="true" />
      {pending ? "Copying" : "Duplicate"}
    </button>
  );
}
