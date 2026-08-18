import type { MetadataRoute } from "next";
import {
  getPublicContent,
  getPublicContentBySlug,
} from "../components/content/data";
import { canonicalURL } from "../lib/seo";
import { getPublicSettings } from "../lib/settings";
import {
  getContactConfiguration,
  getLegalSurface,
  getMediaKit,
} from "../components/public-info/data";
import { getPublicServices } from "../components/services/data";
import { getPublicEvents } from "../components/events/data";
import { publicGallery } from "../lib/media";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [
    settings,
    pages,
    work,
    videos,
    press,
    events,
    services,
    contact,
    privacy,
    terms,
    mediaKit,
    gallery,
  ] = await Promise.all([
    getPublicSettings(),
    Promise.all(
      ["home", "about", "privacy", "terms"].map((slug) =>
        getPublicContentBySlug("page", slug),
      ),
    ),
    getPublicContent("portfolio"),
    getPublicContent("video"),
    getPublicContent("press"),
    getPublicEvents(),
    getPublicServices(),
    getContactConfiguration(),
    getLegalSurface("privacy"),
    getLegalSurface("terms"),
    getMediaKit(),
    publicGallery(),
  ]);
  const base = settings?.seo.canonical_base;
  if (!canonicalURL("/", base)) return [];
  const pageDates = new Map(
    pages.filter(Boolean).map((page) => [page!.slug, page!.updated_at]),
  );
  const availableRoutes = ["/book"];
  if (work.length) availableRoutes.push("/work");
  if (videos.length) availableRoutes.push("/videos");
  if (press.length) availableRoutes.push("/press");
  if (gallery.length) availableRoutes.push("/media/gallery");
  if (events.state === "ready" && events.data.length)
    availableRoutes.push("/events");
  if (pages[0]) availableRoutes.push("/");
  if (pages[1]) availableRoutes.push("/about");
  if (services.length) availableRoutes.push("/services");
  if (contact && services.length) availableRoutes.push("/contact");
  if (privacy.page) availableRoutes.push("/privacy");
  if (terms.page) availableRoutes.push("/terms");
  if (mediaKit.page && mediaKit.download) availableRoutes.push("/media-kit");
  const entries = availableRoutes.map((path) => ({
    url: canonicalURL(path, base)!,
    lastModified:
      path === "/" || path === "/about"
        ? pageDates.get(path === "/" ? "home" : "about")
        : undefined,
  }));
  for (const item of work) {
    if (!item.slug) continue;
    entries.push({
      url: canonicalURL(`/work/${item.slug}`, base)!,
      lastModified: item.updated_at,
    });
  }
  if (events.state === "ready") {
    for (const event of events.data) {
      entries.push({
        url: canonicalURL(`/events/${event.slug}`, base)!,
        lastModified: event.starts_at,
      });
    }
  }
  return entries;
}
