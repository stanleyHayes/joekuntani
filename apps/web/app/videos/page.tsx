import Link from "next/link";
import type { CSSProperties } from "react";
import { getPublicSettings } from "../../lib/settings";
import { getPublicContent } from "../../components/content/data";
import {
  ContentEmpty,
  contentFooterCta,
} from "../../components/content/public-content";
import { PublicShell } from "../../components/layout/public-shell";
import { DemoBanner } from "../../components/ui/demo-banner";
import {
  demoContentEnabled,
  demoCovers,
  demoVideos,
} from "../../lib/demo/content";
import { contentCovers } from "../../lib/media";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";
import {
  aspectRatioStyle,
  getPublicVideos,
  socialPlatform,
  videosForContent,
  type PublicVideo,
  type VideoPlatform,
} from "../../components/video/video-data";
import { VideoPlayer } from "../../components/video/video-player";
import { VideoStructuredData } from "../../components/video/video-structured-data";
import styles from "../editorial-feed.module.css";

export const dynamic = "force-dynamic";

/** One card, whether it came from a CMS entry or straight from the library. */
type FeedEntry = {
  key: string;
  title: string;
  category: string;
  summary?: string;
  href?: string;
  cover?: string;
  stream?: PublicVideo;
  platform: VideoPlatform;
};

const PLATFORM_ORDER: VideoPlatform[] = [
  "youtube",
  "tiktok",
  "instagram",
  "facebook",
  "vimeo",
  "hosted",
  "other",
];

