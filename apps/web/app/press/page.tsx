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
  const items = await getPublicContent("press");
  const input = {
    title: "Press",
    description: "Approved press coverage and appearances.",
    path: "/press",
  };
  return items.length
    ? pageMetadata(input)
    : unavailableMetadata(input.title, input.description);
}
export default async function PressPage() {
  const items = await getPublicContent("press");
  return (
    <PublicShell currentPath="/press" footerCta={contentFooterCta}>
      <main id="main-content">
        <header className={`${styles.hero} shell-container`}>
          <div>
            <p className="eyebrow">Press</p>
            <h1>Coverage.</h1>
          </div>
          <p className={styles.lede}>
            Published references link to their original verified sources.
          </p>
        </header>
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="press-list"
        >
          <h2 id="press-list">Press items</h2>
          {items.length ? (
            <ContentGrid items={items} />
          ) : (
            <ContentEmpty label="Press coverage" />
          )}
        </section>
      </main>
    </PublicShell>
  );
}
