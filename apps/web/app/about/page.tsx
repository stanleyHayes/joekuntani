import { getPublicContentBySlug } from "../../components/content/data";
import {
  ContentEmpty,
  contentFooterCta,
} from "../../components/content/public-content";
import styles from "../../components/content/content.module.css";
import { PublicShell } from "../../components/layout/public-shell";
import { contentMetadata } from "../../lib/seo";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return contentMetadata(await getPublicContentBySlug("page", "about"), {
    title: "About",
    description: "Approved biography and profile.",
    path: "/about",
  });
}

export default async function AboutPage() {
  const page = await getPublicContentBySlug("page", "about");
  return (
    <PublicShell currentPath="/about" footerCta={contentFooterCta}>
      <main id="main-content" className={`${styles.detail} shell-container`}>
        <p className="eyebrow">About</p>
        {page ? (
          <>
            <h1>{page.title}</h1>
            {page.summary ? (
              <p className={styles.lede}>{page.summary}</p>
            ) : null}
            <div className={styles.body}>{page.body}</div>
          </>
        ) : (
          <>
            <h1>About Joe Kuntani</h1>
            <ContentEmpty label="The approved biography" />
          </>
        )}
      </main>
    </PublicShell>
  );
}
