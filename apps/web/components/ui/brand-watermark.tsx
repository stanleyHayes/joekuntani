import styles from "./brand-watermark.module.css";

type BrandWatermarkProps = {
  className?: string;
};

/** Decorative music/comedy icon watermarks — not a name lockup. */
export function BrandWatermark({ className }: BrandWatermarkProps) {
  return (
    <div
      className={[styles.watermark, className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <span className={`${styles.icon} ${styles.mic}`} />
      <span className={`${styles.icon} ${styles.notes}`} />
      <span className={`${styles.icon} ${styles.laugh}`} />
      <span className={styles.ring} />
    </div>
  );
}
