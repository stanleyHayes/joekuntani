import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Shared with the public site as TypeScript source, so neither app keeps its
  // own drifting fork of the controls both use.
  transpilePackages: ["@joe-kuntani/shared"],
  async rewrites() {
    const apiBase = process.env.API_BASE_URL;
    const adminRoutes = [
      // The standalone app owns the admin origin, but the platform's URL
      // contract remains `/admin/*`. Its App Router tree is rooted at `/`, so
      // preserve the browser URL and resolve that prefix internally instead of
      // rewriting every navigation link, auth redirect and deep-link helper.
      { source: "/admin", destination: "/" },
      { source: "/admin/:path*", destination: "/:path*" },
    ];
    if (!apiBase) return adminRoutes;
    // Proxied rather than called cross-origin: the session cookie is set on
    // this host, so the browser only ever talks to its own origin and the
    // cookie needs no cross-site relaxation.
    return [
      ...adminRoutes,
      { source: "/api/admin/:path*", destination: `${apiBase}/api/admin/:path*` },
      { source: "/api/public/:path*", destination: `${apiBase}/api/public/:path*` },
    ];
  },
};

export default nextConfig;
