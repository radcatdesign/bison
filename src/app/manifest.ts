import type { MetadataRoute } from "next";
import { BRAND } from "@/config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.productName,
    short_name: BRAND.shortName,
    description: "Your website's visitors, leads and sales in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: BRAND.themeLight,
    theme_color: BRAND.themeLight,
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
