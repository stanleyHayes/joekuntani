import styles from "./brand-splash.module.css";

type BrandSplashProps = {
  label?: string;
  compact?: boolean;
};

/** Route-transition splash / loading surface. No production claims. */
export function BrandSplash({
  label = "Loading Joe Kuntani",
  compact = false,
}: BrandSplashProps) {
  return (
    <div
      className={styles.splash}
      data-compact={compact ? "true" : "false"}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={styles.media} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/demo/splash-stage.png"
          alt=""
          width={1920}
          height={1080}
        />
        <div className={styles.veil} />
      </div>
      <div className={styles.fore}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.mark}
          src="/brand/logo.jpeg"
          alt=""
          width={96}
          height={96}
        />
        <p className={styles.brand}>Joe Kuntani</p>
        <p className={styles.label}>{label}</p>
        <span className={styles.pulse} aria-hidden="true" />
      </div>
    </div>
  );
}
