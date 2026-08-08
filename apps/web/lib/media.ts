import { cache } from "react";

type PublicMediaAsset = {
  status?: string;
  mime_type?: string;
  public_url?: string;
};

/**
 * Resolves an approved media asset id to a safe public image URL.
 *
 * Extracted from lib/seo.ts so page bodies can render CMS-managed imagery with
 * the same guarantees the social-card path already had: the asset must be
 * `ready`, must actually be an image, and must resolve to a credential-free
 * HTTPS URL. Anything else fails closed and returns undefined so the caller
 * falls back rather than rendering a broken or unsafe `<img>`.
 *
 * Deduplicated per render pass — a page that resolves the same asset for both
 * its metadata and its body should only ask the API once.
 */
export const publicImageURL = cache(
  async (assetID: string): Promise<string | undefined> => {
    const base = process.env.API_BASE_URL;
    if (!base || !assetID) return undefined;
    try {
      const response = await fetch(
        `${base}/api/public/media/assets/${encodeURIComponent(assetID)}`,
        { cache: "no-store", signal: AbortSignal.timeout(2000) },
      );
      if (!response.ok) return undefined;
      const asset = (await response.json()) as PublicMediaAsset;
      if (asset.status !== "ready" || !asset.mime_type?.startsWith("image/"))
        return undefined;
      const url = new URL(asset.public_url ?? "");
      return url.protocol === "https:" && !url.username && !url.password
        ? url.toString()
        : undefined;
    } catch {
      return undefined;
    }
  },
);

/**
 * Resolves the cover image for a list of records, keyed by slug.
 *
 * Every public listing used to pass `usingDemo ? demoCovers[slug] : undefined`,
 * so a card only ever showed a picture when the page had fallen back to the
 * demo fixtures. Real CMS records carry their own images — a portfolio item's
 * first gallery asset, an event's banner — and nothing resolved them, so
 * published content was permanently imageless no matter what an editor
 * uploaded.
 *
 * Resolution is concurrent and `publicImageURL` is deduplicated per render, so
 * a listing costs one request per distinct asset regardless of how many cards
 * reference it. An id that fails to resolve is simply absent from the map, and
 * the caller falls back to its demo cover or to no image at all.
 */
export async function coverURLs(
  entries: { key?: string; assetID?: string }[],
): Promise<Record<string, string>> {
  const wanted = entries.filter(
    (entry): entry is { key: string; assetID: string } =>
      Boolean(entry.key) && Boolean(entry.assetID),
  );
  const resolved = await Promise.all(
    wanted.map(async (entry) => [
      entry.key,
      await publicImageURL(entry.assetID),
    ]),
  );
  return Object.fromEntries(
    resolved.filter((pair): pair is [string, string] => Boolean(pair[1])),
  );
}

/** Cover map for content records, which carry a gallery. */
export function contentCovers(
  items: { slug?: string; gallery_asset_ids?: string[] }[],
) {
  return coverURLs(
    items.map((item) => ({
      key: item.slug,
      assetID: item.gallery_asset_ids?.[0],
    })),
  );
}

/** Cover map for events, whose image is a single banner rather than a gallery. */
export function eventCovers(
  events: { slug?: string; banner_asset_id?: string }[],
) {
  return coverURLs(
    events.map((event) => ({ key: event.slug, assetID: event.banner_asset_id })),
  );
}
