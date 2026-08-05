import Link from "next/link";

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
    <div className={styles.empty} role="status">
      <h2>{label} is awaiting approval.</h2>
      <p>No approved content has been published in this section yet.</p>
    </div>
  );
}

export function ContentGrid({
  items,
  detailBase,
}: {
  items: ContentItem[];
  detailBase?: string;
}) {
  return (
    <ol className={styles.grid}>
      {items.map((item) => (
        <li className={styles.card} key={item.id}>
          <p className={styles.meta}>
            {[item.category, item.outlet].filter(Boolean).join(" · ") ||
              "Published content"}
          </p>
          <h2>{item.title}</h2>
          {item.summary ? <p>{item.summary}</p> : null}
          {detailBase && item.slug ? (
            <Link href={`${detailBase}/${item.slug}`}>Read the case study</Link>
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
      ))}
    </ol>
  );
}
