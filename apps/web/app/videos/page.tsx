import Link from "next/link";
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
import styles from "../editorial-feed.module.css";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const items = await getPublicContent("video");
  const demo = demoContentEnabled();
  const input = {
    title: "Videos",
    description: "Approved video appearances and work.",
    path: "/videos",
  };
  return items.length || demo
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
  const [itemsRaw, allItemsRaw] = await Promise.all([
    getPublicContent("video", filters),
    getPublicContent("video"),
  ]);
  const demo = demoContentEnabled();
  const usingDemo = demo && itemsRaw.length === 0;
  const items = itemsRaw.length
    ? itemsRaw
    : demo
      ? demoVideos.filter((item) =>
          filters.category ? item.category === filters.category : true,
        )
      : [];
  // Published records carry their own imagery; the demo map is only a
  // fallback for the fixture path.
  const covers = await contentCovers(items);
  const categories = [
    ...new Set(
      (allItemsRaw.length ? allItemsRaw : demo ? demoVideos : [])
        .map((item) => item.category)
        .filter(Boolean),
    ),
  ] as string[];
  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/videos"
      footerCta={contentFooterCta}
    >
      {usingDemo ? <DemoBanner /> : null}
      <main id="main-content" className={styles.page}>
        <header className={`${styles.hero} shell-container`}>
          <p className={styles.kicker}>
            {usingDemo ? "Videos · demo" : "Videos"}
          </p>
          <div className={styles.heroGrid}>
            <h1>Watch Joe work the room.</h1>
            <p className={styles.intro}>
              {usingDemo
                ? "Demo reels and interview cuts for visual review. Verified external links publish through the CMS."
                : "Only approved videos from verified external sources appear here."}
            </p>
          </div>
        </header>

        <section
          className={`${styles.feed} shell-container`}
          aria-labelledby="video-list"
        >
          <div className={styles.feedHead}>
            <div>
              <span>01</span>
              <h2 id="video-list">Selected cuts</h2>
            </div>
            {categories.length ? (
              <nav
                className={styles.filters}
                aria-label="Filter videos by category"
              >
                <Link
                  href="/videos"
                  aria-current={!filters.category ? "page" : undefined}
                >
                  All
                </Link>
                {categories.map((category) => (
                  <Link
                    href={`/videos?category=${encodeURIComponent(category)}`}
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
          {items.length ? (
            <ol className={styles.videoList}>
              {items.map((item, index) => {
                // Published records carry their own imagery; the demo map is
                // only a fallback for the fixture path.
                const cover =
                  covers[item.id] ??
                  (usingDemo && item.slug ? demoCovers[item.slug] : undefined);
                const href = item.external_url || item.embed_url;
                return (
                  <li className={styles.videoCard} key={item.id}>
                    <div className={styles.videoMedia}>
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" width={1600} height={1000} />
                      ) : (
                        <div
                          className={styles.mediaFallback}
                          aria-hidden="true"
                        >
                          JK
                        </div>
                      )}
                      <span className={styles.play} aria-hidden="true">
                        ▶
                      </span>
                      <span className={styles.index}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className={styles.videoCopy}>
                      <p>{item.category || "Video"}</p>
                      <h3>{item.title}</h3>
                      {item.summary ? <span>{item.summary}</span> : null}
                      {href ? (
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
          ) : (
            <ContentEmpty label="Video content" />
          )}
        </section>
      </main>
    </PublicShell>
  );
}
