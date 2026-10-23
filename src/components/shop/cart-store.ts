"use client";

// The shopper's cart in the browser. Only the cart's id is kept (in this
// browser's storage, per shop); every line and price comes from the server.
import { useSyncExternalStore } from "react";
import type { CartOp, PublicCart } from "@/lib/sales/checkout";

export type CartState = { cart: PublicCart | null; busy: boolean; error: string | null; open: boolean; loaded: boolean };

const EMPTY: CartState = { cart: null, busy: false, error: null, open: false, loaded: false };
const states = new Map<string, CartState>();
const listeners = new Map<string, Set<() => void>>();
const started = new Set<string>();

const storageKey = (slug: string) => `bo-cart:${slug}`;

function readId(slug: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(slug));
  } catch {
    return null;
  }
}

function writeId(slug: string, id: string) {
  try {
    if (id) window.localStorage.setItem(storageKey(slug), id);
    else window.localStorage.removeItem(storageKey(slug));
  } catch {
    // Storage is off in this browser; the cart lasts until the page closes.
  }
}

function set(slug: string, patch: Partial<CartState>) {
  states.set(slug, { ...(states.get(slug) ?? EMPTY), ...patch });
  for (const l of listeners.get(slug) ?? []) l();
}

function subscribe(slug: string, cb: () => void) {
  if (!listeners.has(slug)) listeners.set(slug, new Set());
  listeners.get(slug)!.add(cb);
  if (!started.has(slug)) {
    started.add(slug);
    // Bring back a cart from an earlier visit.
    if (readId(slug)) void changeCart(slug, { op: "view" }, { quiet: true });
    else set(slug, { loaded: true });
  }
  return () => listeners.get(slug)?.delete(cb);
}

/** The id when this browser won't store it. */
const memoryId = new Map<string, string>();

/** Sends one change to the server and keeps what it answers. */
export async function changeCart(slug: string, change: CartOp, opts: { quiet?: boolean; open?: boolean } = {}): Promise<{ ok: boolean; message?: string }> {
  set(slug, { busy: true, error: null });
  const cartId = readId(slug) ?? memoryId.get(slug) ?? null;
  try {
    const res = await fetch(`/p/${slug}/cart`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cartId, change }) });
    const data = (await res.json().catch(() => null)) as { ok: boolean; cart?: PublicCart; message?: string } | null;
    if (!res.ok || !data?.ok || !data.cart) {
      const message = data?.message ?? "Couldn't update your cart. Try again.";
      set(slug, { busy: false, loaded: true, error: opts.quiet ? null : message });
      return { ok: false, message };
    }
    writeId(slug, data.cart.cartId);
    memoryId.set(slug, data.cart.cartId);
    set(slug, { busy: false, loaded: true, cart: data.cart, ...(opts.open ? { open: true } : {}) });
    return { ok: true };
  } catch {
    const message = "Couldn't reach the shop. Check your connection and try again.";
    set(slug, { busy: false, loaded: true, error: opts.quiet ? null : message });
    return { ok: false, message };
  }
}

export const openCart = (slug: string, open = true) => set(slug, { open });

/** Forget the cart on this browser, after an order is placed. */
export function clearCart(slug: string) {
  writeId(slug, "");
  memoryId.set(slug, "");
  set(slug, { cart: null, open: false });
}

export function useCart(slug: string): CartState {
  return useSyncExternalStore(
    (cb) => subscribe(slug, cb),
    () => states.get(slug) ?? EMPTY,
    () => EMPTY,
  );
}
