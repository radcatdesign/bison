import { redirect } from "next/navigation";
import { clerkConfigured } from "@/lib/env";
import { SignOutRedirect } from "./sign-out";

// Clerk signs out in the browser, so this page hands off to its client helper.
// With the dev sign-in, signing out happens in the server action instead.
export default function SignOutPage() {
  if (!clerkConfigured()) redirect("/sign-in");
  return (
    <main style={{ padding: 32 }}>
      <SignOutRedirect />
    </main>
  );
}
