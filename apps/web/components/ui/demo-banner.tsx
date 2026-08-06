import { DEMO_BANNER } from "../../lib/demo/content";
import styles from "./demo-banner.module.css";

export function DemoBanner() {
  return (
    <p className={styles.banner} role="status">
      {DEMO_BANNER}
    </p>
  );
}
