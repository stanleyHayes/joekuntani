"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import { AssetUploadList } from "../media/asset-picker";
import { api, blankProduct, type Product } from "./merch-api";
import styles from "./product-editor.module.css";

/**
 * The product editor, as a page.
 *
 * It used to be a dialog. A product carries eight controls including a long
 * description and a gallery, which is more than a modal can hold without
 * scrolling inside itself — and a modal that scrolls hides its own save button.
 * On a page the form has room, the browser's back button means what it says,
 * and an unsaved draft survives an accidental click outside it.
 */
export function ProductEditor({ productID }: { productID: string }) {
  const router = useRouter();
  const creating = productID === "new";
  const [draft, setDraft] = useState<Product | null>(
    creating ? blankProduct : null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (creating) return;
    const timer = window.setTimeout(() => {
      void api<{ products: Product[] }>("/api/admin/merch/products")
        .then((body) => {
          const found = (body.products ?? []).find(
            (product) => product.id === productID,
          );
          if (found) setDraft(found);
          else setLoadFailed(true);
        })
        .catch(() => setLoadFailed(true));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [creating, productID]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setPending(true);
    setError("");
    try {
      await api("/api/admin/merch/products", { method: "PUT", body: draft });
      // Back to the list, which reloads and shows the saved row. Staying here
      // would leave an operator wondering whether the save took.
      router.push("/admin/merch");
      router.refresh();
    } catch {
      setError("The product was not accepted. Check the name and slug.");
      setPending(false);
    }
  }

  if (loadFailed)
    return (
      <AdminErrorState
        title="That product could not be opened"
        message="It may have been removed. Return to the shop list and try again."
      />
    );
  if (!draft) return <AdminSkeleton label="Loading product" variant="table" />;

  const field = <K extends keyof Product>(key: K, value: Product[K]) =>
    setDraft({ ...draft, [key]: value });

  return (
    <section className={styles.editor} aria-labelledby="product-editor-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Shop</p>
          <h2 id="product-editor-heading">
            {creating ? "Add product" : `Edit ${draft.name || "product"}`}
          </h2>
          <p className="stage-head__lede">
            Products hold the public copy. Price and stock live on variants,
            which are managed from the shop list.
          </p>
        </div>
        <div className="stage-head__actions">
          <Link className={styles.back} href="/admin/merch">
            Back to shop
          </Link>
        </div>
      </header>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <form className={styles.form} onSubmit={save}>
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Identity</legend>
          <div className={styles.fieldGrid}>
            <label>
              Name
              <input
                value={draft.name}
                onChange={(event) => field("name", event.target.value)}
                required
              />
            </label>
            <label>
              Slug <span className={styles.hint}>— the /shop address</span>
              <input
                value={draft.slug}
                onChange={(event) => field("slug", event.target.value)}
                required
              />
            </label>
            <label>
              Category
              <input
                value={draft.category}
                onChange={(event) => field("category", event.target.value)}
              />
            </label>
            <label>
              Display order
              <input
                type="number"
                value={draft.sort_order}
                onChange={(event) =>
                  field("sort_order", Number(event.target.value) || 0)
                }
              />
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Public copy</legend>
          <div className={styles.stack}>
            <label>
              Summary <span className={styles.hint}>— shown on the card</span>
              <input
                value={draft.summary}
                onChange={(event) => field("summary", event.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                rows={8}
                value={draft.description}
                onChange={(event) => field("description", event.target.value)}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Images</legend>
          <AssetUploadList
            label="Product images"
            hint="The first image is the one shown on the shop card."
            folder="merch"
            values={draft.image_asset_ids}
            onChange={(image_asset_ids) =>
              field("image_asset_ids", image_asset_ids)
            }
            leadBadge="Card"
          />
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Visibility</legend>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => field("active", event.target.checked)}
            />
            Show this product in the public shop
          </label>
          <p className={styles.note}>
            A product only becomes buyable once it also has an active variant
            with stock.
          </p>
        </fieldset>

        <div className={styles.actions}>
          <button className="primary" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save product"}
          </button>
          <Link className={styles.cancel} href="/admin/merch">
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
