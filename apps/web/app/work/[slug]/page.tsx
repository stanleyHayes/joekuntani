import { Markdown } from "../../../components/content/markdown";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublicContentBySlug } from "../../../components/content/data";
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
import { publicImageURL } from "../../../lib/media";
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
  // The record's own first gallery image, falling back to the demo cover.
  const cover =
    (await publicImageURL(item.gallery_asset_ids?.[0] ?? "")) ??
    (demoItem ? demoCovers[slug] : undefined);
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
              alt={`Visual placeholder for ${item.title}. Replace via CMS.`}
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
        <section className={`${styles.detailNarrative} shell-container`}>
          <div>
            <span>01</span>
            <h2>The work</h2>
          </div>
          <Markdown className={styles.detailBody}>{item.body}</Markdown>
        </section>
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
