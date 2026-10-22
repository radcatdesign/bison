import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { BRAND } from "@/config/brand";
import { ROLES } from "@/config/roles";
import { DEV_PEOPLE, devTenantName } from "@/lib/auth/dev-people";
import { authProvider, ConfigError } from "@/lib/env";
import { signInAsDevPerson } from "../actions";
import s from "../sign-in.module.css";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "no-access": "That account isn't an active member of this company. Ask an owner to invite you.",
  pending: "You're in. An owner or admin needs to approve you before you can see this company's data.",
  "unknown-person": "That person isn't in the test data. Pick someone from the list.",
};

async function ErrorNote({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const code = (await searchParams).error;
  const message = typeof code === "string" ? ERRORS[code] : undefined;
  return message ? (
    <p className="notice notice-error" role="alert">
      {message}
    </p>
  ) : null;
}

function DevPicker() {
  return (
    <div className={s.people}>
      <p className={s.lede}>Test sign-in. Pick a person to see Bison Ops the way they would. Real accounts use Clerk.</p>
      <ul className={s.list}>
        {DEV_PEOPLE.map((p) => (
          <li key={p.userId}>
            <form action={signInAsDevPerson}>
              <input type="hidden" name="userId" value={p.userId} />
              <button type="submit" className={s.person} data-testid={`sign-in-${p.userId}`}>
                <span className={s.personName}>{p.name}</span>
                <span className="label">
                  {ROLES[p.role].label} at {devTenantName(p.tenantId)}
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Which sign-in to show depends on runtime env, so it's decided per request, not at build.
async function SignInBody() {
  await connection();
  let provider: "clerk" | "dev" | "misconfigured" = "misconfigured";
  let configMessage = "";
  try {
    provider = authProvider();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    configMessage = err.message;
  }

  if (provider === "clerk") return <SignIn />;
  if (provider === "dev") return <DevPicker />;
  return <p className="notice notice-error">{configMessage}</p>;
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in/[[...sign-in]]">) {
  return (
    <main className={s.page}>
      <div className={s.card}>
        <h1 className={s.title}>{BRAND.productName}</h1>
        <Suspense>
          <ErrorNote searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<p className="label">Loading sign-in</p>}>
          <SignInBody />
        </Suspense>
      </div>
    </main>
  );
}
