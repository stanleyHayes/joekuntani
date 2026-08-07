import { cache } from "react";

export type SettingsLink = { label: string; href: string };
export type SettingsCTA = {
  key: string;
  title: string;
  description: string;
  label: string;
  href: string;
};
export type PublicSettings = {
  navigation: SettingsLink[];
  footer: SettingsLink[];
  ctas: SettingsCTA[];
  contact: { public_email: string; phone: string; location: string };
  social: { platform: string; url: string }[];
  brand: {
    name: string;
    tagline: string;
    logo_asset_id: string;
    favicon_asset_id: string;
  };
  seo: {
    title_template: string;
    default_title: string;
    description: string;
    canonical_base: string;
    social_image_asset_id: string;
  };
  consent: {
    version: string;
    privacy_label: string;
    marketing_label: string;
    privacy_url: string;
  };
};

/**
 * Deduplicated per render pass. `cache: "no-store"` opts out of Next's own
 * fetch memoisation, so the contact page was hitting this endpoint three times
 * for one page — once in `generateMetadata`, then twice more in the page body
 * via `getContactConfiguration()` and this function. Each call carried its own
 * 2s abort, so a cold API had three chances to lose the race and blank the
 * enquiry form. React's `cache` collapses them into one request.
 */
export const getPublicSettings = cache(
  async (): Promise<PublicSettings | null> => {
    const base = process.env.API_BASE_URL;
    if (!base) return null;
    // Two attempts, not one. Settings gate the enquiry form's consent copy, so
    // losing this race doesn't degrade the contact page — it removes the form
    // entirely and tells the visitor enquiries are closed. A single 2s budget
    // was routinely lost to a cold API (first request after an idle pool costs
    // seconds), so the fast path keeps its 2s and a slow one gets one longer
    // retry rather than failing the page outright.
    for (const timeout of [2000, 5000]) {
      try {
        const response = await fetch(`${base}/api/public/settings`, {
          cache: "no-store",
          signal: AbortSignal.timeout(timeout),
        });
        if (!response.ok) return null;
        return (await response.json()) as PublicSettings;
      } catch {
        /* try the longer budget, then give up */
      }
    }
    return null;
  },
);
