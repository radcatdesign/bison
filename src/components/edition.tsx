"use client";

// The company's edition, for browser components: `const say = useSay()` then
// `say("Products", "Memberships")`. Set once by the shell from the session.
import { createContext, type ReactNode, useContext } from "react";
import { type Edition, type EditionKey, editionFor, type Say, sayFor } from "@/config/editions";

const EditionContext = createContext<EditionKey>("bison");

export function EditionProvider({ edition, children }: { edition: EditionKey; children: ReactNode }) {
  return <EditionContext.Provider value={edition}>{children}</EditionContext.Provider>;
}

export const useEditionKey = (): EditionKey => useContext(EditionContext);
export const useEdition = (): Edition => editionFor(useContext(EditionContext));
export const useSay = (): Say => sayFor(useContext(EditionContext));
