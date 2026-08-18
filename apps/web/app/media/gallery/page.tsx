import { PublicShell } from "../../../components/layout/public-shell";
import {
  ContentEmpty,
  contentFooterCta,
} from "../../../components/content/public-content";
import { publicGallery } from "../../../lib/media";
import { pageMetadata, unavailableMetadata } from "../../../lib/seo";
import { getPublicSettings } from "../../../lib/settings";
import feed from "../../editorial-feed.module.css";
import styles from "./gallery.module.css";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const assets = await publicGallery();
  const input = {
    title: "Gallery",
    description: "Photography from shows, shoots and behind the scenes.",
    path: "/media/gallery",
  };
  return assets.length
    ? pageMetadata(input)
    : unavailableMetadata(input.title, input.description);
}
export default async function GalleryPage() {
  const shellSettings = await getPublicSettings();
  const assets = await publicGallery();
  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/media/gallery"
      footerCta={contentFooterCta}
    >
      <main id="main-content" className={feed.page}>
        <header className={`${feed.hero} ${styles.galleryHero} shell-container`}>
          <p className={feed.kicker}>Gallery</p>
          <div className={feed.heroGrid}>
            <h1>Shows, shoots & scenes.</h1>
            <p className={feed.intro}>
              Published photography from the media library.
            </p>
          </div>
        </header>
        <section
          className={`${feed.feed} shell-container`}
          aria-labelledby="gallery-list"
        >
          <div className={feed.feedHead}>
            <div>
              <span>01</span>
              <h2 id="gallery-list">Latest photography</h2>
            </div>
            <p className={feed.issueCount}>
              {String(assets.length).padStart(2, "0")} published images
            </p>
          </div>
          {assets.length ? (
            <ul className={styles.grid} aria-label="Gallery images">
              {assets.map((asset) => (
                <li className={styles.item} key={asset.asset_id}>
                  {/* CMS-hosted URLs cannot go through next/image. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.public_url}
                    alt={asset.alt_text ?? ""}
                    width={asset.width}
                    height={asset.height}
                    loading="lazy"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ContentEmpty label="Gallery" />
          )}
        </section>
      </main>
    </PublicShell>
  );
}
