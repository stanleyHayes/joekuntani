import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

import { adminConsoleRedirects } from "./lib/admin-console";

const nextConfig: NextConfig = {
  // Keep the public project independently deployable from the admin workspace.
  poweredByHeader: false,
  reactStrictMode: true,
  // Shared with the console as TypeScript source, so neither app keeps its
  // own drifting fork of the components both render.
  transpilePackages: ["@joe-kuntani/shared"],
  async redirects() {
    return adminConsoleRedirects(process.env.PUBLIC_ADMIN_URL);
  },
  async rewrites() {
    const apiBase = process.env.API_BASE_URL;
    if (!apiBase) return [];
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

export default withSentryConfig(nextConfig, {
  silent: true,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
