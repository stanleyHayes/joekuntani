import { BrandMark } from "../layout/brand-mark";

import styles from "./admin-splash.module.css";

export function AdminSplash({ overlay = false }: { overlay?: boolean }) {
  return (
    <div
      className={styles.splash}
      data-overlay={overlay ? "true" : "false"}
      role={overlay ? "presentation" : "status"}
      aria-label={overlay ? undefined : "Opening staff workspace"}
      aria-hidden={overlay || undefined}
    >
      <div className={styles.brand}>
        <span className={styles.orbit} aria-hidden="true" />
        <BrandMark className={styles.mark} />
      </div>
      <span className={styles.dots} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
