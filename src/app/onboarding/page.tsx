import { CreateOrganization } from "@clerk/nextjs";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getIdentity } from "@/lib/auth/identity";
import { BRAND } from "@/config/brand";
import { INDUSTRIES } from "@/lib/sample/industries";
import { OnboardingForm } from "./form";
import s from "../sign-in/sign-in.module.css";

export const metadata: Metadata = { title: "Set up your account" };

async function Step() {
  const identity = await getIdentity();
  if (!identity) redirect("/sign-in");
  if (identity.provider !== "clerk") redirect("/");
  if (identity.tenantId) redirect("/");

  if (!identity.orgId) {
    return (
      <>
        <p className={s.lede}>First, name your company. You can invite your team after.</p>
        <CreateOrganization afterCreateOrganizationUrl="/onboarding" skipInvitationScreen />
      </>
    );
  }
  const industries = Object.entries(INDUSTRIES).map(([value, p]) => ({ value, label: p.label }));
  return <OnboardingForm industries={industries} />;
}

export default function OnboardingPage() {
  return (
    <main className={s.page}>
      <div className={s.card}>
        <h1 className={s.title}>{BRAND.productName}</h1>
        <Suspense fallback={<p className="label">Loading</p>}>
          <Step />
        </Suspense>
      </div>
    </main>
  );
}
