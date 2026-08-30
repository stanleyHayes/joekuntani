import { cache } from "react";

type PublicMediaAsset = {
  id?: string;
  status?: string;
  mime_type?: string;
  public_url?: string;
  alt_text?: string;
  width?: number;
  height?: number;
};

export type ResolvedPublicImage = {
  id: string;
  url: string;
  alt: string;
  width?: number;
  height?: number;
};

export const publicImage = cache(
  async (assetID: string): Promise<ResolvedPublicImage | undefined> => {
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
      if (url.protocol !== "https:" || url.username || url.password)
        return undefined;
      return {
        id: asset.id || assetID,
        url: url.toString(),
        alt: asset.alt_text?.trim() || "Portfolio image",
        width: asset.width,
        height: asset.height,
      };
    } catch {
      return undefined;
    }
  },
);

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
    return (await publicImage(assetID))?.url;
  },
);

export async function publicImages(assetIDs: string[]) {
  const images = await Promise.all(
    assetIDs.map((assetID) => publicImage(assetID)),
  );
  return images.filter((image): image is ResolvedPublicImage => Boolean(image));
}

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

/**
 * Cover map for content records, which carry a gallery.
 *
 * Keyed by id, not slug: press items are stored without one, so a slug-keyed
 * map silently matched nothing and left every press card imageless.
 */
export function contentCovers(
  items: { id?: string; gallery_asset_ids?: string[] }[],
) {
  return coverURLs(
    items.map((item) => ({
      key: item.id,
      assetID: item.gallery_asset_ids?.[0],
    })),
  );
}

/** Cover map for events, whose image is a single banner rather than a gallery. */
export function eventCovers(
  events: { id?: string; banner_asset_id?: string }[],
) {
  return coverURLs(
    events.map((event) => ({ key: event.id, assetID: event.banner_asset_id })),
  );
}

export type PublicGalleryAsset = {
  asset_id: string;
  public_url: string;
  alt_text?: string;
  width?: number;
  height?: number;
  tags?: string[];
  created_at?: string;
};

/**
 * Fetches the published gallery: every `ready` image in the gallery folder.
 *
 * Same fail-closed contract as `publicImageURL` — an unreachable API, an
 * unexpected payload, or any URL that is not credential-free HTTPS yields an
 * empty list, and the page renders its empty state rather than a broken grid.
 */
export async function publicGallery(): Promise<PublicGalleryAsset[]> {
  const base = process.env.API_BASE_URL;
  if (!base) return [];
  try {
    const response = await fetch(`${base}/api/public/media/gallery`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      assets?: PublicGalleryAsset[];
    };
    return (payload.assets ?? []).filter((asset) => {
      try {
        const url = new URL(asset.public_url);
        return url.protocol === "https:" && !url.username && !url.password;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}
