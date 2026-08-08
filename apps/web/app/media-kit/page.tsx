import type { Metadata } from "next";
import Link from "next/link";
import { getPublicSettings } from "../../lib/settings";
import { getMediaKit } from "../../components/public-info/data";
import styles from "../../components/public-info/public-info.module.css";
import { PublicShell } from "../../components/layout/public-shell";
import { contentMetadata, unavailableMetadata } from "../../lib/seo";
import { PublicInfoNav } from "../../components/public-info/public-info-nav";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { page, download } = await getMediaKit();
  if (!page || !download)
    return unavailableMetadata(
      "Media kit",
      "Approved media resources and download status.",
    );
  return contentMetadata(page, {
    title: "Media kit",
    description: "Approved media resources and download status.",
    path: "/media-kit",
  });
}
export default async function MediaKitPage() {
  const shellSettings = await getPublicSettings();
  const { page, download } = await getMediaKit();
  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/media-kit"
      footerCta={{
        href: "/contact",
        label: "Send a media enquiry",
        title: "Need a specific approved asset?",
        description:
          "Use the contact route so the request reaches the appropriate team.",
      }}
    >
      <main id="main-content">
        <header
          className={`${styles.hero} ${styles.mediaHero} shell-container`}
        >
          <div className={styles.heroTitle}>
            <p className="eyebrow">Press resources</p>
            <h1>{page?.title ?? "Media kit"}</h1>
            <span className={styles.heroCode} aria-hidden="true">
              M/K
            </span>
          </div>
          <p className={styles.lede}>
            {page?.summary ??
              "Approved media-kit copy and downloads have not been published."}
          </p>
        </header>
        <div className="shell-container">
          <PublicInfoNav currentPath="/media-kit" />
        </div>
        <section
          className={`${styles.section} ${styles.mediaSection} shell-container`}
          aria-labelledby="media-download"
        >
          <div className={styles.sectionIntro}>
            <p className={styles.sectionIndex}>Press desk / 01</p>
            <h2 id="media-download">One source, ready to publish.</h2>
            <p>
              The current approved biography, credits and press-ready material
              live in one controlled document.
            </p>
          </div>
          {download ? (
            <article className={styles.mediaDownload}>
              <div className={styles.documentPreview} aria-hidden="true">
                <span>Official</span>
                <strong>JK</strong>
                <small>Media kit · {download.version}</small>
              </div>
              <div className={styles.documentCopy}>
                <p className={styles.documentType}>Approved PDF</p>
                <h3>{download.title}</h3>
                <dl className={styles.meta}>
                  <div>
                    <dt>Version</dt>
                    <dd>{download.version}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>
                      <time dateTime={download.updatedAt}>
                        {new Intl.DateTimeFormat("en", {
                          dateStyle: "long",
                          timeZone: "UTC",
                        }).format(new Date(download.updatedAt))}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt>Format</dt>
                    <dd>PDF document</dd>
                  </div>
                </dl>
                <a
                  className={styles.download}
                  href={download.href}
                  rel="noopener noreferrer nofollow"
                >
                  <span>Download approved PDF</span>
                  <span aria-hidden="true">↘</span>
                </a>
              </div>
            </article>
          ) : (
            <article className={styles.mediaPending}>
              <div className={styles.pendingMark} aria-hidden="true">
                <span>JK</span>
                <small>PRESS / 00</small>
              </div>
              <div className={styles.pendingCopy}>
                <p className={styles.documentType}>Press desk update</p>
                <h3>The next approved edition is being prepared.</h3>
                <p>
                  Need Joe for an event or campaign? Start with the booking
                  brief. For biographies, images or credits, send the press desk
                  the exact asset you need.
                </p>
                <div className={styles.pendingActions}>
                  <Link href="/book">
                    Book Joe <span aria-hidden="true">↗</span>
                  </Link>
                  <Link href="/contact">Request a press asset</Link>
                </div>
              </div>
              <p className={styles.pendingStatus}>
                <span /> Download offline
              </p>
            </article>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
