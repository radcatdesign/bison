import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        // Nothing here may be framed by another site (clickjacking).
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
      {
        // The page editor's preview: always sandboxed with no origin of its own,
        // even if someone opens or frames it directly. Later rules win for the same header.
        source: "/page-frame",
        headers: [{ key: "Content-Security-Policy", value: "sandbox allow-scripts; frame-ancestors 'self'" }],
      },
      {
        // That sandboxed preview has no origin, so fonts need CORS to load in it.
        // These are public build files anyway.
        source: "/_next/static/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
