export type PublicVideo = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  thumbnail_url: string;
  duration_seconds: number;
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

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
    safeURL(item.thumbnail_url) &&
    safeURL(item.playback.thumbnail_url) &&
    safeEmbed(item.playback.embed_url) &&
    safeURL(item.playback.hls_url)
  );
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
  return (
    safeURL(value) && new URL(value).hostname === "iframe.mediadelivery.net"
  );
}
