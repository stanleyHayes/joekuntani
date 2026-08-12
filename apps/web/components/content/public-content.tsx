import Link from "next/link";

import { EmptyState } from "@joe-kuntani/shared/ui/empty-state";
import { ButtonLink } from "../ui/button-link";
import type { ContentItem } from "./types";
import styles from "./content.module.css";

export const contentFooterCta = {
  href: "/book",
  label: "Make an enquiry",
  title: "Planning a booking or partnership?",
  description: "Share the project details with the booking team.",
} as const;

export function ContentEmpty({ label }: { label: string }) {
  return (
    <EmptyState
      className={styles.empty}
      tone="stage"
      title={`${label} is still off stage`}
      description="Approved pieces will land here once the CMS publish path clears them. Until then this section stays intentionally quiet."
      action={
        <ButtonLink href="/book" variant="primary">
          Make an enquiry
        </ButtonLink>
      }
    />
  );
}

export function ContentGrid({
  items,
  detailBase,
  covers,
}: {
  items: ContentItem[];
  detailBase?: string;
  /** Optional cover images keyed by content slug (demo / CMS media). */
  covers?: Record<string, string>;
}) {
  return (
    <ol className={styles.grid}>
      {items.map((item) => {
        const cover = item.slug ? covers?.[item.slug] : undefined;
        return (
          <li className={styles.card} key={item.id}>
            {cover ? (
              <figure className={styles.cardMedia}>
                {/* Demo / CMS cover plate; alt states replacement clearly. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover}
                  alt={`Visual placeholder for ${item.title}. Replace via CMS.`}
                  width={1200}
                  height={800}
                />
              </figure>
            ) : null}
            <p className={styles.meta}>
              {[item.category, item.outlet].filter(Boolean).join(" · ") ||
                "Published content"}
            </p>
            <h2>{item.title}</h2>
            {item.summary ? <p>{item.summary}</p> : null}
            {detailBase && item.slug ? (
              <Link href={`${detailBase}/${item.slug}`}>
                Read the case study
              </Link>
            ) : item.external_url ? (
              <a
                className={styles.external}
                href={item.external_url}
                rel="noopener noreferrer"
                target="_blank"
              >
                View original source
              </a>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
