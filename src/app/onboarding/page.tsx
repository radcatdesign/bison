import { CreateOrganization } from "@clerk/nextjs";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getIdentity } from "@/lib/auth/identity";
import { editionFor } from "@/config/editions";
import { requestEdition } from "@/lib/edition";
import { INDUSTRIES } from "@/lib/sample/industries";
import { OnboardingForm } from "./form";
import s from "../sign-in/sign-in.module.css";

export const metadata: Metadata = { title: "Set up your account" };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Step({ searchParams }: { searchParams: Search }) {
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
  const edition = editionFor(await requestEdition((await searchParams).edition));
  const industries = edition.industries.filter((k) => INDUSTRIES[k]).map((value) => ({ value, label: INDUSTRIES[value].label }));
  return (
    <>
      <h1 className={s.title}>{edition.productName}</h1>
      <OnboardingForm edition={edition.key} industries={industries} />
    </>
  );
}

export default function OnboardingPage({ searchParams }: { searchParams: Search }) {
  return (
    <main className={s.page}>
      <div className={s.card}>
        <Suspense fallback={<p className="label">Loading</p>}>
          <Step searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
