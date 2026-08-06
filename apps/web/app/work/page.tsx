import Link from "next/link";
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
  demoWork,
} from "../../lib/demo/content";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";

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
  return has ? pageMetadata(input) : unavailableMetadata(input.title, input.description);
}
export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; tag?: string }>;
}) {
  const filters = await searchParams;
  const itemsRaw = await getPublicContent("portfolio", filters);
  const demo = demoContentEnabled();
  const usingDemo = demo && itemsRaw.length === 0;
  const items = itemsRaw.length
    ? itemsRaw
    : demo
      ? demoWork.filter((item) =>
          filters.category ? item.category === filters.category : true,
        )
      : [];
  const categories = [
    ...new Set(items.map((item) => item.category).filter(Boolean)),
  ] as string[];
  return (
    <PublicShell currentPath="/work" footerCta={contentFooterCta}>
      {usingDemo ? <DemoBanner /> : null}
      <main id="main-content">
        <header className={`${styles.hero} shell-container`}>
          <div>
            <p className="eyebrow">{usingDemo ? "Work · demo" : "Work"}</p>
            <h1>Published work.</h1>
          </div>
          <p className={styles.lede}>
            {usingDemo
              ? "Demo portfolio cards for layout review. Replace every item through the CMS before launch."
              : "Browse projects approved for the public portfolio."}
          </p>
        </header>
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="work-list"
        >
          <h2 id="work-list">Projects</h2>
          {categories.length ? (
            <nav
              className={styles.filters}
              aria-label="Filter work by category"
            >
              <Link href="/work">All</Link>
              {categories.map((category) => (
                <Link
                  href={`/work?category=${encodeURIComponent(category)}`}
                  key={category}
                >
                  {category}
                </Link>
              ))}
            </nav>
          ) : null}
          {items.length ? (
            <ContentGrid
              items={items}
              detailBase="/work"
              covers={usingDemo ? demoCovers : undefined}
            />
          ) : (
            <ContentEmpty label="Portfolio content" />
          )}
        </section>
      </main>
    </PublicShell>
  );
}
