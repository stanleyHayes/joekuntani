import type { ContentItem, ContentKind } from "./types";

type Fetcher = typeof fetch;
const kinds = new Set<ContentKind>([
  "page",
  "portfolio",
  "video",
  "press",
  "testimonial",
]);

function validItem(value: unknown, kind: ContentKind): value is ContentItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ContentItem>;
  return (
    item.kind === kind &&
    typeof item.id === "string" &&
    typeof item.revision === "number" &&
    typeof item.title === "string" &&
    (item.status === "published" || item.status === "scheduled") &&
    item.approved === true &&
    Array.isArray(item.tags) &&
    Array.isArray(item.gallery_asset_ids) &&
    Array.isArray(item.results)
  );
}

export async function getPublicContent(
  kind: ContentKind,
  filters: { category?: string; tag?: string; featured?: boolean } = {},
  fetcher: Fetcher = fetch,
): Promise<ContentItem[]> {
  if (!kinds.has(kind)) return [];
  const base = process.env.API_BASE_URL;
  if (!base) return [];
  const query = new URLSearchParams();
  if (filters.category) query.set("category", filters.category);
  if (filters.tag) query.set("tag", filters.tag);
  if (filters.featured) query.set("featured", "true");
  const suffix = query.size ? `?${query.toString()}` : "";
  try {
    const response = await fetcher(
      `${base}/api/public/content/${kind}${suffix}`,
      { cache: "no-store", signal: AbortSignal.timeout(2000) },
    );
    if (!response.ok) return [];
    const body = (await response.json()) as { items?: unknown[] };
    return Array.isArray(body.items)
      ? body.items.filter((item) => validItem(item, kind))
      : [];
  } catch {
    return [];
  }
}

export async function getPublicContentBySlug(
  kind: "page" | "portfolio",
  slug: string,
  fetcher: Fetcher = fetch,
): Promise<ContentItem | null> {
  const base = process.env.API_BASE_URL;
  if (!base || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  try {
    const response = await fetcher(
      `${base}/api/public/content/${kind}/${encodeURIComponent(slug)}`,
      { cache: "no-store", signal: AbortSignal.timeout(2000) },
    );
    if (!response.ok) return null;
    const item = (await response.json()) as unknown;
    return validItem(item, kind) ? item : null;
  } catch {
    return null;
  }
}
