import type { ContentSection } from "./types";
import { Markdown } from "@joe-kuntani/shared/ui/markdown";
import styles from "./sections.module.css";

/**
 * Renders a page composed of typed blocks.
 *
 * A page used to be one Markdown body, so every part of a long page rendered
 * identically — the About page runs to eleven headings in a single field and
 * reads as a wall. Blocks let each part carry its own presentation.
 *
 * Additive, not a replacement: a record with no blocks falls back to its body.
 * Every record predates this, so without the fallback the site would empty out
 * the moment it shipped, and each page can be converted on its own timeline.
 */
export function ContentSections({
  sections,
  body,
  resolveImage,
  variant = "default",
}: {
  sections?: ContentSection[];
  /** Rendered when the record has no blocks yet. */
  body?: string;
  /** Turns a stored asset id into a URL. Blocks without one render text-only. */
  resolveImage?: (assetID: string) => string | undefined;
  /** Gives a composed page its own art direction without changing CMS data. */
  variant?: "default" | "about";
}) {
  if (!sections?.length)
    return <Markdown className={styles.fallback}>{body}</Markdown>;

  return (
    <div className={styles.sections} data-variant={variant}>
      {sections.map((section, index) => (
        <Section
          key={`${section.type}-${index}`}
          section={section}
          index={index}
          resolveImage={resolveImage}
        />
      ))}
    </div>
  );
}

function Section({
  section,
  index,
  resolveImage,
}: {
  section: ContentSection;
  index: number;
  resolveImage?: (assetID: string) => string | undefined;
}) {
  const heading = section.heading?.trim();
  // Blocks are body content beneath the page's own h1, so they start at h2.
  const Heading = heading ? (
    <h2 className={styles.heading}>{heading}</h2>
  ) : null;

  switch (section.type) {
    case "quote":
      return (
        <blockquote className={styles.quote}>
          {Heading}
          <p className={styles.quoteBody}>{section.body}</p>
        </blockquote>
      );

    case "stats": {
      const items = section.items?.filter((item) => item.label || item.value);
      if (!items?.length) return null;
      return (
        <section className={styles.statsBlock}>
          {Heading}
          <dl className={styles.stats}>
            {items.map((item) => (
              <div className={styles.stat} key={`${item.label}-${item.value}`}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      );
    }

    case "gallery": {
      const images = (section.asset_ids ?? [])
        .map((id) => ({ id, src: resolveImage?.(id) }))
        .filter((image): image is { id: string; src: string } =>
          Boolean(image.src),
        );
      if (!images.length) return null;
      return (
        <section className={styles.galleryBlock}>
          {Heading}
          <ul
            className={styles.gallery}
            data-count={Math.min(images.length, 4)}
          >
            {images.map((image) => (
              <li key={image.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.src} alt="" width={1200} height={900} />
              </li>
            ))}
          </ul>
          {section.body ? (
            <Markdown className={styles.caption}>{section.body}</Markdown>
          ) : null}
        </section>
      );
    }

    case "prose_image": {
      const src = resolveImage?.(section.asset_ids?.[0] ?? "");
      // Without a resolvable image this is just prose — rendering an empty
      // column beside the text would leave a hole rather than a layout.
      if (!src) {
        return (
          <section className={styles.prose}>
            {Heading}
            <Markdown>{section.body}</Markdown>
          </section>
        );
      }
      return (
        <section
          className={styles.proseImage}
          // Alternates sides so consecutive blocks do not march down one edge.
          data-flip={section.flip || index % 2 === 1 ? "true" : "false"}
        >
          <div className={styles.proseImageCopy}>
            {Heading}
            <Markdown>{section.body}</Markdown>
          </div>
          <figure className={styles.proseImageMedia}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" width={1200} height={1500} />
          </figure>
        </section>
      );
    }

    default:
      return (
        <section className={styles.prose}>
          {Heading}
          <Markdown>{section.body}</Markdown>
        </section>
      );
  }
}
