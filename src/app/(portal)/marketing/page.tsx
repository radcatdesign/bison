import type { Metadata } from "next";
import { Suspense } from "react";
import { ModulePage } from "@/components/module-page";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Marketing" };

const PLANNED = [
  { title: "Newsletters", body: "Build an email on the email itself. Photos, cards, buttons, a test send, and scheduling up to 30 days out." },
  { title: "Email series", body: "Emails that go out a set number of days after someone joins, sends a form, or leaves a cart." },
  { title: "Subscribers", body: "Everyone on your list, with one-click unsubscribe that stops every scheduled email." },
  { title: "Brand kit", body: "Your logo, colors, fonts and sign-off, used in every email." },
  { title: "Welcome offer", body: "An optional one-time code for first-time buyers who sign up." },
  { title: "Search pack", body: "Titles, social cards, sitemaps and llms.txt built from your own content." },
];

export default function MarketingPage() {
  return (
    <Suspense fallback={<PageHeader title="Marketing" />}>
      <ModulePage mode="marketing" title="Marketing" note="Email your list from your own domain, in your own colors." planned={PLANNED} />
    </Suspense>
  );
}
