"use server";

import { redirect } from "next/navigation";
import { editionFor, isEditionKey } from "@/config/editions";
import { getIdentity } from "@/lib/auth/identity";
import { INDUSTRIES } from "@/lib/sample/industries";
import { createTenant, TenantInputError } from "@/lib/tenants";

export async function createTenantAction(_prev: { ok: boolean; message: string } | null, formData: FormData) {
  const identity = await getIdentity();
  if (!identity || identity.provider !== "clerk" || !identity.orgId) redirect("/sign-in");
  if (identity.tenantId) redirect("/");
  const edition = editionFor(isEditionKey(formData.get("edition")) ? formData.get("edition") : "bison");
  if (identity.orgRole !== "org:admin") return { ok: false, message: `Only an admin of this organization can set up its ${edition.productName} account.` };

  const { currentUser } = await import("@clerk/nextjs/server");
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) return { ok: false, message: "Your Clerk account has no email address. Add one and try again." };

  const picked = String(formData.get("industry") ?? "");
  const industry = edition.industries.includes(picked) && picked in INDUSTRIES ? picked : edition.industries[0];
  try {
    await createTenant({
      name: String(formData.get("name") ?? ""),
      domain: String(formData.get("domain") ?? ""),
      industry,
      edition: edition.key,
      clerkOrgId: identity.orgId,
      owner: { userId: identity.userId, email, name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") },
    });
  } catch (err) {
    if (err instanceof TenantInputError) return { ok: false, message: err.message };
    throw err;
  }
  redirect("/analyze");
}
