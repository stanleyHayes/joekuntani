import type { Metadata } from "next";
import Link from "next/link";

import { contentFooterCta } from "../../../components/content/public-content";
import { PublicShell } from "../../../components/layout/public-shell";
import { pageMetadata } from "../../../lib/seo";
import { getPublicSettings } from "../../../lib/settings";
import styles from "./thank-you.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Order received",
    description: "Your Joe Kuntani shop order has been received.",
    path: "/shop/thank-you",
  }),
  // Order pages carry a reference in the query string; keeping them out of the
  // index stops a receipt being surfaced by a search engine.
  robots: { index: false, follow: true },
};

/**
 * Where Paystack returns a merchandise buyer after payment.
 *
 * This route did not exist: merch.go builds its return URL as
 * `<origin>/shop/thank-you?reference=…`, so every completed purchase landed on
 * a 404 with the money already taken. Donations had an equivalent page and the
 * shop did not.
 *
 * There is no public merch order-lookup endpoint (unlike ticket orders), so the
 * reference is shown as-is rather than resolved into line items. Payment
 * confirmation is the webhook's job — this page deliberately never claims the
 * payment succeeded, only that the order was received.
 */
export default async function ShopThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const [{ reference }, settings] = await Promise.all([
    searchParams,
    // PublicShell cannot fetch these itself, so every public page owns the
    // obligation; without it the nav, brand and footer silently fall back to
    // hardcoded values instead of what is configured in the admin.
    getPublicSettings(),
  ]);

  return (
    <PublicShell
      settings={settings}
      currentPath="/shop/thank-you"
      footerCta={contentFooterCta}
    >
      <main id="main-content">
        <section className={`${styles.stage} shell-container`}>
          <p className={styles.eyebrow}>Shop</p>
          <h1 className={styles.title}>Order received.</h1>
          <p className={styles.lede}>
            Thanks for buying something. Once payment clears you&apos;ll get a
            confirmation email, and we&apos;ll be in touch about getting it to
            you.
          </p>
          {reference ? (
            <dl className={styles.receipt}>
              <div>
                <dt>Order reference</dt>
                <dd>{reference}</dd>
              </div>
              <div>
                <dt>Receipt</dt>
                <dd>Paystack emails your receipt once payment clears.</dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>
                  We&apos;ll confirm delivery or collection by email before
                  anything ships.
                </dd>
              </div>
            </dl>
          ) : null}
          <p className={styles.note}>
            Keep this reference — quote it if you need to ask about the order.
            Payments confirm within a few moments; if anything looks wrong,
            reply to your receipt email and we&apos;ll sort it.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/shop">
              Back to the shop
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
