"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MODE_COOKIE, modeForPath } from "@/config/modes";
import { DEV_PEOPLE, DEV_TENANTS } from "@/lib/auth/dev-people";
import { createDevSession, DEV_SESSION_COOKIE, readDevSession } from "@/lib/auth/dev-session";
import { assertDevAuthAllowed, authProvider, secureCookies } from "@/lib/env";

export async function signInAsDevPerson(formData: FormData) {
  assertDevAuthAllowed();
  const person = DEV_PEOPLE.find((p) => p.userId === formData.get("userId"));
  if (!person) redirect("/sign-in?error=unknown-person");
  const session = createDevSession(person.userId, person.tenantId);
  const jar = await cookies();
  jar.set(DEV_SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: session.maxAge,
  });
  redirect(`/${modeForPath(`/${jar.get(MODE_COOKIE)?.value ?? ""}`) ?? "analyze"}`);
}

export async function signOut() {
  if (authProvider() === "clerk") redirect("/sign-out");
  const jar = await cookies();
  // Back to the sign-in for the edition they were in.
  const tenantId = readDevSession(jar.get(DEV_SESSION_COOKIE)?.value)?.t;
  const fit = Object.values(DEV_TENANTS).find((t) => t.id === tenantId)?.edition === "fit";
  jar.delete(DEV_SESSION_COOKIE);
  redirect(fit ? "/sign-in?edition=fit" : "/sign-in");
}