const PLATFORM_NAMES: Record<VideoPlatform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  vimeo: "Vimeo",
  hosted: "Hosted archive",
  other: "More videos",
  "": "More videos",
};
export async function generateMetadata() {
  // Counts the library as well: a site whose videos are all published straight
  // from the workspace has a real page, and marking it unavailable would keep
  // it out of search results.
  const [items, library] = await Promise.all([
    getPublicContent("video"),
    getPublicVideos(),
  ]);
  const demo = demoContentEnabled();
  const input = {
    title: "Videos",
    description: "Approved video appearances and work.",
    path: "/media/videos",
  };
  return items.length || library.length || demo
    ? pageMetadata(input)
    : unavailableMetadata(input.title, input.description);
}
export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const shellSettings = await getPublicSettings();
  const filters = await searchParams;
  const [itemsRaw, allItemsRaw, libraryRaw] = await Promise.all([
    getPublicContent("video", filters),
    getPublicContent("video"),
    getPublicVideos(),
  ]);
  const demo = demoContentEnabled();
  // A published video counts as real content: the fixtures are a fallback for
  // an empty site, not something to show beside actual work.
  const usingDemo = demo && itemsRaw.length === 0 && libraryRaw.length === 0;
  const items = itemsRaw.length
    ? itemsRaw
    : demo && !libraryRaw.length
      ? demoVideos.filter((item) =>
          filters.category ? item.category === filters.category : true,
        )
      : [];
  // Published records carry their own imagery; the demo map is only a
  // fallback for the fixture path.
  const covers = await contentCovers(items);
  const streams = await videosForContent(items);

  // A content entry may already point at a library video through
  // video_asset_id. That video is on the page as part of its entry, so it must
  // not appear a second time on its own.
  const claimed = new Set(Object.values(streams).map((video) => video.id));
  const library = libraryRaw.filter(
    (video) =>
      !claimed.has(video.id) &&
      (!filters.category || video.category === filters.category),
  );

  const entries: FeedEntry[] = [
    ...items.map((item) => ({
      key: `content:${item.id}`,
      title: item.title,
      category: item.category ?? "",
      summary: item.summary,
      href: item.external_url || item.embed_url,
      cover:
        covers[item.id] ??
        (usingDemo && item.slug ? demoCovers[item.slug] : undefined),
      stream: streams[item.id],
      platform:
        streams[item.id]?.platform ||
        socialPlatform(item.external_url || item.embed_url),
    })),
    ...library.map((video) => ({
      key: `video:${video.id}`,
      title: video.title,
      category: video.category,
      summary: video.description,
      cover: video.thumbnail_url,
      stream: video,
      platform:
        video.platform ||
        (video.source_url ? socialPlatform(video.source_url) : "hosted"),
    })),
  ];
  const platformGroups = PLATFORM_ORDER.map((platform) => ({
    platform,
    items: entries.filter((entry) => (entry.platform || "other") === platform),
  })).filter((group) => group.items.length);

  // Every playable video on the page, whichever source it came from — the
  // structured data used to describe only the ones attached to CMS entries.
  const structuredVideos = entries
    .map((entry) => entry.stream)
    .filter((video): video is PublicVideo => Boolean(video));

  const categories = [
    ...new Set(
      [
        ...(allItemsRaw.length ? allItemsRaw : demo ? demoVideos : []).map(
          (item) => item.category,
        ),
        ...libraryRaw.map((video) => video.category),
      ].filter(Boolean),
    ),
  ] as string[];
  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/media/videos"
      footerCta={contentFooterCta}
    >
      {usingDemo ? <DemoBanner /> : null}
      <VideoStructuredData
        canonicalPath="/media/videos"
        videos={structuredVideos}
      />
      <main id="main-content" className={styles.page}>
        <header className={`${styles.hero} shell-container`}>
          <p className={styles.kicker}>
            {usingDemo ? "Videos · demo" : "Social video library"}
          </p>
          <div className={styles.heroGrid}>
            <h1>Watch Joe across every platform.</h1>
            <p className={styles.intro}>
              {usingDemo
                ? "Demo reels and interview cuts for visual review."
                : "A curated collection from YouTube, TikTok, Instagram and other channels—organised so every story is easy to find."}
            </p>
          </div>
        </header>

        <section
          className={`${styles.feed} shell-container`}
          aria-labelledby="video-list"
        >
          <div className={styles.feedHead}>
            <div>
              <h2 id="video-list">Browse by platform</h2>
            </div>
            {categories.length ? (
              <nav
                className={styles.filters}
                aria-label="Filter videos by category"
              >
                <Link
                  href="/media/videos"
                  aria-current={!filters.category ? "page" : undefined}
                >
                  All
                </Link>
                {categories.map((category) => (
                  <Link
                    href={`/media/videos?category=${encodeURIComponent(category)}`}
                    aria-current={
                      filters.category === category ? "page" : undefined
                    }
                    key={category}
                  >
                    {category}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
          {platformGroups.length ? (
            <div className={styles.platformGroups}>
              {platformGroups.map((group) => (
                <section className={styles.platformGroup} key={group.platform}>
                  <div className={styles.platformHeading}>
                    <h3>{PLATFORM_NAMES[group.platform]}</h3>
                    <span>
                      {group.items.length}{" "}
                      {group.items.length === 1 ? "video" : "videos"}
                    </span>
                  </div>
                  <ol className={styles.videoList}>
                    {group.items.map((item, index) => {
                      const { cover, href, stream } = item;
                      return (
                        <li className={styles.videoCard} key={item.key}>
                          <div
                            className={styles.videoMedia}
                            // The card reserves the video's own shape, so a portrait
                            // clip is not cropped by the frame around it.
                            style={
                              {
                                "--video-aspect": aspectRatioStyle(
                                  stream?.aspect_ratio,
                                ),
                              } as CSSProperties
                            }
                          >
                            {stream ? (
                              <VideoPlayer video={stream} />
                            ) : cover ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={cover}
                                alt=""
                                width={1600}
                                height={1000}
                              />
                            ) : (
                              <div
                                className={styles.mediaFallback}
                                aria-hidden="true"
                              >
                                JK
                              </div>
                            )}
                            {!stream ? (
                              <span className={styles.play} aria-hidden="true">
                                ▶
                              </span>
                            ) : null}
                            <span className={styles.index}>
                              {String(index + 1).padStart(2, "0")}
                            </span>
                          </div>
                          <div className={styles.videoCopy}>
                            <p>
                              {item.category || PLATFORM_NAMES[item.platform]}
                            </p>
                            <h3>{item.title}</h3>
                            {item.summary ? <span>{item.summary}</span> : null}
                            {stream ? (
                              <span className={styles.pendingSource}>
                                {PLATFORM_NAMES[item.platform]}
                              </span>
                            ) : href ? (
                              <a
                                href={href}
                                rel="noopener noreferrer"
                                target="_blank"
                                aria-label={`Watch video: ${item.title}`}
                              >
                                Watch video <span aria-hidden="true">↗</span>
                              </a>
                            ) : (
                              <span className={styles.pendingSource}>
                                Source awaiting approval
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>
          ) : (
            <ContentEmpty label="Video content" />
          )}
        </section>
      </main>
    </PublicShell>
  );
}
