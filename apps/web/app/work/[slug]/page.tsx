import { Markdown } from "@joe-kuntani/shared/ui/markdown";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublicContentBySlug } from "../../../components/content/data";
import { ContentSections } from "../../../components/content/sections";
import { contentFooterCta } from "../../../components/content/public-content";
import styles from "../../../components/content/content.module.css";
import { PublicShell } from "../../../components/layout/public-shell";
import { DemoBanner } from "../../../components/ui/demo-banner";
import {
  demoContentEnabled,
  demoCovers,
  demoWork,
} from "../../../lib/demo/content";
import { canonicalURL, contentMetadata, jsonLd } from "../../../lib/seo";
import { coverURLs, publicImages } from "../../../lib/media";
import { getPublicSettings } from "../../../lib/settings";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const item =
    (await getPublicContentBySlug("portfolio", slug)) ||
    (demoContentEnabled()
      ? demoWork.find((entry) => entry.slug === slug) || null
      : null);
  return contentMetadata(item, {
    title: "Work not found",
    description: "The requested published work is unavailable.",
    path: `/work/${slug}`,
  });
}

export default async function WorkDetailPage({ params }: Props) {
  const { slug } = await params;
  const [cmsItem, settings] = await Promise.all([
    getPublicContentBySlug("portfolio", slug),
    getPublicSettings(),
  ]);
  const demo = demoContentEnabled();
  const demoItem =
    demo && !cmsItem
      ? demoWork.find((entry) => entry.slug === slug) || null
      : null;
  const item = cmsItem || demoItem;
  if (!item) notFound();
  const usingDemo = Boolean(demoItem);
  const gallery = await publicImages(item.gallery_asset_ids ?? []);
  const cover = gallery[0]?.url ?? (demoItem ? demoCovers[slug] : undefined);
  const hasSections = Boolean(item.sections?.length);
  const sectionImages = await coverURLs(
    (item.sections ?? []).flatMap((section) =>
      (section.asset_ids ?? []).map((assetID) => ({ key: assetID, assetID })),
    ),
  );
  const url = canonicalURL(
    item.seo.canonical_url || `/work/${slug}`,
    settings?.seo.canonical_base,
  );
  return (
    <PublicShell
      settings={settings}
      currentPath="/work"
      footerCta={contentFooterCta}
    >
      {usingDemo ? <DemoBanner /> : null}
      {url && !usingDemo ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              "@context": "https://schema.org",
              "@type": "CreativeWork",
              name: item.title,
              description: item.summary || undefined,
              url,
              datePublished: item.published_at,
              dateModified: item.updated_at,
            }),
          }}
        />
      ) : null}
      <main id="main-content" className={styles.workDetail}>
        <header className={`${styles.workDetailHero} shell-container`}>
          <nav className={styles.detailBack} aria-label="Breadcrumb">
            <Link href="/work">Work index</Link>
            <span aria-hidden="true">/</span>
            <span>{item.category || "Case study"}</span>
          </nav>
          <div className={styles.detailTitleBlock}>
            <p className="eyebrow">
              {usingDemo ? "Demo case study" : item.category || "Work"}
            </p>
            <h1>{item.title}</h1>
          </div>
          {item.summary ? (
            <p className={styles.detailSummary}>{item.summary}</p>
          ) : null}
        </header>
        {cover ? (
          <figure className={`${styles.workDetailMedia} shell-container`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt={gallery[0]?.alt || `Visual for ${item.title}`}
              width={1600}
              height={1000}
            />
            <figcaption>
              <span>
                {String(item.category || "Selected work").toUpperCase()}
              </span>
              <span>{usingDemo ? "Demo media" : "Project archive"}</span>
            </figcaption>
          </figure>
        ) : null}
        {!hasSections && gallery.length > 1 ? (
          <section
            className={`${styles.detailGallery} shell-container`}
            aria-labelledby="project-gallery"
          >
            <div className={styles.detailGalleryHeading}>
              <span>Archive</span>
              <h2 id="project-gallery">Project gallery</h2>
              <p>{gallery.length} images from the original project.</p>
            </div>
            <div className={styles.detailGalleryGrid}>
              {gallery.slice(1).map((image, index) => (
                <figure key={image.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.alt}
                    width={image.width || 1200}
                    height={image.height || 900}
                    loading="lazy"
                  />
                  <figcaption>{String(index + 2).padStart(2, "0")}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}
        {hasSections ? (
          <section className={`${styles.detailSections} shell-container`}>
            <ContentSections
              sections={item.sections}
              body={item.body}
              resolveImage={(assetID) => sectionImages[assetID]}
              variant="about"
            />
          </section>
        ) : (
          <section className={`${styles.detailNarrative} shell-container`}>
            <div>
              <span>01</span>
              <h2>The work</h2>
            </div>
            <Markdown className={styles.detailBody}>{item.body}</Markdown>
          </section>
        )}
        {item.results.length ? (
          <section
            className={`${styles.detailResults} shell-container`}
            aria-labelledby="results"
          >
            <div>
              <span>02</span>
              <h2 id="results">What changed</h2>
            </div>
            <ul>
              {item.results.map((result) => (
                <li key={`${result.label}-${result.value}`}>
                  <strong>{result.value}</strong>
                  <span>{result.label}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </PublicShell>
  );
}
