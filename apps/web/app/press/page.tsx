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
  demoPress,
} from "../../lib/demo/content";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";

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
  const itemsRaw = await getPublicContent("press");
  const demo = demoContentEnabled();
  const usingDemo = demo && itemsRaw.length === 0;
  const items = itemsRaw.length ? itemsRaw : demo ? demoPress : [];
  return (
    <PublicShell currentPath="/press" footerCta={contentFooterCta}>
      {usingDemo ? <DemoBanner /> : null}
      <main id="main-content">
        <header className={`${styles.hero} shell-container`}>
          <div>
            <p className="eyebrow">{usingDemo ? "Press · demo" : "Press"}</p>
            <h1>Coverage.</h1>
          </div>
          <p className={styles.lede}>
            {usingDemo
              ? "Demo press rows for layout only. Links point to example.invalid and must be replaced."
              : "Published references link to their original verified sources."}
          </p>
        </header>
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="press-list"
        >
          <h2 id="press-list">Press items</h2>
          {items.length ? (
            <ContentGrid
              items={items}
              covers={usingDemo ? demoCovers : undefined}
            />
          ) : (
            <ContentEmpty label="Press coverage" />
          )}
        </section>
      </main>
    </PublicShell>
  );
}
