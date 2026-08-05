"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./checkout.module.css";

const TERMS_VERSION = "2026-08-05";
const ACCESS_KEY_PREFIX = "jk-ticket-checkout-v1:";

type Receipt = {
  reference: string;
  status: string;
  currency: string;
  total: string;
  hold_expires_at: string;
};

type Stage = "form" | "creating" | "starting" | "ready" | "expired";

export function CheckoutForm({
  eventId,
  ticketTypeId,
  navigate = defaultNavigate,
}: {
  eventId: string;
  ticketTypeId: string;
  navigate?: (url: string) => void;
}) {
  const selectionValid = isUUID(eventId) && isUUID(ticketTypeId);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [providerURL, setProviderURL] = useState("");
  const storageKey = useMemo(
    () => `${ACCESS_KEY_PREFIX}${eventId}:${ticketTypeId}`,
    [eventId, ticketTypeId],
  );

  useEffect(() => {
    if (!receipt || stage === "ready" || stage === "expired") return;
    const expiresAt = Date.parse(receipt.hold_expires_at);
    const delay = expiresAt - Date.now();
    const timer = window.setTimeout(
      () => setStage("expired"),
      Math.max(0, Number.isFinite(delay) ? delay : 0),
    );
    return () => window.clearTimeout(timer);
  }, [receipt, stage]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectionValid) {
      setError("Choose an available event ticket before checking out.");
      return;
    }
    if (!buyerName.trim() || !buyerEmail.trim() || !termsAccepted) {
      setError("Complete your name and email, then accept the ticket terms.");
      return;
    }
    setError("");
    setStage("creating");
    const accessKey = persistentAccessKey(storageKey);
    try {
      const orderResponse = await fetch("/api/public/ticket-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": accessKey,
        },
        body: JSON.stringify({
          event_id: eventId,
          buyer_name: buyerName.trim(),
          buyer_email: buyerEmail.trim(),
          buyer_phone: buyerPhone.trim(),
          terms_accepted: true,
          terms_version: TERMS_VERSION,
          items: [{ ticket_type_id: ticketTypeId, quantity }],
        }),
      });
      if (!orderResponse.ok)
        throw new Error(problemMessage(orderResponse.status));
      const order = parseReceipt(await orderResponse.json());
      if (!order)
        throw new Error("The order service returned an invalid response.");
      setReceipt(order);
      if (Date.parse(order.hold_expires_at) <= Date.now()) {
        setStage("expired");
        return;
      }
      setStage("starting");
      const checkoutResponse = await fetch(
        `/api/public/ticket-orders/${encodeURIComponent(order.reference)}/checkout`,
        {
          method: "POST",
          headers: { "Order-Access-Key": accessKey },
        },
      );
      if (!checkoutResponse.ok)
        throw new Error(problemMessage(checkoutResponse.status));
      const checkout = (await checkoutResponse.json()) as unknown;
      const url = checkoutURL(checkout);
      if (!url) throw new Error("Secure payment is temporarily unavailable.");
      setProviderURL(url);
      setStage("ready");
      navigate(url);
    } catch (cause) {
      setStage("form");
      setError(
        cause instanceof Error
          ? cause.message
          : "Checkout could not be started. Please try again.",
      );
    }
  }

  if (!selectionValid)
    return (
      <section className={styles.shell} aria-labelledby="checkout-heading">
        <p className={styles.eyebrow}>Ticket checkout</p>
        <h1 id="checkout-heading">Choose a ticket first</h1>
        <p role="alert">
          This checkout link is incomplete or no longer valid. Return to the
          event and choose an available ticket.
        </p>
        <Link className={styles.primary} href="/events">
          Browse events
        </Link>
      </section>
    );

  if (stage === "expired")
    return (
      <section className={styles.shell} aria-labelledby="checkout-heading">
        <p className={styles.eyebrow}>Reservation expired</p>
        <h1 id="checkout-heading">Your ticket hold has ended</h1>
        <p role="alert">
          No payment was confirmed. Return to the event to check current
          availability and create a new reservation.
        </p>
        <Link className={styles.primary} href="/events">
          Return to events
        </Link>
      </section>
    );

  if (stage === "ready")
    return (
      <section
        className={styles.shell}
        aria-labelledby="checkout-heading"
        aria-live="polite"
      >
        <p className={styles.eyebrow}>Secure payment</p>
        <h1 id="checkout-heading">Continue to payment</h1>
        <p>Your reservation is ready. You are being redirected securely.</p>
        <a className={styles.primary} href={providerURL} rel="noreferrer">
          Continue if you are not redirected
        </a>
      </section>
    );

  const pending = stage === "creating" || stage === "starting";
  return (
    <section className={styles.shell} aria-labelledby="checkout-heading">
      <p className={styles.eyebrow}>Ticket checkout</p>
      <h1 id="checkout-heading">Reserve your tickets</h1>
      <p>
        Your reservation is temporary. Payment is confirmed only after the
        payment provider reports success.
      </p>
      {receipt ? (
        <p className={styles.receipt}>
          Order <strong>{receipt.reference}</strong> · {receipt.currency}{" "}
          {receipt.total}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <form onSubmit={submit} className={styles.form} noValidate>
        <label>
          Full name
          <input
            autoComplete="name"
            maxLength={160}
            required
            value={buyerName}
            onChange={(event) => setBuyerName(event.target.value)}
          />
        </label>
        <label>
          Email
          <input
            autoComplete="email"
            maxLength={254}
            required
            type="email"
            value={buyerEmail}
            onChange={(event) => setBuyerEmail(event.target.value)}
          />
        </label>
        <label>
          Phone <span className={styles.optional}>(optional)</span>
          <input
            autoComplete="tel"
            maxLength={40}
            type="tel"
            value={buyerPhone}
            onChange={(event) => setBuyerPhone(event.target.value)}
          />
        </label>
        <label>
          Quantity
          <input
            inputMode="numeric"
            min={1}
            max={1000}
            required
            type="number"
            value={quantity}
            onChange={(event) =>
              setQuantity(
                Math.max(1, Math.min(1000, Number(event.target.value) || 1)),
              )
            }
          />
        </label>
        <label className={styles.check}>
          <input
            checked={termsAccepted}
            required
            type="checkbox"
            onChange={(event) => setTermsAccepted(event.target.checked)}
          />
          <span>I accept the event entry, refund, and ticket terms.</span>
        </label>
        <button className={styles.primary} disabled={pending} type="submit">
          {stage === "creating"
            ? "Reserving tickets…"
            : stage === "starting"
              ? "Opening secure payment…"
              : "Reserve and continue"}
        </button>
        {pending ? (
          <p role="status">Please wait. Do not close this page.</p>
        ) : null}
      </form>
    </section>
  );
}

export function checkoutURL(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  const value = record.checkout_url;
  const expiresAt = record.expires_at;
  if (
    typeof value !== "string" ||
    typeof expiresAt !== "string" ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= Date.now()
  )
    return "";
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.toString()
      : "";
  } catch {
    return "";
  }
}

function parseReceipt(value: unknown): Receipt | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.reference !== "string" ||
    !/^JKT-[0-9]{4}-[A-Z0-9]{8}$/.test(item.reference) ||
    typeof item.status !== "string" ||
    typeof item.currency !== "string" ||
    typeof item.total !== "string" ||
    typeof item.hold_expires_at !== "string" ||
    !Number.isFinite(Date.parse(item.hold_expires_at))
  )
    return null;
  return item as Receipt;
}

function persistentAccessKey(storageKey: string) {
  const existing = window.localStorage.getItem(storageKey);
  if (existing && isUUID(existing)) return existing;
  const value = crypto.randomUUID();
  window.localStorage.setItem(storageKey, value);
  return value;
}

function isUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function problemMessage(status: number) {
  if (status === 409 || status === 410 || status === 422)
    return "These tickets are no longer available in the requested quantity.";
  return "Checkout could not be started. Please try again.";
}

function defaultNavigate(url: string) {
  window.location.assign(url);
}
