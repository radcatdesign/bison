"use server";

// The buttons on the unsubscribe page. The token is checked again here; the
// page that showed the button doesn't count as proof.
import { redirect } from "next/navigation";
import { demoMode } from "@/lib/env";
import { resubscribeByToken, unsubscribeByToken } from "@/lib/marketing/unsubscribe";

function tokenFrom(formData: FormData): string {
  const t = formData.get("token");
  return typeof t === "string" ? t.slice(0, 200) : "";
}

export async function confirmUnsubscribe(formData: FormData): Promise<void> {
  const token = tokenFrom(formData);
  if (!demoMode()) await unsubscribeByToken(token, "link");
  redirect(`/u/${encodeURIComponent(token)}`);
}

export async function undoUnsubscribe(formData: FormData): Promise<void> {
  const token = tokenFrom(formData);
  if (!demoMode()) await resubscribeByToken(token);
  redirect(`/u/${encodeURIComponent(token)}?back=1`);
}
