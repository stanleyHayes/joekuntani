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
  if (!item) return unavailableMetadata(fallback.title, fallback.description);
  const settings = await getPublicSettings();
  const canonical = canonicalURL(
    item.seo.canonical_url || fallback.path,
    settings?.seo.canonical_base,
  );
  const image = await publicImage(item.seo.social_image_asset_id);
  const title = item.seo.title.trim() || item.title;
  const description =
    item.seo.description.trim() || item.summary?.trim() || fallback.description;
  return {
    title,
    description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      images: image ? [{ url: image }] : undefined,
    },
  };
}

export async function pageMetadata(input: {
  title: string;
  description: string;
  path: string;
  socialImageAssetID?: string;
}): Promise<Metadata> {
  const settings = await getPublicSettings();
  const canonical = canonicalURL(input.path, settings?.seo.canonical_base);
  const image =
    (await publicImage(input.socialImageAssetID ?? "")) ??
    (await publicImage(settings?.seo.social_image_asset_id ?? ""));
  return {
    title: input.title,
    description: input.description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      type: "website",
      title: input.title,
      description: input.description,
      url: canonical,
      images: image ? [{ url: image }] : undefined,
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

async function publicImage(assetID: string): Promise<string | undefined> {
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
