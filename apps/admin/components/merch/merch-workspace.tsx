"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  ArrowRightIcon,
  CubeIcon,
  PackageIcon,
  PencilSimpleIcon,
  PlusIcon,
  StorefrontIcon,
  TrashIcon,
  TrendDownIcon,
} from "@phosphor-icons/react";
import { AdminDialog } from "../admin-dialog";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import { EmptyState } from "@joe-kuntani/shared/ui/empty-state";
import {
  api,
  productEditorHref,
  type Order,
  type Product,
  type Variant,
} from "./merch-api";
import styles from "./merch-workspace.module.css";

export function MerchWorkspace() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [variantOpen, setVariantOpen] = useState(false);
  const [variantDraft, setVariantDraft] = useState<Variant | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [productsResult, ordersResult] = await Promise.allSettled([
      api<{ products: Product[] }>("/api/admin/merch/products"),
      api<{ orders: Order[] }>("/api/admin/merch/orders"),
    ]);
    if (productsResult.status === "fulfilled")
      // A product with no variants can arrive with `variants: null`. The type
      // says otherwise, so normalising here keeps every reader below from
      // having to defend against it — one of them did not, and crashed the
      // screen on the first product created before its variants.
      setProducts(
        (productsResult.value.products ?? []).map((product) => ({
          ...product,
          variants: product.variants ?? [],
        })),
      );
    else setError("Merchandise could not be loaded.");
    if (ordersResult.status === "fulfilled")
      setOrders(ordersResult.value.orders ?? []);
  }

  // Deferred by a zero-delay timer so the initial fetch never resolves inside
  // the effect body — see team-workspace for the same idiom. Calling the loader
  // directly trips react-hooks/set-state-in-effect.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function saveVariant(event: FormEvent) {
    event.preventDefault();
    if (!variantDraft) return;
    setPending(true);
    setError("");
    try {
      await api("/api/admin/merch/variants", {
        method: "PUT",
        body: variantDraft,
      });
      setMessage("Variant saved.");
      setVariantOpen(false);
      await load();
    } catch {
      setError("The variant was not accepted. Check the price and stock.");
    } finally {
      setPending(false);
    }
  }

  async function removeVariant(id: string) {
    if (
      !window.confirm("Remove this variant? Existing orders keep their record.")
    )
      return;
    setPending(true);
    try {
      await api(`/api/admin/merch/variants/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await load();
    } catch {
      setError("The variant could not be removed.");
    } finally {
      setPending(false);
    }
  }

  if (error && !products)
    return (
      <AdminErrorState message={error} title="Merchandise is unavailable" />
    );
  if (!products)
    return <AdminSkeleton label="Loading merchandise" variant="table" />;

  const variants = products.flatMap((product) => product.variants);
  const stockOnHand = variants.reduce(
    (total, variant) => total + variant.stock,
    0,
  );
  const lowStock = variants.filter((variant) => variant.stock <= 5).length;
  const publishedProducts = products.filter((product) => product.active).length;

  return (
    <section className={styles.workspace} aria-labelledby="merch-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Shop</p>
          <h2 id="merch-heading">Merchandise studio</h2>
          <p className="stage-head__lede">
            Shape the collection, watch inventory and keep every product ready
            for the shop floor.
          </p>
        </div>
        <div className="stage-head__actions">
          <Link className={styles.addProduct} href={productEditorHref("")}>
            <PlusIcon size={16} weight="bold" aria-hidden="true" />
            Add product
          </Link>
        </div>
      </header>

      {message ? (
        <p className={styles.notice} role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <ul className={styles.summary} aria-label="Merchandise overview">
        <li>
          <span className={styles.summaryIcon} aria-hidden="true">
            <StorefrontIcon size={19} weight="duotone" />
          </span>
          <span className={styles.summaryCopy}>Published products</span>
          <strong>{publishedProducts}</strong>
          <small>of {products.length} in the catalogue</small>
        </li>
        <li>
          <span className={styles.summaryIcon} aria-hidden="true">
            <PackageIcon size={19} weight="duotone" />
          </span>
          <span className={styles.summaryCopy}>Units on hand</span>
          <strong>{stockOnHand}</strong>
          <small>across {variants.length} variants</small>
        </li>
        <li data-attention={lowStock > 0 ? "true" : undefined}>
          <span className={styles.summaryIcon} aria-hidden="true">
            <TrendDownIcon size={19} weight="duotone" />
          </span>
          <span className={styles.summaryCopy}>Low stock</span>
          <strong>{lowStock}</strong>
          <small>
            {lowStock ? "variants need attention" : "inventory looks healthy"}
          </small>
        </li>
      </ul>

      {products.length ? (
        <section
          className={styles.catalogue}
          aria-labelledby="catalogue-heading"
        >
          <div className={styles.sectionHead}>
            <div>
              <p>Catalogue</p>
              <h3 id="catalogue-heading">Products and inventory</h3>
            </div>
            <span>
              {products.length} {products.length === 1 ? "product" : "products"}
            </span>
          </div>
          <ul className={styles.rows}>
            {products.map((product) => (
              <li className={styles.row} key={product.id}>
                <div className={styles.rowHead}>
                  <span className={styles.productMark} aria-hidden="true">
                    <CubeIcon size={22} weight="duotone" />
                  </span>
                  <div className={styles.rowBody}>
                    <strong className={styles.rowTitle}>{product.name}</strong>
                    <span className={styles.rowMeta}>
                      <span
                        className={styles.badge}
                        data-state={product.active ? "live" : undefined}
                      >
                        {product.active ? "Published" : "Hidden"}
                      </span>
                      <span className={styles.rowSlug}>
                        /shop/{product.slug}
                      </span>
                    </span>
                  </div>
                  <div className={styles.rowTools}>
                    <Link
                      className={styles.rowLink}
                      href={productEditorHref(product.id)}
                    >
                      <PencilSimpleIcon size={15} aria-hidden="true" />
                      Edit
                    </Link>
                    <button
                      className={styles.variantButton}
                      type="button"
                      onClick={() => {
                        setVariantDraft({
                          id: "",
                          product_id: product.id,
                          sku: "",
                          label: "",
                          price: "",
                          currency: "GHS",
                          stock: 0,
                          active: true,
                          sort_order: product.variants.length,
                        });
                        setVariantOpen(true);
                      }}
                    >
                      <PlusIcon size={15} weight="bold" aria-hidden="true" />
                      Add variant
                    </button>
                  </div>
                </div>

                {product.variants.length ? (
                  <table className={styles.variants}>
                    <thead>
                      <tr>
                        <th>Variant</th>
                        <th>SKU</th>
                        <th>Price</th>
                        <th>Stock</th>
                        <th>State</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.variants.map((variant) => (
                        <tr key={variant.id}>
                          <td data-label="Variant">{variant.label}</td>
                          <td data-label="SKU">{variant.sku || "—"}</td>
                          <td data-label="Price">
                            <span className={styles.money}>
                              {variant.currency} {variant.price}
                            </span>
                          </td>
                          <td
                            data-label="Stock"
                            data-low={variant.stock <= 5 ? "true" : undefined}
                          >
                            <span className={styles.stockCount}>
                              {variant.stock}
                            </span>
                            <span className={styles.stockLabel}>
                              {variant.stock === 0
                                ? "Out"
                                : variant.stock <= 5
                                  ? "Low"
                                  : "In stock"}
                            </span>
                          </td>
                          <td data-label="State">
                            <span
                              className={styles.state}
                              data-active={variant.active ? "true" : undefined}
                            >
                              {variant.active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td data-label="Actions">
                            <button
                              className={styles.iconButton}
                              type="button"
                              aria-label={`Edit ${variant.label}`}
                              onClick={() => {
                                setVariantDraft(variant);
                                setVariantOpen(true);
                              }}
                            >
                              <PencilSimpleIcon size={16} aria-hidden="true" />
                            </button>
                            <button
                              className={styles.iconButton}
                              data-danger="true"
                              type="button"
                              aria-label={`Remove ${variant.label}`}
                              onClick={() => void removeVariant(variant.id)}
                            >
                              <TrashIcon size={16} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className={styles.blank}>
                    No variants yet. A product needs at least one before it can
                    be bought.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState
          announce={false}
          tone="media"
          title="No products yet"
          description="Add a product, then give it variants — a size or colour, each with its own price and stock."
        />
      )}

      <section className={styles.ordersBlock} aria-labelledby="merch-orders">
        <div className={styles.sectionHead}>
          <div>
            <p>Fulfilment</p>
            <h3 id="merch-orders">Recent orders</h3>
          </div>
          <span>
            {orders.length} {orders.length === 1 ? "order" : "orders"}
          </span>
        </div>
        {orders.length ? (
          <table className={styles.orders}>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Buyer</th>
                <th>Items</th>
                <th>Ship to</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.reference}</td>
                  <td>
                    {order.buyer.name}
                    <br />
                    {order.buyer.email}
                  </td>
                  <td>
                    {order.lines.map((line, index) => (
                      <span key={index}>
                        {line.quantity}× {line.product_name} (
                        {line.variant_label})
                        <br />
                      </span>
                    ))}
                  </td>
                  <td>
                    {order.delivery.city}, {order.delivery.country_code}
                  </td>
                  <td>
                    {order.currency} {order.total}
                  </td>
                  <td>
                    <span className={styles.orderState}>{order.status}</span>
                    <ArrowRightIcon
                      className={styles.orderArrow}
                      size={15}
                      aria-hidden="true"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            announce={false}
            tone="inbox"
            title="No orders yet"
            description="Paid merchandise orders appear here with the delivery address to ship to."
          />
        )}
      </section>

      {variantOpen && variantDraft ? (
        <AdminDialog
          title={variantDraft.id ? "Edit variant" : "Add variant"}
          description="A size or colour with its own price and stock count."
          onClose={() => setVariantOpen(false)}
        >
          <form className={styles.form} onSubmit={saveVariant}>
            <div className={styles.fieldGrid}>
              <label>
                Label <span className={styles.hint}>— e.g. Large</span>
                <input
                  value={variantDraft.label}
                  onChange={(event) =>
                    setVariantDraft({
                      ...variantDraft,
                      label: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                SKU
                <input
                  value={variantDraft.sku}
                  onChange={(event) =>
                    setVariantDraft({
                      ...variantDraft,
                      sku: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Price <span className={styles.hint}>— e.g. 150.00</span>
                <input
                  value={variantDraft.price}
                  onChange={(event) =>
                    setVariantDraft({
                      ...variantDraft,
                      price: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                Stock
                <input
                  type="number"
                  min={0}
                  value={variantDraft.stock}
                  onChange={(event) =>
                    setVariantDraft({
                      ...variantDraft,
                      stock: Number(event.target.value) || 0,
                    })
                  }
                />
              </label>
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={variantDraft.active}
                onChange={(event) =>
                  setVariantDraft({
                    ...variantDraft,
                    active: event.target.checked,
                  })
                }
              />
              Available to buy
            </label>
            <button className="primary" type="submit" disabled={pending}>
              Save variant
            </button>
          </form>
        </AdminDialog>
      ) : null}
    </section>
  );
}
