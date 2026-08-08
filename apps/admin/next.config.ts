import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
  // Shared with the public site as TypeScript source, so neither app keeps its
  // own drifting fork of the controls both use.
  transpilePackages: ["@joe-kuntani/shared"],
  async redirects() {
    return [
      // Old links remain usable, but the dedicated admin origin owns clean
      // root-level URLs. Permanent redirects prevent two URLs representing
      // every staff screen.
      { source: "/admin", destination: "/", permanent: true },
      { source: "/admin/:path*", destination: "/:path*", permanent: true },
    ];
  },
  async rewrites() {
    const apiBase = process.env.API_BASE_URL;
    if (!apiBase) return [];
    // Proxied rather than called cross-origin: the session cookie is set on
    // this host, so the browser only ever talks to its own origin and the
    // cookie needs no cross-site relaxation.
    return [
      {
        source: "/api/admin/:path*",
        destination: `${apiBase}/api/admin/:path*`,
      },
      {
        source: "/api/public/:path*",
        destination: `${apiBase}/api/public/:path*`,
      },
    ];
  },
};

export default nextConfig;
