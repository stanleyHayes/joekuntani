/**
 * Shared content types, transport and routing.
 *
 * The editor moved out of a dialog and onto its own route, so the library list
 * and the editor are now separate route trees that still speak to the same
 * endpoints and have to agree on where an item is edited. This module is what
 * they share.
 */

import type {
  ContentDraft,
  ContentItem,
  ContentKind,
} from "@joe-kuntani/shared/types/content";

export type StaffRole =
  | "administrator"
  | "content_editor"
  | "booking_manager"
  | "analyst";

export type MediaOption = {
  id: string;
  filename: string;
  alt_text: string;
  status: string;
  /** Lets a saved gallery id render as its actual picture rather than a
      placeholder, so an operator can see what they are replacing. */
  public_url?: string;
};

export type CacheInvalidationRequest = {
  contentID: string;
  revision: number;
  kind: ContentKind;
  slug: string;
  paths: string[];
  tags: string[];
  reason: "publish" | "schedule" | "unpublish";
};

/** Plural for the library filter, singular for an editor heading. */
export const contentKinds: {
  value: ContentKind;
  label: string;
  one: string;
}[] = [
  { value: "page", label: "Pages", one: "Page" },
  { value: "portfolio", label: "Portfolio", one: "Portfolio piece" },
  { value: "video", label: "Videos", one: "Video" },
  { value: "press", label: "Press", one: "Press item" },
  { value: "testimonial", label: "Testimonials", one: "Testimonial" },
];

export function isContentKind(value: string): value is ContentKind {
  return contentKinds.some((entry) => entry.value === value);
}

export function kindLabel(kind: ContentKind) {
  return contentKinds.find((entry) => entry.value === kind)?.one ?? "Content";
}

/** Where the editor for an item lives. `new` is an item that has no id yet. */
export function contentEditorHref(kind: ContentKind, id: string) {
  return `/content/${kind}/${id ? encodeURIComponent(id) : "new"}`;
}

export function blank(kind: ContentKind): ContentDraft {
  return {
    kind,
    slug: "",
    title: "",
    summary: "",
    body: "",
    category: "",
    tags: [],
    featured: false,
    gallery_asset_ids: [],
    results: [],
    sections: [],
    external_url: "",
    embed_url: "",
    video_asset_id: "",
    outlet: "",
    person_name: "",
    person_title: "",
    organization: "",
    seo: {
      title: "",
      description: "",
      canonical_url: "",
      social_image_asset_id: "",
    },
  };
}

/** The editable half of a saved item — status, revision and audit stay behind. */
export function draftOf(item: ContentItem): ContentDraft {
  return {
    kind: item.kind,
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    body: item.body,
    category: item.category,
    tags: item.tags,
    featured: item.featured,
    gallery_asset_ids: item.gallery_asset_ids,
    results: item.results,
    sections: item.sections ?? [],
    external_url: item.external_url,
    embed_url: item.embed_url,
    video_asset_id: item.video_asset_id,
    outlet: item.outlet,
    person_name: item.person_name,
    person_title: item.person_title,
    organization: item.organization,
    seo: item.seo,
  };
}

export function split(value: string, separator: string) {
  return value
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function toLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** A stored instant as an operator would say it: "12 Sept 2026, 18:00". */
export function whenLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function completeness(draft: ContentDraft) {
  const missing: string[] = [];
  if (!draft.title.trim()) missing.push("title");
  if (!draft.summary?.trim()) missing.push("summary");
  if (!draft.body?.trim() && !draft.sections?.length && draft.kind !== "video")
    missing.push("body or page sections");
  if (draft.kind === "portfolio" && !draft.category?.trim())
    missing.push("category");
  if (
    draft.kind === "video" &&
    !draft.video_asset_id?.trim() &&
    !draft.embed_url?.trim()
  )
    missing.push("Bunny video or legacy embed URL");
  if (draft.kind === "press" && !draft.outlet?.trim()) missing.push("outlet");
  if (draft.kind === "testimonial" && !draft.person_name?.trim())
    missing.push("person name");
  return missing;
}

export function csrfCookie() {
  const prefix = "jk_admin_csrf=";
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return value ? decodeURIComponent(value) : "";
}

export function mutationHeaders() {
  return {
    "Content-Type": "application/json",
    "X-CSRF-Token": csrfCookie(),
  };
}

export function invalidationFor(
  item: ContentItem,
  reason: CacheInvalidationRequest["reason"],
): CacheInvalidationRequest {
  const collectionPath =
    item.kind === "portfolio"
      ? "/work"
      : item.kind === "video"
        ? "/videos"
        : item.kind === "press"
          ? "/press"
          : "/";
  const paths = new Set([collectionPath]);
  if (item.slug)
    paths.add(
      item.kind === "portfolio"
        ? `/work/${item.slug}`
        : item.kind === "page"
          ? `/${item.slug}`
          : collectionPath,
    );
  return {
    contentID: item.id,
    revision: item.revision,
    kind: item.kind,
    slug: item.slug ?? "",
    paths: [...paths],
    tags: ["public-content", `content:${item.kind}`, `content:${item.id}`],
    reason,
  };
}

export async function refreshPublishedContent(
  request: CacheInvalidationRequest,
) {
  const response = await fetch("/api/admin/cms/cache-invalidation", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfCookie(),
    },
    body: JSON.stringify({
      content_id: request.contentID,
      revision: request.revision,
      kind: request.kind,
      slug: request.slug,
      action: request.reason,
      paths: request.paths,
      tags: request.tags,
    }),
  });
  if (response.ok) return;
  // The reasons differ in what the operator should do — an unconfigured
  // deployment needs an administrator, a rejected payload needs a retry — so
  // the server's own wording is carried through rather than flattened.
  const detail = await response
    .json()
    .then((body: { title?: string }) => body?.title ?? "")
    .catch(() => "");
  throw new Error(detail || "Public content refresh failed");
}
