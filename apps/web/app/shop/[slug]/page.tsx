import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { contentFooterCta } from "../../../components/content/public-content";
import { PublicShell } from "../../../components/layout/public-shell";
import { getProduct } from "../../../components/shop/data";
import { ProductPurchase } from "../../../components/shop/product-purchase";
import { pageMetadata, unavailableMetadata } from "../../../lib/seo";
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

  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/shop"
      footerCta={contentFooterCta}
    >
      <main id="main-content" className={styles.page}>
        <div className={`${styles.detail} shell-container`}>
          <div className={styles.detailCopy}>
            <p className="eyebrow">
              <Link href="/shop">Shop</Link>
              {product.category ? ` · ${product.category}` : ""}
            </p>
            <h1 className={styles.detailTitle}>{product.name}</h1>
            {product.summary ? (
              <p className={styles.lede}>{product.summary}</p>
            ) : null}
            {product.description ? (
              <p className={styles.detailBody}>{product.description}</p>
            ) : null}
          </div>
          <div className={styles.detailBuy}>
            <ProductPurchase
              product={product}
              currency={currency}
              enabled={enabled}
            />
          </div>
        </div>
      </main>
    </PublicShell>
  );
}
