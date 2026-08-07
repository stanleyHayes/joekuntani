import styles from "./metric-watermark.module.css";

export type MetricWatermarkVariant = "grid" | "orbit" | "spark" | "wave";

export function MetricWatermark({
  variant = "orbit",
}: {
  variant?: MetricWatermarkVariant;
}) {
  return (
    <svg
      aria-hidden="true"
      className={styles.mark}
      data-variant={variant}
      viewBox="0 0 160 160"
    >
      {variant === "orbit" ? (
        <>
          <circle cx="80" cy="80" r="52" />
          <circle cx="80" cy="80" r="28" />
          <circle className={styles.solid} cx="128" cy="61" r="6" />
        </>
      ) : null}
      {variant === "wave" ? (
        <>
          <path d="M-8 52C22 22 48 22 78 52s56 30 90 0" />
          <path d="M-8 82c30-30 56-30 86 0s56 30 90 0" />
          <path d="M-8 112c30-30 56-30 86 0s56 30 90 0" />
        </>
      ) : null}
      {variant === "grid" ? (
        <>
          <path d="M20 20h120v120H20zM60 20v120M100 20v120M20 60h120M20 100h120" />
          <path className={styles.solid} d="M60 60h40v40H60z" />
        </>
      ) : null}
      {variant === "spark" ? (
        <>
          <path d="M80 8c2 43 29 70 72 72-43 2-70 29-72 72-2-43-29-70-72-72 43-2 70-29 72-72Z" />
          <path d="M124 12c1 14 10 23 24 24-14 1-23 10-24 24-1-14-10-23-24-24 14-1 23-10 24-24Z" />
        </>
      ) : null}
    </svg>
  );
}
