"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect } from "react";

export function SignOutRedirect() {
  const clerk = useClerk();
  useEffect(() => {
    void clerk.signOut({ redirectUrl: "/sign-in" });
  }, [clerk]);
  return <p className="label">Signing you out</p>;
}
