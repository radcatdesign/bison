// Product-level brand values. White-label agencies will override these per tenant later.
export const BRAND = {
  productName: "Bison Ops",
  shortName: "Bison Ops",
  maker: "Bison by RADCAT",
  defaultAccent: "#3b5bff",
  /** Browser chrome color, matching --bo-canvas in each theme. */
  themeLight: "#f4f5f7",
  themeDark: "#08090b",
} as const;

export const THEME_STORAGE_KEY = "bo-theme";
