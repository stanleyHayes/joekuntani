import type { PublicSettings } from "../../lib/settings";
import type { ContentItem } from "../content/types";
import type { LegalPublication } from "./data";
import { PublicShell } from "../layout/public-shell";
import styles from "./public-info.module.css";

export function LegalPage({
  kind,
  page,
  settings,
  publication,
  stagingPlaceholder,
}: {
  kind: "privacy" | "terms";
  page: ContentItem | null;
  settings: PublicSettings | null;
  publication: LegalPublication | null;
  stagingPlaceholder: boolean;
}) {
  const label = kind === "privacy" ? "Privacy notice" : "Website terms";
  return (
    <PublicShell
      currentPath={`/${kind}`}
      settings={settings}
      footerCta={{
        href: "/contact",
        label: "Contact the team",
        title: "Need clarification?",
        description:
          "Use the approved contact route for questions about this page.",
      }}
    >
      <main id="main-content">
        <header className={`${styles.hero} shell-container`}>
          <div>
            <p className="eyebrow">Legal</p>
            <h1>{page?.title ?? label}</h1>
          </div>
          <p className={styles.lede}>
            {page?.summary ??
              "This publication is awaiting approved legal text and contact details."}
          </p>
        </header>
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby={`${kind}-content`}
        >
          <h2 id={`${kind}-content`}>{label}</h2>
          {page ? (
            <div>
              <dl
                className={styles.meta}
                aria-label="Legal publication details"
              >
                <dt>Version</dt>
                <dd>{publication?.version}</dd>
                <dt>Effective date</dt>
                <dd>{publication?.effectiveDate}</dd>
                <dt>Last updated</dt>
                <dd>{publication?.updatedAt.slice(0, 10)}</dd>
              </dl>
              <div className={styles.body}>{page.body}</div>
            </div>
          ) : stagingPlaceholder ? (
            <div className={styles.notice} role="status">
              <strong>Staging-only incomplete content</strong>
              <p>
                Approved legal text, version details and a public contact route
                are required before production publication.
              </p>
            </div>
          ) : (
            <p className={styles.notice} role="status">
              This legal page is not published because required approved text or
              contact details are unavailable.
            </p>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
