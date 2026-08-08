import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { contentFooterCta } from "../../../components/content/public-content";
import { PublicShell } from "../../../components/layout/public-shell";
import { getProduct } from "../../../components/shop/data";
import { ProductPurchase } from "../../../components/shop/product-purchase";
import { pageMetadata, unavailableMetadata } from "../../../lib/seo";
import { coverURLs } from "../../../lib/media";
import { getPublicSettings } from "../../../lib/settings";
import styles from "../shop.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { product } = await getProduct(slug);
  if (!product)
    return unavailableMetadata(
      "Item unavailable",
      "This merchandise item is not available.",
    );
  return pageMetadata({
    title: product.name,
    description: product.summary || `Official ${product.name} merchandise.`,
    path: `/shop/${slug}`,
  });
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [{ product, currency, enabled }, shellSettings] = await Promise.all([
    getProduct(slug),
    getPublicSettings(),
  ]);
  if (!product) notFound();
  const covers = await coverURLs([
    { key: product.id, assetID: product.image_asset_ids?.[0] },
  ]);
  const cover = covers[product.id];
  const activeVariants = product.variants.filter(
    (variant) => variant.active && variant.stock > 0,
  );

  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/shop"
      footerCta={contentFooterCta}
    >
      <main id="main-content" className={styles.page}>
        <nav
          className={`${styles.crumbs} shell-container`}
          aria-label="Breadcrumb"
        >
          <Link href="/shop">Shop</Link>
          <span aria-hidden="true">/</span>
          <span>{product.category || "Goods"}</span>
        </nav>

        <article className={`${styles.detail} shell-container`}>
          <div className={styles.detailVisual}>
            {cover ? (
              <div className={styles.detailMedia}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover} alt={product.name} width={900} height={1125} />
              </div>
            ) : (
              <div className={styles.detailFallback} aria-hidden="true">
                <span>JK / Official goods</span>
                <strong>{product.category || "Goods"}</strong>
                <small>Drop 01</small>
              </div>
            )}
            <p className={styles.visualNote}>
              <span>Official merchandise</span>
              <span>Packed in Ghana</span>
            </p>
          </div>

          <div className={styles.detailContent}>
            <header className={styles.detailCopy}>
              <p className={styles.detailKicker}>
                {product.category || "Joe Kuntani goods"}
              </p>
              <h1 className={styles.detailTitle}>{product.name}</h1>
              {product.summary ? (
                <p className={styles.detailLede}>{product.summary}</p>
              ) : null}
              {product.description ? (
                <p className={styles.detailBody}>{product.description}</p>
              ) : null}
              <dl className={styles.productFacts}>
                <div>
                  <dt>Options</dt>
                  <dd>{activeVariants.length || "—"}</dd>
                </div>
                <div>
                  <dt>Dispatch</dt>
                  <dd>From Ghana</dd>
                </div>
                <div>
                  <dt>Payment</dt>
                  <dd>Paystack</dd>
                </div>
              </dl>
            </header>

            <section
              className={styles.detailBuy}
              aria-labelledby="order-heading"
            >
              <div className={styles.buyHead}>
                <p>Order desk</p>
                <h2 id="order-heading">Choose yours.</h2>
              </div>
              <ProductPurchase
                product={product}
                currency={currency}
                enabled={enabled}
              />
            </section>
          </div>
        </article>
      </main>
    </PublicShell>
  );
}
