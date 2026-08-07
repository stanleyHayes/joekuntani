import { getPublicContent } from "../../components/content/data";
import { getPublicSettings } from "../../lib/settings";
import {
  ContentEmpty,
  contentFooterCta,
} from "../../components/content/public-content";
import { PublicShell } from "../../components/layout/public-shell";
import { DemoBanner } from "../../components/ui/demo-banner";
import {
  demoContentEnabled,
  demoCovers,
  demoPress,
} from "../../lib/demo/content";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";
import styles from "../editorial-feed.module.css";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const items = await getPublicContent("press");
  const demo = demoContentEnabled();
  const input = {
    title: "Press",
    description: "Approved press coverage and appearances.",
    path: "/press",
  };
  return items.length || demo
    ? pageMetadata(input)
    : unavailableMetadata(input.title, input.description);
}
export default async function PressPage() {
  const shellSettings = await getPublicSettings();
  const itemsRaw = await getPublicContent("press");
  const demo = demoContentEnabled();
  const usingDemo = demo && itemsRaw.length === 0;
  const items = itemsRaw.length ? itemsRaw : demo ? demoPress : [];
  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/press"
      footerCta={contentFooterCta}
    >
      {usingDemo ? <DemoBanner /> : null}
      <main id="main-content" className={styles.page}>
        <header
          className={`${styles.hero} ${styles.pressHero} shell-container`}
        >
          <p className={styles.kicker}>
            {usingDemo ? "Press room · demo" : "Press room"}
          </p>
          <div className={styles.heroGrid}>
            <h1>Stories, interviews & appearances.</h1>
            <p className={styles.intro}>
              {usingDemo
                ? "Demo coverage for layout review. Every production reference must retain its verified original source."
                : "Published references link to their original verified sources."}
            </p>
          </div>
        </header>
        <section
          className={`${styles.feed} shell-container`}
          aria-labelledby="press-list"
        >
          <div className={styles.feedHead}>
            <div>
              <span>01</span>
              <h2 id="press-list">Latest coverage</h2>
            </div>
            <p className={styles.issueCount}>
              {String(items.length).padStart(2, "0")} published references
            </p>
          </div>
          {items.length ? (
            <ol className={styles.pressList}>
              {items.map((item, index) => {
                const cover =
                  item.slug && usingDemo ? demoCovers[item.slug] : undefined;
                return (
                  <li className={styles.pressRow} key={item.id}>
                    <span className={styles.pressIndex}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className={styles.pressMedia}>
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" width={1200} height={800} />
                      ) : (
                        <div
                          className={styles.mediaFallback}
                          aria-hidden="true"
                        >
                          JK
                        </div>
                      )}
                    </div>
                    <div className={styles.pressCopy}>
                      <p>{item.outlet || item.category || "Press"}</p>
                      <h3>{item.title}</h3>
                      {item.summary ? <span>{item.summary}</span> : null}
                    </div>
                    {item.external_url ? (
                      <a
                        className={styles.sourceLink}
                        href={item.external_url}
                        rel="noopener noreferrer"
                        target="_blank"
                        aria-label={`Read ${item.title} at the original source`}
                      >
                        ↗
                      </a>
                    ) : (
                      <span className={styles.sourcePending}>
                        Pending source
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <ContentEmpty label="Press coverage" />
          )}
        </section>
      </main>
    </PublicShell>
  );
}
