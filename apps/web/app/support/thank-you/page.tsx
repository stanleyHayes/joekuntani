import type { Metadata } from "next";
import Link from "next/link";

import { contentFooterCta } from "../../../components/content/public-content";
import { PublicShell } from "../../../components/layout/public-shell";
import { pageMetadata } from "../../../lib/seo";
import styles from "./thank-you.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Thank you",
    description: "Thank you for supporting Joe Kuntani.",
    path: "/support/thank-you",
  }),
  robots: { index: false, follow: true },
};

export default async function SupportThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const { reference } = await searchParams;

  return (
    <PublicShell currentPath="/support/thank-you" footerCta={contentFooterCta}>
      <main id="main-content">
        <section className={`${styles.stage} shell-container`}>
          <p className={styles.eyebrow}>Support the artist</p>
          <h1 className={styles.title}>Thank you.</h1>
          <p className={styles.lede}>
            Your contribution goes straight into the work — rehearsal time, gear
            and getting the show on the road.
          </p>
          {reference ? (
            <dl className={styles.receipt}>
              <div>
                <dt>Reference</dt>
                <dd>{reference}</dd>
              </div>
              <div>
                <dt>Receipt</dt>
                <dd>Paystack emails your receipt once payment clears.</dd>
              </div>
            </dl>
          ) : null}
          <p className={styles.note}>
            Payments confirm within a few moments. If anything looks wrong,
            reply to your receipt email and we&apos;ll sort it.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/events">
              See upcoming shows
            </Link>
            <Link className={styles.secondary} href="/">
              Back to the site
            </Link>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
