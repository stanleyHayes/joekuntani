import { ContentSections } from "../../components/content/sections";
import Link from "next/link";
import { getPublicSettings } from "../../lib/settings";

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
import { coverURLs, publicImageURL } from "../../lib/media";
import { contentMetadata } from "../../lib/seo";
import styles from "./about.module.css";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const page =
    (await getPublicContentBySlug("page", "about")) ||
    (demoContentEnabled() ? demoAbout : null);
  return contentMetadata(page, {
    title: "Joe Kuntani | Ghanaian Guitar Comedian",
    description:
      "Meet Joe Kuntani, the Ghanaian comedian and musician who blends live guitar, original songs and storytelling across stage, film and digital performance.",
    path: "/about",
  });
}

export default async function AboutPage() {
  const shellSettings = await getPublicSettings();
  const pageRaw = await getPublicContentBySlug("page", "about");
  const demo = demoContentEnabled();
  const usingDemo = demo && !pageRaw;
  const page = pageRaw || (demo ? demoAbout : null);
  // The portrait comes from the first gallery asset on the About page record,
  // which the admin content editor already manages. Before this the figure was
  // hardcoded to a demo file or the brand logo, so there was no way to publish
  // a real photograph from the dashboard at all.
  const portrait = await publicImageURL(page?.gallery_asset_ids?.[0] ?? "");
  // Blocks reference images by id; resolve every one the page uses in a single
  // pass so a section renderer can stay synchronous.
  const sectionImages = await coverURLs(
    (page?.sections ?? []).flatMap((section) =>
      (section.asset_ids ?? []).map((assetID) => ({ key: assetID, assetID })),
    ),
  );
  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/about"
      footerCta={contentFooterCta}
    >
      {usingDemo ? <DemoBanner /> : null}
      <main id="main-content" className={styles.about}>
        {page ? (
          <>
            <section className={`${styles.hero} shell-container`}>
              <span className={styles.heroWord} aria-hidden="true">
                About
              </span>
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
                data-placeholder={portrait || usingDemo ? "false" : "true"}
              >
                <span className={styles.portraitNumber} aria-hidden="true">
                  JK / 01
                </span>
                {portrait ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={portrait}
                    alt="Joe Kuntani holding an acoustic guitar in a black cowboy hat and bandana."
                    width={1200}
                    height={800}
                  />
                ) : usingDemo ? (
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
                <p className={styles.portraitNote}>Comedy · guitar · live</p>
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

            <section className={styles.storyIntro}>
              <div className={`${styles.storyIntroInner} shell-container`}>
                <div className={styles.storyLabel}>
                  <span>02</span>
                  <p>The story so far</p>
                </div>
                <div className={styles.statement}>
                  <p className={styles.statementLead}>
                    One voice. Six strings.
                  </p>
                  <h2>
                    The joke arrives
                    <span> on a melody.</span>
                  </h2>
                  <p className={styles.statementCopy}>
                    Not a comic with background music. Not a musician waiting
                    for the punchline. Joe turns the guitar into the setup, the
                    character and the final word.
                  </p>
                </div>
                <dl className={styles.storyFacts}>
                  <div>
                    <dt>Based</dt>
                    <dd>Kumasi, Ghana</dd>
                  </div>
                  <div>
                    <dt>Known for</dt>
                    <dd>Guitar comedy</dd>
                  </div>
                  <div>
                    <dt>Working across</dt>
                    <dd>Stage · film · digital</dd>
                  </div>
                </dl>
              </div>
            </section>

            <section className={`${styles.narrative} shell-container`}>
              <aside className={styles.narrativeRail}>
                <p className={styles.railEyebrow}>Robert Sarpong</p>
                <p className={styles.railTitle}>Behind the name Joe Kuntani.</p>
                <span className={styles.railLine} aria-hidden="true" />
                <p className={styles.railNote}>
                  Comedy
                  <br />
                  Music
                  <br />
                  Storytelling
                </p>
              </aside>
              <article className={styles.storyBody}>
                {page.body || page.sections?.length ? (
                  <ContentSections
                    sections={page.sections}
                    body={page.body}
                    resolveImage={(assetID) => sectionImages[assetID]}
                    variant="about"
                  />
                ) : null}
              </article>
            </section>

            <section className={styles.manifesto}>
              <div className="shell-container">
                <p aria-hidden="true">Laugh · Listen · Remember ·</p>
                <blockquote>
                  “The guitar can do more than make music. It can make people
                  laugh.”
                </blockquote>
                <span>Joe Kuntani · The guitar comedian</span>
              </div>
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
