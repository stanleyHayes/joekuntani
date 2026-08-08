import Link from "next/link";
import { getPublicSettings } from "../lib/settings";
import {
  getPublicContent,
  getPublicContentBySlug,
} from "../components/content/data";
import { ContentEmpty } from "../components/content/public-content";
import { PublicShell } from "../components/layout/public-shell";
import { ContentPlaceholder } from "../components/ui/content-placeholder";
import { DemoBanner } from "../components/ui/demo-banner";
import {
  getPublicEvents,
  activeFeaturedEvent,
} from "../components/events/data";
import { ScheduledEventBanner } from "../components/events/event-ui";
import {
  demoContentEnabled,
  demoCovers,
  demoEvents,
  demoHome,
  demoImages,
  demoServices,
  demoTestimonials,
  demoWork,
} from "../lib/demo/content";
import { contentCovers, publicImageURL } from "../lib/media";
import { contentMetadata } from "../lib/seo";
import { getPublicServices } from "../components/services/data";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const home =
    (await getPublicContentBySlug("page", "home")) ||
    (demoContentEnabled() ? demoHome : null);
  return contentMetadata(home, {
    title: "Joe Kuntani",
    description: "Official website content is awaiting approval.",
    path: "/",
  });
}

export default async function HomePage() {
  const shellSettings = await getPublicSettings();
  const [homeRaw, workRaw, testimonialsRaw, events, servicesRaw] =
    await Promise.all([
      getPublicContentBySlug("page", "home"),
      getPublicContent("portfolio", { featured: true }),
      getPublicContent("testimonial", { featured: true }),
      getPublicEvents(),
      getPublicServices(),
    ]);
  const demo = demoContentEnabled();
  const usingDemo = demo && !homeRaw;
  const home = homeRaw || (demo ? demoHome : null);
  const work = workRaw.length ? workRaw : demo ? demoWork : [];
  const testimonials = testimonialsRaw.length
    ? testimonialsRaw
    : demo
      ? demoTestimonials
      : [];
  const services = servicesRaw.length ? servicesRaw : demo ? demoServices : [];
  // The hero photograph comes from the first gallery image on the Home page
  // record, the same field the About portrait uses, so both are managed from
  // Content and media without an operator ever handling an asset id.
  const heroImage = await publicImageURL(home?.gallery_asset_ids?.[0] ?? "");
  // Published work carries its own imagery; the demo map is only a fallback
  // for the fixture path.
  const covers = await contentCovers(work);
  const featuredEvent =
    activeFeaturedEvent(events.data) ||
    (demo ? activeFeaturedEvent(demoEvents) : undefined);
  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/"
      footerCta={{
        href: "/book",
        label: "Make an enquiry",
        title: "Planning a booking or partnership?",
        description: "Share the project details with the booking team.",
      }}
    >
      {usingDemo ? <DemoBanner /> : null}
      <main id="main-content" className={styles.page}>
        <header className={`${styles.hero} shell-container`}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>
              {usingDemo ? "Demo preview" : "Official platform"}
            </p>
            <h1>{home?.title ?? "Joe Kuntani"}</h1>
            {home ? (
              <p className={styles.lede}>{home.summary || home.body}</p>
            ) : (
              <p className={styles.lede} role="status">
                Approved homepage biography has not been published.
              </p>
            )}
            <div className={styles.heroActions}>
              <Link href="/book">
                Book Joe <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/work">
                Explore the work <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
          <figure className={styles.heroMedia}>
            {/* The frame owns the rounded clip. The stamp is inside it so the
                corner crops the monogram, rather than letting it trail off
                across the page background where it has no contrast to sit on. */}
            <span className={styles.heroFrame}>
              {heroImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={heroImage}
                  alt={home?.title ? `${home.title} hero image` : ""}
                  width={1600}
                  height={1200}
                />
              ) : usingDemo ? (
                /* SVG demo asset; CMS will replace with approved Cloudinary media. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={demoImages.hero}
                  alt="Demo stage atmosphere placeholder. Replace via CMS."
                  width={1600}
                  height={1200}
                />
              ) : (
                <ContentPlaceholder
                  label="Hero media"
                  detail="Approved photography or video will appear here."
                />
              )}
              {/* Only over photography: on the empty-state placeholder the
                  monogram has nothing to read against. */}
              {heroImage || usingDemo ? (
                <span className={styles.heroStamp} aria-hidden="true">
                  JK
                </span>
              ) : null}
            </span>
            {!heroImage && usingDemo ? (
              <figcaption>Demo media — replace via CMS</figcaption>
            ) : null}
          </figure>
        </header>
        <div className={styles.signal} aria-label="Joe Kuntani disciplines">
          <span>Comedy</span>
          <i>✦</i>
          <span>Live guitar</span>
          <i>✦</i>
          <span>Original songs</span>
          <i>✦</i>
          <span>Stagecraft</span>
        </div>
        {featuredEvent ? <ScheduledEventBanner event={featuredEvent} /> : null}
        <section
          className={`${styles.intro} shell-container`}
          id="planned-content"
          aria-labelledby="home-intro"
        >
          <p className={styles.sectionNumber}>01 / Introduction</p>
          <h2 id="home-intro">One stage. More than one way to move a room.</h2>
          <p>
            Comedy, live guitar and original songs meet in an adaptable
            performance world built for live audiences, collaborations and
            commissioned work.
          </p>
          <Link href="/about">
            Meet Joe <span aria-hidden="true">→</span>
          </Link>
        </section>
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="featured-work"
        >
          <div className={styles.sectionHead}>
            <div>
              <span>02</span>
              <h2 id="featured-work">Selected work</h2>
            </div>
            <Link href="/work">View all work ↗</Link>
          </div>
          {work.length ? (
            <ol className={styles.workGrid}>
              {work.slice(0, 4).map((item, index) => {
                const cover =
                  covers[item.id] ??
                  (usingDemo && item.slug ? demoCovers[item.slug] : undefined);
                return (
                  <li key={item.id}>
                    <Link href={item.slug ? `/work/${item.slug}` : "/work"}>
                      <div className={styles.workMedia}>
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover} alt="" width={1200} height={900} />
                        ) : (
                          <span aria-hidden="true">JK</span>
                        )}
                      </div>
                      <p>
                        {String(index + 1).padStart(2, "0")} ·{" "}
                        {item.category || "Work"}
                      </p>
                      <h3>{item.title}</h3>
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <ContentEmpty label="Selected work" />
          )}
        </section>
        <section
          className={`${styles.services} shell-container`}
          aria-labelledby="home-services"
        >
          <div className={styles.sectionHead}>
            <div>
              <span>03</span>
              <h2 id="home-services">Ways to work together</h2>
            </div>
            <Link href="/services">All services ↗</Link>
          </div>
          {services.length ? (
            <ol>
              {services.slice(0, 4).map((service, index) => (
                <li key={service.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{service.name}</h3>
                  <p>{service.summary}</p>
                  <Link
                    href={`/book?service=${encodeURIComponent(service.slug)}`}
                  >
                    Enquire ↗
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <ContentEmpty label="Approved services" />
          )}
        </section>
        <section
          className={`${styles.testimonials} shell-container`}
          aria-labelledby="testimonials"
        >
          <p className={styles.sectionNumber}>04 / From the room</p>
          <h2 id="testimonials">What collaborators say</h2>
          {testimonials.length ? (
            <div className={styles.quotes}>
              {testimonials.slice(0, 3).map((item) => (
                <blockquote key={item.id}>
                  <p>{unquote(item.body || item.summary || item.title)}</p>
                  <footer>
                    <span className={styles.quoteName}>
                      {item.person_name || item.title}
                    </span>
                    {item.person_title ? (
                      <span className={styles.quoteRole}>
                        {item.person_title}
                      </span>
                    ) : null}
                  </footer>
                </blockquote>
              ))}
            </div>
          ) : (
            <ContentEmpty label="Approved testimonials" />
          )}
        </section>
      </main>
    </PublicShell>
  );
}

/**
 * Approved testimonials reach this page from the CMS sometimes already wrapped
 * in quote marks and sometimes not, and the section used to add its own pair
 * unconditionally — which rendered doubled marks on any quoted entry. Strip
 * whatever the source supplied and let the section's quote glyph do the work.
 */
function unquote(text: string) {
  return text
    .trim()
    .replace(/^[“”"'‘’]+\s*/, "")
    .replace(/\s*[“”"'‘’]+$/, "");
}
