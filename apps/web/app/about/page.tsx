import { getPublicContentBySlug } from "../../components/content/data";
import {
  ContentEmpty,
  contentFooterCta,
} from "../../components/content/public-content";
import styles from "../../components/content/content.module.css";
import { PublicShell } from "../../components/layout/public-shell";
import { DemoBanner } from "../../components/ui/demo-banner";
import {
  demoAbout,
  demoContentEnabled,
  demoImages,
} from "../../lib/demo/content";
import { contentMetadata } from "../../lib/seo";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const page =
    (await getPublicContentBySlug("page", "about")) ||
    (demoContentEnabled() ? demoAbout : null);
  return contentMetadata(page, {
    title: "About",
    description: "Approved biography and profile.",
    path: "/about",
  });
}

export default async function AboutPage() {
  const pageRaw = await getPublicContentBySlug("page", "about");
  const demo = demoContentEnabled();
  const usingDemo = demo && !pageRaw;
  const page = pageRaw || (demo ? demoAbout : null);
  return (
    <PublicShell currentPath="/about" footerCta={contentFooterCta}>
      {usingDemo ? <DemoBanner /> : null}
      <main id="main-content" className={`${styles.detail} shell-container`}>
        <p className="eyebrow">{usingDemo ? "About · demo" : "About"}</p>
        {page ? (
          <>
            <h1>{page.title}</h1>
            {page.summary ? (
              <p className={styles.lede}>{page.summary}</p>
            ) : null}
            {usingDemo ? (
              <figure className={styles.demoMedia}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={demoImages.about}
                  alt="Demo portrait placeholder. Replace via CMS."
                  width={1200}
                  height={800}
                />
                <figcaption>Demo media — replace via CMS</figcaption>
              </figure>
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
