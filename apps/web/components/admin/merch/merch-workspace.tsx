"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AdminDialog } from "../admin-dialog";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import { EmptyState } from "../../ui/empty-state";
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

  return (
    <section className={styles.workspace} aria-labelledby="merch-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Shop</p>
          <h2 id="merch-heading">Merchandise</h2>
          <p className="stage-head__lede">
            Products carry the copy; variants carry the price and stock. Only
            active products with an active, in-stock variant can be bought.
          </p>
        </div>
        <div className="stage-head__actions">
          <Link className={styles.addProduct} href={productEditorHref("")}>
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

      {products.length ? (
        <ul className={styles.rows}>
          {products.map((product) => (
            <li className={styles.row} key={product.id}>
              <div className={styles.rowHead}>
                <div className={styles.rowBody}>
                  <strong className={styles.rowTitle}>{product.name}</strong>
                  <span className={styles.rowMeta}>
                    <span
                      className={styles.badge}
                      data-state={product.active ? "live" : undefined}
                    >
                      {product.active ? "Published" : "Hidden"}
                    </span>
                    <span className={styles.rowSlug}>/shop/{product.slug}</span>
                  </span>
                </div>
                <div className={styles.rowTools}>
                  <Link
                    className={styles.rowLink}
                    href={productEditorHref(product.id)}
                  >
                    Edit
                  </Link>
                  <button
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
                        <td>{variant.label}</td>
                        <td>{variant.sku || "—"}</td>
                        <td>
                          {variant.currency} {variant.price}
                        </td>
                        <td data-low={variant.stock === 0 ? "true" : undefined}>
                          {variant.stock}
                        </td>
                        <td>{variant.active ? "Active" : "Inactive"}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => {
                              setVariantDraft(variant);
                              setVariantOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeVariant(variant.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className={styles.blank}>
                  No variants yet. A product needs at least one before it can be
                  bought.
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          announce={false}
          tone="media"
          title="No products yet"
          description="Add a product, then give it variants — a size or colour, each with its own price and stock."
        />
      )}

      <section className={styles.ordersBlock} aria-labelledby="merch-orders">
        <h3 id="merch-orders" className={styles.blockTitle}>
          Recent orders
        </h3>
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
                  <td>{order.status}</td>
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
