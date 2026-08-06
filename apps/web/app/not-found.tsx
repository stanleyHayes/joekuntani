import Link from "next/link";

import { PublicShell } from "../components/layout/public-shell";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <PublicShell
      currentPath="/404"
      footerCta={{
        href: "/book",
        label: "Make an enquiry",
        title: "Looking for booking or press?",
        description: "Share the details with the team if you still need a route.",
      }}
    >
      <main id="main-content" className={styles.page}>
        <div className={`shell-container ${styles.inner}`}>
          <p className={styles.code}>404</p>
          <h1 className={styles.title}>This page is off stage.</h1>
          <p className={styles.copy}>
            The route you asked for is not published. Head home, browse services,
            or send an enquiry — no production claims live on this placeholder.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/">
              Back home
            </Link>
            <Link className={styles.secondary} href="/services">
              View services
            </Link>
            <Link className={styles.secondary} href="/book">
              Make an enquiry
            </Link>
          </div>
        </div>
      </main>
    </PublicShell>
  );
}
