import type { MetadataRoute } from "next";
import { getPublicSettings } from "../lib/settings";
import { canonicalURL } from "../lib/seo";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getPublicSettings();
  const base = settings?.seo.canonical_base;
  const sitemap = canonicalURL("/sitemap.xml", base);
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] }],
    sitemap,
  };
}
