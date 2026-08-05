import type { PublicService } from "./types";

type Fetcher = typeof fetch;

export async function getPublicServices(
  fetcher: Fetcher = fetch,
): Promise<PublicService[]> {
  const base = process.env.API_BASE_URL;
  if (!base) return [];
  try {
    const response = await fetcher(`${base}/api/public/services`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { items?: PublicService[] };
    if (!Array.isArray(body.items)) return [];
    return body.items
      .filter(
        (item) =>
          item.active &&
          item.cta?.href === "/book" &&
          typeof item.slug === "string",
      )
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order ||
          left.name.localeCompare(right.name),
      );
  } catch {
    return [];
  }
}
