"use client";

// Forgets the cart on this browser once its order is placed.
import { useEffect } from "react";
import { clearCart } from "./cart-store";

export function ClearCart({ slug }: { slug: string }) {
  useEffect(() => clearCart(slug), [slug]);
  return null;
}
