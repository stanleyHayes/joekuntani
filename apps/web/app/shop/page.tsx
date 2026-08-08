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
import { coverURLs } from "../../lib/media";
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
  // Products carry image ids; the shop rendered none of them, so every card was
  // a block of text no matter what an editor uploaded.
  const covers = await coverURLs(
    catalogue.products.map((product) => ({
      key: product.id,
      assetID: product.image_asset_ids?.[0],
    })),
  );
  const availableProducts = catalogue.products.filter(
    (product) => totalStock(product) > 0,
  ).length;

  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/shop"
      footerCta={contentFooterCta}
    >
      <main id="main-content" className={styles.page}>
        <header className={`${styles.hero} shell-container`}>
          <div className={styles.heroTopline}>
            <p className="eyebrow">Joe Kuntani goods · Drop 01</p>
            <span>{String(availableProducts).padStart(2, "0")} available</span>
          </div>
          <div className={styles.heroCopy}>
            <h1 className={styles.title}>
              Wear the <span>set.</span>
            </h1>
            <p className={styles.lede}>
              Official merchandise, made to leave the room with you. Every order
              is packed and shipped from Ghana.
            </p>
          </div>
          <div className={styles.heroStamp} aria-hidden="true">
            <span>JK</span>
            <small>Official goods</small>
          </div>
        </header>

        <div className={styles.marquee} aria-hidden="true">
          <div>
            <span>Live comedy</span>
            <b>✦</b>
            <span>Official goods</span>
            <b>✦</b>
            <span>Packed in Ghana</span>
            <b>✦</b>
            <span>Live comedy</span>
            <b>✦</b>
            <span>Official goods</span>
          </div>
        </div>

        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="shop-items"
        >
          <div className={styles.sectionHead}>
            <span>Collection / 01</span>
            <h2 id="shop-items">From stage to street.</h2>
            <p>
              Choose a piece, then pick the available size or option on its
              product page. Stock updates as orders come in.
            </p>
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
                      {covers[product.id] ? (
                        <span className={styles.cardMedia}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={covers[product.id]}
                            alt={product.name}
                            width={800}
                            height={800}
                          />
                        </span>
                      ) : (
                        <span
                          className={styles.cardFallback}
                          aria-hidden="true"
                        >
                          <span>JK</span>
                          <strong>{product.category || "Goods"}</strong>
                          <small>Official merchandise</small>
                        </span>
                      )}
                      <span className={styles.cardBody}>
                        <span className={styles.cardMeta}>
                          <span>
                            Product {String(index + 1).padStart(2, "0")}
                          </span>
                          <span
                            data-sold-out={stock === 0 ? "true" : undefined}
                          >
                            {stock > 0 ? "Available" : "Sold out"}
                          </span>
                        </span>
                        <span className={styles.cardName}>{product.name}</span>
                        {product.summary ? (
                          <span className={styles.cardSummary}>
                            {product.summary}
                          </span>
                        ) : null}
                        <span className={styles.cardFoot}>
                          <span>
                            <small>{lead ? "From" : "Status"}</small>
                            <span className={styles.cardPrice}>
                              {lead
                                ? `${catalogue.currency} ${lead.price}`
                                : "Back soon"}
                            </span>
                          </span>
                          <span className={styles.cardCta}>
                            View piece <span aria-hidden="true">↗</span>
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
