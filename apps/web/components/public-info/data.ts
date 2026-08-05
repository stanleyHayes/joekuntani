import { getPublicContent, getPublicContentBySlug } from "../content/data";
import type { ContentItem } from "../content/types";
import { getPublicSettings, type PublicSettings } from "../../lib/settings";

export type MediaKitDownload = {
  href: string;
  title: string;
  version: string;
  updatedAt: string;
};
type PublicMediaAsset = {
  id: string;
  public_url: string;
  mime_type: string;
  status: string;
  tags: string[];
  updated_at: string;
};

export type LegalPublication = {
  version: string;
  effectiveDate: string;
  updatedAt: string;
};

const legalSubjects = {
  privacy: [
    "purposes-data-use",
    "lawful-basis",
    "retention",
    "cookies",
    "enquiries",
    "data-subject-rights",
    "contact",
  ],
  terms: ["site-use", "asset-use", "booking-disclaimer", "contact"],
} as const;

export async function getMediaKit(): Promise<{
  page: ContentItem | null;
  download: MediaKitDownload | null;
}> {
  const [page, publications] = await Promise.all([
    getPublicContentBySlug("page", "media-kit"),
    getPublicContent("press", { category: "media-kit-pdf" }),
  ]);
  if (
    page?.status !== "published" ||
    !page.summary?.trim() ||
    !page.body?.trim()
  )
    return { page: null, download: null };
  const publication = publications.find(
    (item) =>
      item.status === "published" && item.gallery_asset_ids.length === 1,
  );
  if (!publication) return { page: null, download: null };
  const asset = await getPublicMediaAsset(publication.gallery_asset_ids[0]);
  const download = approvedPDF(publication, asset);
  return download ? { page, download } : { page: null, download: null };
}

export async function getLegalSurface(slug: "privacy" | "terms") {
  const [page, settings] = await Promise.all([
    getPublicContentBySlug("page", slug),
    getPublicSettings(),
  ]);
  const contactReady = Boolean(settings?.contact.public_email.trim());
  const consentReady =
    slug === "terms" ||
    Boolean(
      settings?.consent.version.trim() && settings.consent.privacy_label.trim(),
    );
  const publication = legalPublication(slug, page);
  const bodyReady = Boolean(page?.body?.trim() && publication);
  return {
    page: page && bodyReady && contactReady && consentReady ? page : null,
    publication:
      page && bodyReady && contactReady && consentReady ? publication : null,
    settings,
    stagingPlaceholder:
      process.env.NODE_ENV !== "production" &&
      (!bodyReady || !contactReady || !consentReady),
  };
}

export async function getContactConfiguration(): Promise<PublicSettings | null> {
  const settings = await getPublicSettings();
  if (
    !settings?.consent.version.trim() ||
    !settings.consent.privacy_label.trim() ||
    settings.consent.privacy_url !== "/privacy"
  )
    return null;
  return settings;
}

function approvedPDF(
  item: ContentItem,
  asset: PublicMediaAsset | null,
): MediaKitDownload | null {
  const allowedHosts = new Set(
    [process.env.API_BASE_URL, process.env.PUBLIC_MEDIA_HOSTS]
      .flatMap((value) => (value ?? "").split(","))
      .map(hostname)
      .filter(Boolean),
  );
  const version = valueTag(item.tags, "version:");
  try {
    const url = new URL(asset?.public_url ?? "");
    if (
      asset &&
      asset.id === item.gallery_asset_ids[0] &&
      asset.status === "ready" &&
      asset.mime_type === "application/pdf" &&
      asset.tags.includes("use-rights:approved") &&
      version &&
      allowedHosts.has(url.hostname) &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname.toLowerCase().endsWith(".pdf") &&
      !Number.isNaN(Date.parse(asset.updated_at))
    )
      return {
        href: url.toString(),
        title: item.title,
        version,
        updatedAt: asset.updated_at,
      };
  } catch {
    // Invalid approved records fail closed rather than exposing an unsafe link.
  }
  return null;
}

async function getPublicMediaAsset(
  id: string,
): Promise<PublicMediaAsset | null> {
  try {
    const response = await fetch(
      `${process.env.API_BASE_URL ?? ""}/api/public/media/assets/${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    return (await response.json()) as PublicMediaAsset;
  } catch {
    return null;
  }
}

function legalPublication(
  slug: "privacy" | "terms",
  page: ContentItem | null,
): LegalPublication | null {
  if (!page || page.status !== "published") return null;
  const version = valueTag(page.tags, "legal-version:");
  const effectiveDate = valueTag(page.tags, "effective-date:");
  if (
    !version ||
    !effectiveDate ||
    !validEffectiveDate(effectiveDate) ||
    Number.isNaN(Date.parse(page.updated_at)) ||
    !legalSubjects[slug].every((subject) =>
      page.tags.includes(`subject:${subject}`),
    )
  )
    return null;
  return { version, effectiveDate, updatedAt: page.updated_at };
}

function validEffectiveDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    value <= new Date().toISOString().slice(0, 10)
  );
}

function valueTag(tags: string[], prefix: string) {
  return tags
    .find((tag) => tag.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
}

function hostname(value: string) {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname;
  } catch {
    return "";
  }
}
