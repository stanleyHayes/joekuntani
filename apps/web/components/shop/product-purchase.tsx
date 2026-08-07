"use client";

import { FormEvent, useId, useState } from "react";
import type { MerchProduct, MerchVariant } from "./data";
import styles from "./product-purchase.module.css";

type Props = {
  product: MerchProduct;
  currency: string;
  /** False when no payment provider is configured; the form is not offered. */
  enabled: boolean;
};

export function ProductPurchase({ product, currency, enabled }: Props) {
  const fieldId = useId();
  const sellable = product.variants.filter(
    (variant) => variant.active && variant.stock > 0,
  );
  const [variantId, setVariantId] = useState(sellable[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const selected = sellable.find((variant) => variant.id === variantId) ?? null;
  const maxQuantity = Math.min(selected?.stock ?? 1, 10);

  if (!sellable.length)
    return (
      <p className={styles.notice} role="status">
        Every size is sold out right now. Follow along on social for the next
        drop.
      </p>
    );

  if (!enabled)
    return (
      <p className={styles.notice} role="status">
        Online payment is still being connected, so this cannot be bought yet.
      </p>
    );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/public/merch/checkout", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: [{ variant_id: selected.id, quantity }],
          buyer: {
            name: String(form.get("name") ?? "").trim(),
            email: String(form.get("email") ?? "").trim(),
            phone: String(form.get("phone") ?? "").trim(),
          },
          delivery: {
            address: String(form.get("address") ?? "").trim(),
            city: String(form.get("city") ?? "").trim(),
            region: String(form.get("region") ?? "").trim(),
            country_code: String(form.get("country_code") ?? "GH").trim(),
            notes: String(form.get("notes") ?? "").trim(),
          },
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 409
            ? "That size just sold out. Choose another, or try a smaller quantity."
            : response.status === 422
              ? "Check the delivery details and try again."
              : "Checkout is temporarily unavailable. Please try again shortly.",
        );
        return;
      }
      const body = (await response.json()) as { checkout_url?: string };
      if (!body.checkout_url) {
        setError("Checkout is temporarily unavailable.");
        return;
      }
      window.location.assign(body.checkout_url);
    } catch {
      setError("Checkout is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Choose a size</legend>
        <div className={styles.variants}>
          {sellable.map((variant) => (
            <VariantOption
              key={variant.id}
              variant={variant}
              currency={currency}
              checked={variant.id === variantId}
              onSelect={() => {
                setVariantId(variant.id);
                setQuantity(1);
              }}
            />
          ))}
        </div>
      </fieldset>

      <label className={styles.field}>
        <span className={styles.label}>Quantity</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={maxQuantity}
          value={quantity}
          onChange={(event) =>
            setQuantity(
              Math.max(
                1,
                Math.min(maxQuantity, Number(event.target.value) || 1),
              ),
            )
          }
        />
        <span className={styles.hint}>
          {selected ? `${selected.stock} available` : ""}
        </span>
      </label>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Where it ships</legend>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.label}>Your name</span>
            <input
              name="name"
              id={`${fieldId}-name`}
              required
              maxLength={120}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Email for the receipt</span>
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Phone</span>
            <input name="phone" type="tel" autoComplete="tel" maxLength={40} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Country</span>
            <input
              name="country_code"
              defaultValue="GH"
              maxLength={2}
              required
              aria-describedby={`${fieldId}-country-hint`}
            />
            <span className={styles.hint} id={`${fieldId}-country-hint`}>
              Two-letter code
            </span>
          </label>
          <label className={`${styles.field} ${styles.wide}`}>
            <span className={styles.label}>Delivery address</span>
            <input name="address" required maxLength={300} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>City</span>
            <input name="city" required maxLength={120} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Region</span>
            <input name="region" maxLength={120} />
          </label>
          <label className={`${styles.field} ${styles.wide}`}>
            <span className={styles.label}>Delivery notes (optional)</span>
            <input name="notes" maxLength={500} />
          </label>
        </div>
      </fieldset>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.submitRow}>
        <p className={styles.total}>
          <span className={styles.totalLabel}>Total</span>
          <strong>
            {currency} {lineTotal(selected, quantity)}
          </strong>
        </p>
        <button className={styles.submit} type="submit" disabled={pending}>
          {pending ? "Opening secure checkout…" : "Continue to payment"}
        </button>
      </div>
      <p className={styles.footnote}>
        Payment is handled by Paystack. Card details never touch this site.
      </p>
    </form>
  );
}

function VariantOption({
  variant,
  currency,
  checked,
  onSelect,
}: {
  variant: MerchVariant;
  currency: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label className={styles.variant} data-checked={checked}>
      <input
        type="radio"
        name="variant"
        value={variant.id}
        checked={checked}
        onChange={onSelect}
      />
      <span className={styles.variantLabel}>{variant.label}</span>
      <span className={styles.variantPrice}>
        {currency} {variant.price}
      </span>
    </label>
  );
}

/**
 * Display only — the server reprices the cart from stored variants, so a
 * tampered total here changes nothing about what is charged.
 */
function lineTotal(variant: MerchVariant | null, quantity: number): string {
  if (!variant) return "0.00";
  const minor = Math.round(Number(variant.price) * 100) * quantity;
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}
