"use client";

import { useId, useState, type FormEvent } from "react";

import styles from "./newsletter-form.module.css";

/**
 * The public signup the newsletter has never had.
 *
 * The API has accepted subscribers since it shipped and the console has a
 * screen to manage them, but nothing on the public site could ever create
 * one — so the list could only ever be empty.
 *
 * Consent is the reason this is a form rather than a single field. A stored
 * address is only lawful to email if the record says what was agreed and
 * which version of the wording was on screen, so both are sent with it and
 * the box is never pre-ticked.
 */
export type NewsletterConsent = {
  version: string;
  marketingLabel: string;
  privacyURL: string;
};

type State = "idle" | "sending" | "done" | "error";

export function NewsletterForm({
  consent,
  source = "website",
}: {
  consent: NewsletterConsent;
  /** Which surface the signup came from, for the console's Source column. */
  source?: string;
}) {
  const emailID = useId();
  const nameID = useId();
  const consentID = useId();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");

  // Without a consent version there is nothing to record agreement against,
  // so the form does not appear at all rather than collecting an address it
  // could not lawfully use.
  if (!consent.version) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Enter an email address.");
      setState("error");
      return;
    }
    if (!agreed) {
      setError("Tick the box to agree before subscribing.");
      setState("error");
      return;
    }
    setState("sending");
    setError("");
    try {
      const response = await fetch("/api/public/newsletter", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        // Exactly these five: the decoder rejects unknown fields.
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          source,
          consent_version: consent.version,
          consent: true,
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setState("done");
      setEmail("");
      setName("");
      setAgreed(false);
    } catch {
      setState("error");
      setError("That did not go through. Try again in a moment.");
    }
  }

  if (state === "done")
    return (
      <div className={styles.form} role="status">
        <p className={styles.done}>
          You’re on the list. We’ll only write when there’s something worth
          saying.
        </p>
      </div>
    );

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.fields}>
        <label className={styles.field} htmlFor={nameID}>
          <span>Name</span>
          <input
            id={nameID}
            name="name"
            autoComplete="name"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className={styles.field} htmlFor={emailID}>
          <span>Email</span>
          <input
            id={emailID}
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
      </div>

      <label className={styles.consent} htmlFor={consentID}>
        <input
          id={consentID}
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
        />
        <span>
          {consent.marketingLabel || "Email me about shows and releases."}{" "}
          {consent.privacyURL ? (
            <a href={consent.privacyURL}>How we handle your details</a>
          ) : null}
        </span>
      </label>

      <button
        className={styles.submit}
        type="submit"
        disabled={state === "sending"}
      >
        {state === "sending" ? "Subscribing…" : "Subscribe"}
      </button>

      {state === "error" && error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
