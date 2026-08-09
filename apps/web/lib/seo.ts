import type { Metadata } from "next";
import type { ContentItem } from "../components/content/types";
import { getPublicSettings } from "./settings";

type PublicMedia = {
  public_url?: string;
  status?: string;
  mime_type?: string;
};

export async function contentMetadata(
  item: ContentItem | null,
  fallback: { title: string; description: string; path: string },
): Promise<Metadata> {
  // Deliberately NOT unavailableMetadata here. A null item means either the
  // content is unpublished or the API call failed — and the content fetch has a
  // 2s timeout, so a slow response is indistinguishable from missing content.
  // Emitting `noindex` in that case lets one blip de-index the homepage, which
  // search engines honour aggressively and are slow to reverse. A soft-404 body
  // with normal metadata is the far cheaper mistake. Routes that genuinely do
  // not exist still call notFound(); pages that must never be indexed (admin,
  // post-payment) set robots explicitly.
  if (!item)
    return {
      title: fallback.title,
      description: fallback.description,
      keywords: keywordsFor(),
      alternates: { canonical: fallback.path },
    };
  const settings = await getPublicSettings();
  const canonical = canonicalURL(
    item.seo.canonical_url || fallback.path,
    settings?.seo?.canonical_base,
  );
  // Same fallback chain as pageMetadata: an approved upload, then the global
  // one, then the generated brand card. Leaving images undefined here made the
  // home and about pages fall back to Next's file-convention injection, which
  // emitted a request-origin URL and no Twitter card.
  const image =
    (await publicImage(item.seo.social_image_asset_id)) ??
    (await publicImage(settings?.seo?.social_image_asset_id ?? "")) ??
    "/og";
  const title = item.seo.title.trim() || item.title;
  const description =
    item.seo.description.trim() || item.summary?.trim() || fallback.description;
  return {
    title,
    description,
    // A record's tags are the editor's own keywords, so they extend the brand
    // set rather than needing a second field to maintain.
    keywords: keywordsFor(item.tags),
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      type: "website",
      siteName: settings?.brand?.name || "Joe Kuntani",
      locale: "en_GH",
      title,
      description,
      url: canonical,
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

/**
 * Search keywords.
 *
 * The site published none at all. These describe what Joe is actually booked
 * for — the terms someone hiring would type — rather than stuffing synonyms:
 * search engines discount keyword spam, and a booker searching "comedian for
 * corporate event Accra" is worth more than a hundred generic impressions.
 *
 * Global terms apply everywhere; a page adds its own on top.
 */
const BRAND_KEYWORDS = [
  "Joe Kuntani",
  "Numero Uno",
  "Ghanaian comedian",
  "guitar comedian",
  "music comedian",
  "comedy and guitar",
  "live comedy Ghana",
  "Accra comedian",
  "book a comedian in Ghana",
  "corporate MC Ghana",
  "wedding entertainer Ghana",
  "stand-up comedy Accra",
];

export function keywordsFor(extra: readonly string[] = []): string[] {
  // De-duplicated case-insensitively so a page repeating a brand term does not
  // emit it twice.
  const seen = new Map<string, string>();
  for (const keyword of [...BRAND_KEYWORDS, ...extra]) {
    const value = keyword.trim();
    if (value) seen.set(value.toLowerCase(), value);
  }
  return [...seen.values()];
}

export async function pageMetadata(input: {
  title: string;
  description: string;
  path: string;
  socialImageAssetID?: string;
  /** Page-specific terms, added to the brand set. */
  keywords?: readonly string[];
}): Promise<Metadata> {
  const settings = await getPublicSettings();
  const canonical = canonicalURL(input.path, settings?.seo?.canonical_base);
  // Falls back to the generated brand card at /opengraph-image, so a shared
  // link always previews with an image even before real photography is
  // uploaded. Declared explicitly rather than relying on Next's file-convention
  // injection, which does not apply once a route declares its own openGraph.
  const image =
    (await publicImage(input.socialImageAssetID ?? "")) ??
    (await publicImage(settings?.seo?.social_image_asset_id ?? "")) ??
    "/og";
  return {
    title: input.title,
    description: input.description,
    keywords: keywordsFor(input.keywords),
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      type: "website",
      siteName: settings?.brand?.name || "Joe Kuntani",
      locale: "en_GH",
      title: input.title,
      description: input.description,
      url: canonical,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      // summary_large_image only renders a card if an image resolves; without
      // one X falls back to a plain link, so the card type tracks the image.
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: image ? [image] : undefined,
    },
  };
}

export function unavailableMetadata(
  title: string,
  description: string,
): Metadata {
  return { title, description, robots: { index: false, follow: false } };
}

export function canonicalURL(value: string, base?: string): string | undefined {
  try {
    const origin = new URL(base ?? "");
    if (origin.protocol !== "https:" || origin.username || origin.password)
      return undefined;
    const candidate = new URL(value, origin);
    if (
      candidate.protocol !== "https:" ||
      candidate.origin !== origin.origin ||
      candidate.username ||
      candidate.password
    )
      return undefined;
    candidate.hash = "";
    return candidate.toString();
  } catch {
    return undefined;
  }
}

export function jsonLd(value: object) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * The public URL of a ready image asset, or undefined.
 *
 * Exported so the generated share card resolves the brand logo through the
 * same checks the metadata uses — a second resolver would be a second place
 * for the https-and-no-credentials rule to be forgotten.
 */
export async function publicImage(
  assetID: string,
): Promise<string | undefined> {
  const base = process.env.API_BASE_URL;
  if (!base || !assetID) return undefined;
  try {
    const response = await fetch(
      `${base}/api/public/media/assets/${encodeURIComponent(assetID)}`,
      { cache: "no-store", signal: AbortSignal.timeout(2000) },
    );
    if (!response.ok) return undefined;
    const asset = (await response.json()) as PublicMedia;
    if (asset.status !== "ready" || !asset.mime_type?.startsWith("image/"))
      return undefined;
    const url = new URL(asset.public_url ?? "");
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
