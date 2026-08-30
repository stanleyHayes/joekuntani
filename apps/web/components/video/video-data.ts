export type PublicVideo = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  platform: VideoPlatform;
  source_url: string;
  thumbnail_url: string;
  duration_seconds: number;
  /** "W:H", already resolved by the API. */
  aspect_ratio: string;
  status: "ready";
  visibility: "public" | "unlisted";
  is_published: true;
  created_at: string;
  updated_at: string;
  playback: {
    embed_url: string;
    hls_url: string;
    thumbnail_url: string;
  };
};

export type VideoPlatform =
  | "youtube"
  | "instagram"
  | "tiktok"
  | "facebook"
  | "vimeo"
  | "hosted"
  | "other"
  | "";

export function socialPlatform(value: string | undefined): VideoPlatform {
  if (!value) return "other";
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (
      host === "youtu.be" ||
      host.endsWith(".youtube.com") ||
      host === "youtube.com"
    )
      return "youtube";
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
    if (host === "instagram.com" || host.endsWith(".instagram.com"))
      return "instagram";
    if (
      host === "facebook.com" ||
      host.endsWith(".facebook.com") ||
      host === "fb.watch"
    )
      return "facebook";
    if (host === "vimeo.com" || host.endsWith(".vimeo.com")) return "vimeo";
  } catch {
    return "other";
  }
  return "other";
}

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const ratioPattern = /^[1-9][0-9]{0,4}:[1-9][0-9]{0,4}$/;

/**
 * The CSS `aspect-ratio` value for a video, as "W / H".
 *
 * Anything unrecognised falls back to 16:9 rather than reaching the stylesheet:
 * an invalid value there is silently ignored by the browser, which would
 * collapse the reserved box to nothing and shift the whole page.
 */
export function aspectRatioStyle(value: string | undefined): string {
  if (!value || !ratioPattern.test(value)) return "16 / 9";
  return value.replace(":", " / ");
}

export async function getPublicVideo(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<PublicVideo | null> {
  const base = process.env.API_BASE_URL;
  if (!base || !uuid.test(id)) return null;
  try {
    const response = await fetcher(
      `${base}/api/public/videos/${encodeURIComponent(id)}`,
      { cache: "no-store", signal: AbortSignal.timeout(2500) },
    );
    if (!response.ok) return null;
    const value = (await response.json()) as unknown;
    return validPublicVideo(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The published video library.
 *
 * The videos page was built on CMS entries alone, so a video published in the
 * admin video workspace appeared nowhere: it is a stream, and a stream only
 * reached the page by being attached to a content entry somebody remembered to
 * write. Reading the library directly makes publishing mean what it says.
 *
 * Unlisted videos are excluded here even though the API will serve one by id —
 * that is what unlisted means: reachable by link, absent from the listing.
 */
export async function getPublicVideos(
  fetcher: typeof fetch = fetch,
): Promise<PublicVideo[]> {
  const base = process.env.API_BASE_URL;
  if (!base) return [];
  try {
    const response = await fetcher(`${base}/api/public/videos`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { items?: unknown[] };
    if (!Array.isArray(body.items)) return [];
    return body.items.filter(
      (item): item is PublicVideo =>
        validPublicVideo(item) && item.visibility === "public",
    );
  } catch {
    return [];
  }
}

export async function videosForContent(
  items: { id: string; video_asset_id?: string }[],
  fetcher: typeof fetch = fetch,
) {
  const pairs = await Promise.all(
    items.map(
      async (item) =>
        [
          item.id,
          item.video_asset_id
            ? await getPublicVideo(item.video_asset_id, fetcher)
            : null,
        ] as const,
    ),
  );
  return Object.fromEntries(
    pairs.filter(
      (pair): pair is readonly [string, PublicVideo] =>
        pair[1]?.visibility === "public",
    ),
  );
}

function validPublicVideo(value: unknown): value is PublicVideo {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PublicVideo>;
  if (!item.playback || typeof item.playback !== "object") return false;
  return (
    typeof item.id === "string" &&
    item.status === "ready" &&
    item.is_published === true &&
    (item.visibility === "public" || item.visibility === "unlisted") &&
    typeof item.title === "string" &&
    Array.isArray(item.tags) &&
    optionalSafeURL(item.thumbnail_url) &&
    optionalSafeURL(item.playback.thumbnail_url) &&
    safeEmbed(item.playback.embed_url) &&
    optionalSafeURL(item.playback.hls_url) &&
    (item.source_url === undefined || optionalSafeURL(item.source_url))
  );
}

function optionalSafeURL(value: unknown): value is string {
  return value === "" || safeURL(value);
}

function safeURL(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function safeEmbed(value: unknown): value is string {
  if (!safeURL(value)) return false;
  return new Set([
    "iframe.mediadelivery.net",
    "www.youtube-nocookie.com",
    "www.youtube.com",
    "www.tiktok.com",
    "www.instagram.com",
    "www.facebook.com",
    "player.vimeo.com",
  ]).has(new URL(value).hostname.toLowerCase());
}
