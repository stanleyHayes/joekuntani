import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
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
