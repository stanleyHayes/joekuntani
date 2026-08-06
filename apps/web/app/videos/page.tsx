import { getPublicContent } from "../../components/content/data";
import {
  ContentEmpty,
  ContentGrid,
  contentFooterCta,
} from "../../components/content/public-content";
import styles from "../../components/content/content.module.css";
import { PublicShell } from "../../components/layout/public-shell";
import { DemoBanner } from "../../components/ui/demo-banner";
import {
  demoContentEnabled,
  demoCovers,
  demoVideos,
} from "../../lib/demo/content";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";

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
  const filters = await searchParams;
  const itemsRaw = await getPublicContent("video", filters);
  const demo = demoContentEnabled();
  const usingDemo = demo && itemsRaw.length === 0;
  const items = itemsRaw.length
    ? itemsRaw
    : demo
      ? demoVideos.filter((item) =>
          filters.category ? item.category === filters.category : true,
        )
      : [];
  return (
    <PublicShell currentPath="/videos" footerCta={contentFooterCta}>
      {usingDemo ? <DemoBanner /> : null}
      <main id="main-content">
        <header className={`${styles.hero} shell-container`}>
          <div>
            <p className="eyebrow">{usingDemo ? "Videos · demo" : "Videos"}</p>
            <h1>Watch.</h1>
          </div>
          <p className={styles.lede}>
            {usingDemo
              ? "Demo video cards for visual review. External sources stay empty until approved."
              : "Only approved videos from verified external sources appear here."}
          </p>
        </header>
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="video-list"
        >
          <h2 id="video-list">Published videos</h2>
          {items.length ? (
            <ContentGrid
              items={items}
              covers={usingDemo ? demoCovers : undefined}
            />
          ) : (
            <ContentEmpty label="Video content" />
          )}
        </section>
      </main>
    </PublicShell>
  );
}
