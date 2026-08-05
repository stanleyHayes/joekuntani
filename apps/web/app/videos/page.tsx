import { getPublicContent } from "../../components/content/data";
import {
  ContentEmpty,
  ContentGrid,
  contentFooterCta,
} from "../../components/content/public-content";
import styles from "../../components/content/content.module.css";
import { PublicShell } from "../../components/layout/public-shell";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const items = await getPublicContent("video");
  const input = {
    title: "Videos",
    description: "Approved video appearances and work.",
    path: "/videos",
  };
  return items.length
    ? pageMetadata(input)
    : unavailableMetadata(input.title, input.description);
}
export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const filters = await searchParams;
  const items = await getPublicContent("video", filters);
  return (
    <PublicShell currentPath="/videos" footerCta={contentFooterCta}>
      <main id="main-content">
        <header className={`${styles.hero} shell-container`}>
          <div>
            <p className="eyebrow">Videos</p>
            <h1>Watch.</h1>
          </div>
          <p className={styles.lede}>
            Only approved videos from verified external sources appear here.
          </p>
        </header>
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="video-list"
        >
          <h2 id="video-list">Published videos</h2>
          {items.length ? (
            <ContentGrid items={items} />
          ) : (
            <ContentEmpty label="Video content" />
          )}
        </section>
      </main>
    </PublicShell>
  );
}
