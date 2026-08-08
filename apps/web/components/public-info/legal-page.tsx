import type { PublicSettings } from "../../lib/settings";
import type { ContentItem } from "../content/types";
import type { LegalPublication } from "./data";
import { PublicShell } from "../layout/public-shell";
import styles from "./public-info.module.css";
import { PublicInfoNav } from "./public-info-nav";

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
        <header
          className={`${styles.hero} ${styles.legalHero} shell-container`}
        >
          <div className={styles.heroTitle}>
            <p className="eyebrow">
              {kind === "privacy" ? "Your information" : "Using this website"}
            </p>
            <h1>{page?.title ?? label}</h1>
            <span className={styles.heroCode} aria-hidden="true">
              {kind === "privacy" ? "P/03" : "T/04"}
            </span>
          </div>
          <p className={styles.lede}>
            {page?.summary ??
              "This publication is awaiting approved legal text and contact details."}
          </p>
        </header>
        <div className="shell-container">
          <PublicInfoNav currentPath={`/${kind}`} />
        </div>
        <section
          className={`${styles.section} ${styles.legalSection} shell-container`}
          aria-labelledby={`${kind}-content`}
        >
          {page ? (
            <article className={styles.legalDocument}>
              <aside className={styles.legalMeta}>
                <p className={styles.sectionIndex}>Document record</p>
                <h2 id={`${kind}-content`}>{label}</h2>
                <dl aria-label="Legal publication details">
                  <div>
                    <dt>Version</dt>
                    <dd>{publication?.version}</dd>
                  </div>
                  <div>
                    <dt>Effective</dt>
                    <dd>{publication?.effectiveDate}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{publication?.updatedAt.slice(0, 10)}</dd>
                  </div>
                </dl>
                <a href="/contact">
                  Ask a question <span aria-hidden="true">↗</span>
                </a>
              </aside>
              <div className={styles.body}>{page.body}</div>
            </article>
          ) : stagingPlaceholder ? (
            <div className={styles.notice} role="status">
              <h2 id={`${kind}-content`}>{label}</h2>
              <strong>Staging-only incomplete content</strong>
              <p>
                Approved legal text, version details and a public contact route
                are required before production publication.
              </p>
            </div>
          ) : (
            <div className={styles.notice} role="status">
              <h2 id={`${kind}-content`}>{label}</h2>
              <p>
                This legal page is not published because required approved text
                or contact details are unavailable.
              </p>
            </div>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
