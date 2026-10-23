import { SignIn } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Bison, Mark } from "@/components/mark";
import { BRAND } from "@/config/brand";
import { ROLES } from "@/config/roles";
import { DEV_PEOPLE, devTenantName } from "@/lib/auth/dev-people";
import { authProvider, ConfigError, demoMode } from "@/lib/env";
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

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function DevPicker({ demo }: { demo: boolean }) {
  return (
    <div className={s.people}>
      <div className={s.formHead}>
        <h1 className={s.formTitle}>{demo ? "Choose who to be" : "Sign in"}</h1>
        <p className={s.lede}>
          {demo
            ? "Pick someone to see Bison Ops the way they would. Two made-up companies, four made-up people, nothing saved."
            : "Test sign-in. Pick a person to see Bison Ops the way they would. Real accounts use Clerk."}
        </p>
      </div>
      <ul className={s.list}>
        {DEV_PEOPLE.map((p) => (
          <li key={p.userId}>
            <form action={signInAsDevPerson}>
              <input type="hidden" name="userId" value={p.userId} />
              <button type="submit" className={s.person} data-testid={`sign-in-${p.userId}`}>
                <span className={s.avatar} aria-hidden="true">
                  {initials(p.name)}
                </span>
                <span className={s.personText}>
                  <span className={s.personName}>{p.name}</span>
                  <span className={s.personRole}>
                    {ROLES[p.role].label} at {devTenantName(p.tenantId)}
                  </span>
                </span>
                <ArrowRight className={s.go} aria-hidden="true" />
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
  if (provider === "dev") return <DevPicker demo={demoMode()} />;
  return <p className="notice notice-error">{configMessage}</p>;
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in/[[...sign-in]]">) {
  return (
    <main className={s.split}>
      <section className={s.brand} aria-hidden="true">
        <div className={s.brandTop}>
          <Bison width={40} />
          <span className={s.brandName}>{BRAND.productName}</span>
        </div>
        <div className={s.brandBody}>
          <p className={s.pitch}>Every visitor, every lead and every sale from your website, in one place.</p>
          <div className={s.preview}>
            <div className={s.previewHead}>
              <span>Visitors</span>
              <span className={s.previewChip}>+13%</span>
            </div>
            <span className={`num ${s.previewNum}`}>2,675</span>
            <svg viewBox="0 0 300 80" className={s.previewLine} preserveAspectRatio="none">
              <defs>
                <linearGradient id="signin-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--bo-accent)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--bo-accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0,58 C20,52 30,40 50,44 C70,48 80,30 100,34 C120,38 130,52 150,46 C170,40 180,20 200,24 C220,28 235,36 250,26 C265,16 280,12 300,8 L300,80 L0,80 Z" fill="url(#signin-fill)" />
              <path d="M0,58 C20,52 30,40 50,44 C70,48 80,30 100,34 C120,38 130,52 150,46 C170,40 180,20 200,24 C220,28 235,36 250,26 C265,16 280,12 300,8" fill="none" stroke="var(--bo-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </div>
        <span className={s.brandFoot}>{BRAND.maker}</span>
      </section>

      <section className={s.formSide}>
        <div className={s.card}>
          <div className={s.mobileBrand}>
            <Mark size={28} />
            <span className={s.brandName}>{BRAND.productName}</span>
          </div>
          <Suspense>
            <ErrorNote searchParams={searchParams} />
          </Suspense>
          <Suspense fallback={<p className="label">Loading sign-in</p>}>
            <SignInBody />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
