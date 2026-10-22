"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MODE_COOKIE, modeForPath } from "@/config/modes";
import { DEV_PEOPLE } from "@/lib/auth/dev-people";
import { createDevSession, DEV_SESSION_COOKIE } from "@/lib/auth/dev-session";
import { assertDevAuthAllowed, authProvider } from "@/lib/env";

export async function signInAsDevPerson(formData: FormData) {
  assertDevAuthAllowed();
  const person = DEV_PEOPLE.find((p) => p.userId === formData.get("userId"));
  if (!person) redirect("/sign-in?error=unknown-person");
  const session = createDevSession(person.userId, person.tenantId);
  const jar = await cookies();
  jar.set(DEV_SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://"),
    path: "/",
    maxAge: session.maxAge,
  });
  redirect(`/${modeForPath(`/${jar.get(MODE_COOKIE)?.value ?? ""}`) ?? "analyze"}`);
}

export async function signOut() {
  if (authProvider() === "clerk") redirect("/sign-out");
  (await cookies()).delete(DEV_SESSION_COOKIE);
  redirect("/sign-in");
}
