import type { Metadata } from "next";
import { getPublicSettings } from "../../lib/settings";
import { getMediaKit } from "../../components/public-info/data";
import styles from "../../components/public-info/public-info.module.css";
import { PublicShell } from "../../components/layout/public-shell";
import { EmptyState } from "../../components/ui/empty-state";
import { contentMetadata, unavailableMetadata } from "../../lib/seo";

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
        <header className={`${styles.hero} shell-container`}>
          <div>
            <p className="eyebrow">Press resources</p>
            <h1>{page?.title ?? "Media kit"}</h1>
          </div>
          <p className={styles.lede}>
            {page?.summary ??
              "Approved media-kit copy and downloads have not been published."}
          </p>
        </header>
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="media-download"
        >
          <h2 id="media-download">Approved download</h2>
          {download ? (
            <div className={styles.panel}>
              <h3>{download.title}</h3>
              <dl className={styles.meta}>
                <dt>Version</dt>
                <dd>{download.version}</dd>
                <dt>Last updated</dt>
                <dd>
                  <time dateTime={download.updatedAt}>
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "long",
                      timeZone: "UTC",
                    }).format(new Date(download.updatedAt))}
                  </time>
                </dd>
              </dl>
              <a
                className={styles.download}
                href={download.href}
                rel="noopener noreferrer nofollow"
              >
                Download approved PDF
              </a>
            </div>
          ) : (
            <div className={styles.notice}>
              <EmptyState
                announce={false}
                tone="media"
                title="No approved media kit to download"
                description="Downloads stay disabled until the asset, its rights, host and update date are all approved. Send a media enquiry to request a specific asset in the meantime."
              />
            </div>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
