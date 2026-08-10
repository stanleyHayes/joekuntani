import { BrandMark } from "@joe-kuntani/shared/ui/brand-mark";

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
      <div className={styles.grain} aria-hidden="true" />
      <span className={styles.ghostMark} aria-hidden="true">
        JK
      </span>

      <header className={styles.rail} aria-hidden="true">
        <span>JK / CONTROL</span>
        <span>ACCRA · GH</span>
      </header>

      <div className={styles.stage}>
        <div className={styles.brandPlate}>
          <span className={styles.plateIndex} aria-hidden="true">
            01
          </span>
          <div className={styles.logoFrame}>
            <BrandMark className={styles.mark} brandName="" />
          </div>
          <span className={styles.plateLabel} aria-hidden="true">
            Artist operations
          </span>
          <span className={styles.corner} aria-hidden="true" />
        </div>

        <div className={styles.copy}>
          <p>Staff console</p>
          <strong>
            Show control,
            <br />
            <em>ready.</em>
          </strong>
          <span>Publishing · bookings · ticketing</span>
        </div>
      </div>

      <footer className={styles.status}>
        <span className={styles.statusLabel}>
          <i aria-hidden="true" /> Opening workspace
        </span>
        <span className={styles.progress} aria-hidden="true">
          <i />
        </span>
        <span className={styles.counter} aria-hidden="true">
          01 — 04
        </span>
      </footer>
    </div>
  );
}
