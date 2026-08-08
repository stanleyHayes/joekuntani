import { BRAND_LOGO_SRC } from "@joe-kuntani/shared/ui/brand-mark";
import styles from "./auth-form.module.css";

export type AuthHeroFact = {
  term: string;
  detail: string;
};

type AuthHeroProps = {
  /** Micro-label under the wordmark — names the surface being entered. */
  tag: string;
  /** Display line, split so the middle word can carry the brand gold.
      `lead` and `trail` own their own spacing around the accent word. */
  lead: string;
  accent: string;
  trail: string;
  copy: string;
  facts: AuthHeroFact[];
};

/** Decorative brand column shared by sign-in, second factor and invite accept.
    Hidden below 900px, where the form panel carries the brand row instead. */
export function AuthHero({
  tag,
  lead,
  accent,
  trail,
  copy,
  facts,
}: AuthHeroProps) {
  return (
    <aside className={styles.hero} aria-hidden="true">
      <div className={styles.heroMarks}>
        <p className={styles.heroMonogram}>JK</p>
        <svg className={styles.heroRings} viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="97" />
          <circle cx="100" cy="100" r="82" />
          <circle className={styles.heroRingAccent} cx="100" cy="100" r="68" />
          <circle cx="100" cy="100" r="55" />
          <circle cx="100" cy="100" r="43" />
          <circle cx="100" cy="100" r="32" />
          <circle className={styles.heroRingCore} cx="100" cy="100" r="9" />
        </svg>
      </div>

      <div className={styles.heroInner}>
        <div className={styles.heroTop}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className={styles.heroLogo}
            height={160}
            src={BRAND_LOGO_SRC}
            width={160}
          />
          <div>
            <p className={styles.heroBrand}>Joe Kuntani</p>
            <p className={styles.heroTag}>{tag}</p>
          </div>
        </div>

        <div className={styles.heroStatement}>
          <p className={styles.heroDisplay}>
            {lead}
            <em>{accent}</em>
            {trail}
          </p>
          <p className={styles.heroCopy}>{copy}</p>
        </div>

        <dl className={styles.heroRail}>
          {facts.map((fact) => (
            <div className={styles.heroRailItem} key={fact.term}>
              <dt>{fact.term}</dt>
              <dd>{fact.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
