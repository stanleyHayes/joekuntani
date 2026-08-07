import Link from "next/link";

import { getPublicContentBySlug } from "../../components/content/data";
import {
  ContentEmpty,
  contentFooterCta,
} from "../../components/content/public-content";
import { PublicShell } from "../../components/layout/public-shell";
import { DemoBanner } from "../../components/ui/demo-banner";
import {
  demoAbout,
  demoContentEnabled,
  demoImages,
} from "../../lib/demo/content";
import { contentMetadata } from "../../lib/seo";
import styles from "./about.module.css";

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
      <main id="main-content" className={styles.about}>
        {page ? (
          <>
            <section className={`${styles.hero} shell-container`}>
              <div className={styles.heroCopy}>
                <p className={styles.kicker}>
                  <span>01</span>
                  {usingDemo ? "Meet Joe · demo" : "Meet Joe"}
                </p>
                <h1>{page.title}</h1>
                {page.summary ? (
                  <p className={styles.summary}>{page.summary}</p>
                ) : null}
                <div className={styles.heroActions}>
                  <Link className={styles.primaryAction} href="/book">
                    Book Joe <span aria-hidden="true">↗</span>
                  </Link>
                  <Link className={styles.textAction} href="/work">
                    See the work <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>

              <figure
                className={styles.portrait}
                data-placeholder={usingDemo ? "false" : "true"}
              >
                {usingDemo ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={demoImages.about}
                      alt="Demo portrait placeholder. Replace via CMS."
                      width={1200}
                      height={800}
                    />
                    <figcaption>Demo portrait · replace via CMS</figcaption>
                  </>
                ) : (
                  <div className={styles.brandPortrait}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/brand/logo.jpeg"
                      alt=""
                      aria-hidden="true"
                      width={800}
                      height={800}
                    />
                    <span>{page.title}</span>
                  </div>
                )}
              </figure>
            </section>

            <section
              className={styles.identity}
              aria-label="Joe Kuntani at a glance"
            >
              <div className="shell-container">
                <p>Comedy</p>
                <span aria-hidden="true">×</span>
                <p>Live guitar</p>
                <span aria-hidden="true">×</span>
                <p>Original songs</p>
              </div>
            </section>

            <section className={`${styles.story} shell-container`}>
              <aside className={styles.storyLabel}>
                <span>02</span>
                <p>The story so far</p>
              </aside>
              <article className={styles.storyBody}>
                <p className={styles.pullQuote}>
                  Not a comic with background music. Not a musician waiting for
                  the punchline.
                </p>
                {page.body ? (
                  <div className={styles.body}>{page.body}</div>
                ) : null}
              </article>
            </section>

            <section className={`${styles.closing} shell-container`}>
              <p className={styles.kicker}>
                <span>03</span>
                Next up
              </p>
              <div>
                <h2>Bring Joe into the room.</h2>
                <Link className={styles.primaryAction} href="/book">
                  Start an enquiry <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </section>
          </>
        ) : (
          <section className={`${styles.empty} shell-container`}>
            <p className={styles.kicker}>
              <span>01</span>
              About
            </p>
            <h1>About Joe Kuntani</h1>
            <ContentEmpty label="The approved biography" />
          </section>
        )}
      </main>
    </PublicShell>
  );
}
