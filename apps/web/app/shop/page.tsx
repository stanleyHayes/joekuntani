import type { Metadata } from "next";
import Link from "next/link";

import { contentFooterCta } from "../../components/content/public-content";
import { PublicShell } from "../../components/layout/public-shell";
import {
  fromPrice,
  getCatalogue,
  totalStock,
} from "../../components/shop/data";
import { EmptyState } from "../../components/ui/empty-state";
import { pageMetadata } from "../../lib/seo";
import { getPublicSettings } from "../../lib/settings";
import styles from "./shop.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Shop",
    description: "Official Joe Kuntani merchandise, shipped from Ghana.",
    path: "/shop",
  });
}

export default async function ShopPage() {
  const [catalogue, shellSettings] = await Promise.all([
    getCatalogue(),
    getPublicSettings(),
  ]);

  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/shop"
      footerCta={contentFooterCta}
    >
      <main id="main-content" className={styles.page}>
        <header className={`${styles.hero} shell-container`}>
          <p className="eyebrow">Shop</p>
          <h1 className={styles.title}>Wear the set.</h1>
          <p className={styles.lede}>
            Official merchandise. Every order is packed and shipped from Ghana.
          </p>
        </header>

        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="shop-items"
        >
          <div className={styles.sectionHead}>
            <span>01</span>
            <h2 id="shop-items">Available now</h2>
            <p>Pick a size at checkout. Stock updates as orders come in.</p>
          </div>

          {catalogue.products.length ? (
            <ol className={styles.grid}>
              {catalogue.products.map((product, index) => {
                const lead = fromPrice(product);
                const stock = totalStock(product);
                return (
                  <li className={styles.card} key={product.id}>
                    <Link
                      className={styles.cardLink}
                      href={`/shop/${product.slug}`}
                    >
                      <span className={styles.cardIndex}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className={styles.cardBody}>
                        <span className={styles.cardName}>{product.name}</span>
                        {product.summary ? (
                          <span className={styles.cardSummary}>
                            {product.summary}
                          </span>
                        ) : null}
                        <span className={styles.cardFoot}>
                          <span className={styles.cardPrice}>
                            {lead
                              ? `${catalogue.currency} ${lead.price}`
                              : "Sold out"}
                          </span>
                          <span className={styles.cardStock}>
                            {stock > 0 ? `${stock} in stock` : "Back soon"}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState
              announce={false}
              tone="media"
              title="Nothing in the shop yet"
              description={
                catalogue.enabled
                  ? "The first drop is being prepared. Check back shortly, or follow along on social for the announcement."
                  : "Online payments are still being connected, so nothing is listed for sale yet."
              }
            />
          )}
        </section>
      </main>
    </PublicShell>
  );
}
