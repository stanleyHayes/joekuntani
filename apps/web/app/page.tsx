import {
  getPublicContent,
  getPublicContentBySlug,
} from "../components/content/data";
import {
  ContentEmpty,
  ContentGrid,
} from "../components/content/public-content";
import styles from "../components/content/content.module.css";
import { PublicShell } from "../components/layout/public-shell";
import { ContentPlaceholder } from "../components/ui/content-placeholder";
import {
  getPublicEvents,
  activeFeaturedEvent,
} from "../components/events/data";
import { ScheduledEventBanner } from "../components/events/event-ui";
import { contentMetadata } from "../lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return contentMetadata(await getPublicContentBySlug("page", "home"), {
    title: "Joe Kuntani",
    description: "Official website content is awaiting approval.",
    path: "/",
  });
}

export default async function HomePage() {
  const [home, work, testimonials, events] = await Promise.all([
    getPublicContentBySlug("page", "home"),
    getPublicContent("portfolio", { featured: true }),
    getPublicContent("testimonial", { featured: true }),
    getPublicEvents(),
  ]);
  const featuredEvent = activeFeaturedEvent(events.data);
  return (
    <PublicShell
      currentPath="/"
      footerCta={{
        href: "/book",
        label: "Make an enquiry",
        title: "Planning a booking or partnership?",
        description: "Share the project details with the booking team.",
      }}
    >
      <main id="main-content">
        <header className={`${styles.hero} shell-container`}>
          <div>
            <p className="eyebrow">Official platform</p>
            <h1>{home?.title ?? "Joe Kuntani"}</h1>
          </div>
          {home ? (
            <p className={styles.lede}>{home.summary || home.body}</p>
          ) : (
            <div>
              <p className={styles.lede} role="status">
                Approved homepage biography and media have not been published.
              </p>
              <a href="#planned-content">Review planned sections</a>
            </div>
          )}
          <ContentPlaceholder
            label="Hero media"
            detail="Approved photography or video will appear here."
          />
        </header>
        {featuredEvent ? <ScheduledEventBanner event={featuredEvent} /> : null}
        <section
          className={`${styles.section} shell-container`}
          id="planned-content"
          aria-labelledby="featured-work"
        >
          <h2 id="featured-work">Selected work</h2>
          {work.length ? (
            <ContentGrid items={work} detailBase="/work" />
          ) : (
            <ContentEmpty label="Selected work" />
          )}
        </section>
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="testimonials"
        >
          <h2 id="testimonials">Testimonials</h2>
          {testimonials.length ? (
            <ContentGrid items={testimonials} />
          ) : (
            <ContentEmpty label="Approved testimonials" />
          )}
        </section>
      </main>
    </PublicShell>
  );
}
