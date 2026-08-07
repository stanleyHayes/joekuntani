"use client";

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./support-dialog.module.css";

type SupportOptions = {
  enabled: boolean;
  currency: string;
  presets: string[];
  min_amount: string;
  max_amount: string;
};

const fallbackOptions: SupportOptions = {
  enabled: false,
  currency: "GHS",
  presets: ["20.00", "50.00", "100.00", "250.00"],
  min_amount: "5.00",
  max_amount: "50000.00",
};

type SupportButtonProps = {
  /** `ghost` sits on an already-emphasised surface such as the footer block. */
  variant?: "solid" | "ghost";
  label?: string;
  className?: string;
};

export function SupportButton({
  variant = "solid",
  label = "Support the artist",
  className,
}: SupportButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerClass = [
    styles.trigger,
    variant === "ghost" ? styles.triggerGhost : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <button
        type="button"
        className={triggerClass}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true" className={styles.triggerHeart}>
          ♥
        </span>
        {label}
      </button>
      {open ? <SupportDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SupportDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [options, setOptions] = useState<SupportOptions>(fallbackOptions);
  const [amount, setAmount] = useState("50.00");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    void fetch("/api/public/support/options", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as SupportOptions;
      })
      .then((body) => {
        if (!current) return;
        setOptions({ ...fallbackOptions, ...body });
        if (body.presets?.length) {
          setAmount(body.presets[1] ?? body.presets[0]);
        }
      })
      .catch(() => {
        /* the fallback tiers keep the form usable */
      });
    return () => {
      current = false;
    };
  }, []);

  const close = useCallback(() => {
    if (!pending) onClose();
  }, [onClose, pending]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/public/support/checkout", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          currency: options.currency,
          name: anonymous ? "" : name.trim(),
          email: email.trim(),
          message: message.trim(),
          anonymous,
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 422
            ? `Enter an amount between ${options.currency} ${options.min_amount} and ${options.currency} ${options.max_amount}, and a valid email address.`
            : "Support payments are temporarily unavailable. Please try again shortly.",
        );
        return;
      }
      const body = (await response.json()) as { checkout_url?: string };
      if (!body.checkout_url) {
        setError("Support payments are temporarily unavailable.");
        return;
      }
      window.location.assign(body.checkout_url);
    } catch {
      setError("Support payments are temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  // Portalled to the body on purpose. Rendered in place, the backdrop sits
  // inside the sticky header, whose z-index and backdrop-filter both open a
  // stacking context — so a position:fixed overlay resolved against the header
  // box instead of the viewport and page content painted over the dialog.
  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
      >
        <button
          type="button"
          className={styles.close}
          onClick={close}
          aria-label="Close support panel"
        >
          ✕
        </button>
        <p className={styles.eyebrow}>Support the artist</p>
        <h2 className={styles.title} id={titleId}>
          Back the work directly
        </h2>
        <p className={styles.lede}>
          Contributions go straight to rehearsal time, gear and getting the show
          on the road. Give once — no subscription, no account needed.
        </p>

        {!options.enabled ? (
          <div className={styles.notReady}>
            <p>
              Online contributions aren&apos;t switched on yet. The payment
              provider is still being connected.
            </p>
            <p className={styles.footnote}>
              In the meantime, the most valuable support is booking a show or
              sharing the work.
            </p>
            <a className={styles.submit} href="/book">
              Make an enquiry
            </a>
          </div>
        ) : (
        <form className={styles.form} onSubmit={submit}>
          <div>
            <span className={styles.fieldLabel} id="support-amount-label">
              Choose an amount
            </span>
            <div
              className={styles.tiers}
              role="group"
              aria-labelledby="support-amount-label"
            >
              {options.presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={styles.tier}
                  aria-pressed={amount === preset}
                  onClick={() => setAmount(preset)}
                >
                  {options.currency} {preset}
                </button>
              ))}
            </div>
          </div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Or enter your own amount</span>
            <span className={styles.amountRow}>
              <span className={styles.currency}>{options.currency}</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-label={`Amount in ${options.currency}`}
                required
              />
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Email for your receipt</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>

          {!anonymous ? (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Your name (optional)</span>
              <input
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="How you'd like to be thanked"
              />
            </label>
          ) : null}

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Message (optional)</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={500}
              placeholder="Say something to Joe"
            />
          </label>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(event) => setAnonymous(event.target.checked)}
            />
            Give anonymously — don&apos;t show my name anywhere
          </label>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <button className={styles.submit} type="submit" disabled={pending}>
            {pending ? "Opening secure checkout…" : "Continue to payment"}
          </button>
          <p className={styles.footnote}>
            Payment is handled by Paystack. Card details never touch this site.
          </p>
        </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
