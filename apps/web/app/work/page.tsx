import Link from "next/link";
import { getPublicSettings } from "../../lib/settings";
import { getPublicContent } from "../../components/content/data";
import {
  ContentEmpty,
  contentFooterCta,
} from "../../components/content/public-content";
import { PublicShell } from "../../components/layout/public-shell";
import { DemoBanner } from "../../components/ui/demo-banner";
import type { ContentItem } from "../../components/content/types";
import {
  demoContentEnabled,
  demoCovers,
  demoWork,
} from "../../lib/demo/content";
import { contentCovers } from "../../lib/media";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";
import styles from "./work.module.css";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const items = await getPublicContent("portfolio");
  const demo = demoContentEnabled();
  const has = items.length > 0 || demo;
  const input = {
    title: "Work",
    description: "Approved portfolio projects and results.",
    path: "/work",
  };
  return has
    ? pageMetadata(input)
    : unavailableMetadata(input.title, input.description);
}
export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; tag?: string }>;
}) {
  const shellSettings = await getPublicSettings();
  const filters = await searchParams;
  const [itemsRaw, allItemsRaw] = await Promise.all([
    getPublicContent("portfolio", filters),
    getPublicContent("portfolio"),
  ]);
  const demo = demoContentEnabled();
  const usingDemo = demo && itemsRaw.length === 0;
  const items = itemsRaw.length
    ? itemsRaw
    : demo
      ? demoWork.filter(
          (item) =>
            (filters.category ? item.category === filters.category : true) &&
            (filters.tag ? item.tags.includes(filters.tag) : true),
        )
      : [];
  // Published records carry their own imagery; the demo map is only a
  // fallback for the fixture path.
  const covers = await contentCovers(items);
  const categorySource = allItemsRaw.length
    ? allItemsRaw
    : demo
      ? demoWork
      : [];
  const categories = [
    ...new Set(categorySource.map((item) => item.category).filter(Boolean)),
  ] as string[];
  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/work"
      footerCta={contentFooterCta}
    >
      {usingDemo ? <DemoBanner /> : null}
      <main id="main-content" className={styles.work}>
        <header className={`${styles.hero} shell-container`}>
          <p className={styles.kicker}>
            <span>Portfolio</span>
            <span>{String(items.length).padStart(2, "0")} selected pieces</span>
          </p>
          <div className={styles.heroGrid}>
            <h1>
              Work that
              <span>meets the room.</span>
            </h1>
            <div className={styles.intro}>
              <p>
                {usingDemo
                  ? "A demo selection of live formats and booking contexts. Replace every entry through the CMS before launch."
                  : "Browse projects approved for the public portfolio."}
              </p>
              <a href="#work-list">
                View the work <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
        </header>

        <section
          className={`${styles.projects} shell-container`}
          aria-labelledby="work-list"
        >
          <div className={styles.projectHead}>
            <div>
              <p className={styles.sectionNumber}>01</p>
              <h2 id="work-list">Selected work</h2>
            </div>
            {categories.length ? (
              <nav
                className={styles.filters}
                aria-label="Filter work by category"
              >
                <Link
                  href="/work"
                  aria-current={!filters.category ? "page" : undefined}
                >
                  All
                </Link>
                {categories.map((category) => (
                  <Link
                    href={`/work?category=${encodeURIComponent(category)}`}
                    key={category}
                    aria-current={
                      filters.category === category ? "page" : undefined
                    }
                  >
                    {category}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>

          {items.length ? (
            <ol className={styles.grid}>
              {items.map((item, index) => (
                <WorkCard
                  cover={
                    item.slug
                      ? (covers[item.id] ??
                        (usingDemo ? demoCovers[item.slug] : undefined))
                      : undefined
                  }
                  index={index}
                  item={item}
                  key={item.id}
                />
              ))}
            </ol>
          ) : (
            <ContentEmpty label="Portfolio content" />
          )}
        </section>

        {items.length ? (
          <section className={`${styles.closing} shell-container`}>
            <p className={styles.sectionNumber}>02</p>
            <div>
              <h2>Have a room in mind?</h2>
              <Link href="/book">
                Start an enquiry <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </section>
        ) : null}
      </main>
    </PublicShell>
  );
}

function WorkCard({
  cover,
  index,
  item,
}: {
  cover?: string;
  index: number;
  item: ContentItem;
}) {
  const href = item.slug ? `/work/${item.slug}` : undefined;
  return (
    <li className={styles.card}>
      <div className={styles.media}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={`Visual placeholder for ${item.title}. Replace via CMS.`}
            width={1600}
            height={1000}
          />
        ) : (
          <div className={styles.poster} aria-hidden="true">
            <span>JK</span>
            <i>{String(index + 1).padStart(2, "0")}</i>
          </div>
        )}
        <span className={styles.cardIndex}>
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <div className={styles.cardCopy}>
        <p className={styles.meta}>{item.category || "Published work"}</p>
        <h3>{href ? <Link href={href}>{item.title}</Link> : item.title}</h3>
        {item.summary ? <p className={styles.summary}>{item.summary}</p> : null}
        {href ? (
          <Link className={styles.caseLink} href={href}>
            View case study <span aria-hidden="true">↗</span>
          </Link>
        ) : null}
      </div>
    </li>
  );
}
