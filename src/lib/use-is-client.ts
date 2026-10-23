import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during the server render and hydration, true after. For reading browser-only storage. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
