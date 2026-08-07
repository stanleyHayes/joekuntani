"use client";

import { FormEvent, useId, useRef, useState } from "react";
import type { PublicService } from "../services/types";
import type { PublicSettings } from "../../lib/settings";
import { ButtonLink } from "../ui/button-link";
import { EmptyState } from "../ui/empty-state";
import { Select } from "../ui/select";
import styles from "./public-info.module.css";

const MESSAGE_MIN = 20;
const MESSAGE_MAX = 8000;
/** Deliberately permissive: the server is the authority, this only catches typos. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type FieldName = "name" | "email" | "message" | "consent";
type Errors = Partial<Record<FieldName, string>>;

type Draft = {
  name: string;
  email: string;
  phone: string;
  organization: string;
  message: string;
  consent: boolean;
};

const EMPTY: Draft = {
  name: "",
  email: "",
  phone: "",
  organization: "",
  message: "",
  consent: false,
};

function validate(draft: Draft): Errors {
  const errors: Errors = {};
  if (draft.name.trim().length < 2)
    errors.name = "Tell us who the enquiry is from.";
  if (!EMAIL.test(draft.email.trim()))
    errors.email = "Enter an email address we can reply to.";
  const message = draft.message.trim();
  if (message.length < MESSAGE_MIN)
    errors.message = `Add a little more detail — ${MESSAGE_MIN - message.length} more character${MESSAGE_MIN - message.length === 1 ? "" : "s"} to go.`;
  if (!draft.consent)
    errors.consent = "Accept the approved privacy consent before submitting.";
  return errors;
}

export function ContactForm({
  services,
  settings,
}: {
  services: PublicService[];
  settings: PublicSettings | null;
}) {
  const fieldId = useId();
  const [pending, setPending] = useState(false);
  // Captured at submit time: the draft is cleared on success, so the
  // confirmation has to keep its own copy of the address to quote back.
  const [receipt, setReceipt] = useState<{
    reference: string;
    email: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [copied, setCopied] = useState(false);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const website = useRef<HTMLInputElement>(null);
  // Held across retries so a failed send that actually reached the server
  // cannot create a second enquiry when the visitor presses send again. Only a
  // confirmed success starts a new key.
  const idempotencyKey = useRef<string>("");

  // The routing form needs an approved service and consent copy to submit
  // against. Those can be missing, but a contact page must never leave a
  // visitor with no way to make contact — so fall back to the direct details.
  if (!settings || services.length === 0)
    return (
      <EmptyState
        announce={false}
        tone="inbox"
        title="The enquiry form isn't open yet"
        description="Routing needs an approved service before it can accept submissions. Reach out directly in the meantime — every message is read."
        action={
          <ButtonLink href="/services" variant="primary">
            See what&apos;s offered
          </ButtonLink>
        }
      />
    );
  const approvedSettings = settings;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    // Clear a field's error as soon as the visitor edits it, so the form stops
    // scolding them while they are still fixing it.
    setErrors((current) =>
      current[key as FieldName] ? { ...current, [key]: undefined } : current,
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const found = validate(draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      const first = (["name", "email", "message", "consent"] as const).find(
        (key) => found[key],
      );
      document.getElementById(`${fieldId}-${first}`)?.focus();
      return;
    }
    setErrors({});

    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    setPending(true);
    try {
      const response = await fetch("/api/public/enquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({
          service_id: serviceId,
          contact: {
            name: draft.name.trim(),
            email: draft.email.trim(),
            phone: draft.phone.trim(),
            organization: draft.organization.trim(),
          },
          answers: {},
          project_brief: draft.message.trim(),
          budget: "",
          timeline: "",
          consent: true,
          consent_text: approvedSettings.consent.privacy_label,
          consent_version: approvedSettings.consent.version,
          website: website.current?.value ?? "",
          captcha_token: "",
        }),
      });
      if (!response.ok) {
        // 4xx means this payload will never succeed, so the key is retired to
        // avoid pinning the visitor to a rejected submission.
        if (response.status >= 400 && response.status < 500)
          idempotencyKey.current = "";
        throw new Error(String(response.status));
      }
      const body = (await response.json()) as { reference?: string };
      idempotencyKey.current = "";
      setReceipt({
        reference: body.reference ?? "",
        email: draft.email.trim(),
      });
      setDraft(EMPTY);
    } catch (cause) {
      const status = Number((cause as Error)?.message);
      setError(
        status === 429
          ? "That is a few too many enquiries in a short time. Please try again shortly."
          : status === 422
            ? "Some of these details were rejected. Check them over and try again."
            : "The enquiry could not be submitted. Please try again later.",
      );
    } finally {
      setPending(false);
    }
  }

  if (receipt !== null)
    return (
      <div className={styles.receipt} role="status">
        <p className={styles.receiptEyebrow}>Enquiry received</p>
        <h3>Thanks — that&apos;s with the booking team.</h3>
        <p>
          You&apos;ll get a written reply to{" "}
          <strong>{receipt.email || "the address you gave"}</strong>. Submission
          is not a booking confirmation.
        </p>
        {receipt.reference ? (
          <p className={styles.reference}>
            Reference: <code>{receipt.reference}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(receipt.reference);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </p>
        ) : null}
        <button
          type="button"
          className={styles.secondaryAction}
          onClick={() => {
            setReceipt(null);
            setCopied(false);
          }}
        >
          Send another enquiry
        </button>
      </div>
    );

  const remaining = MESSAGE_MIN - draft.message.trim().length;

  return (
    <form
      className={styles.form}
      onSubmit={submit}
      noValidate
      aria-busy={pending}
    >
      <div className={styles.field}>
        <label htmlFor={`${fieldId}-service`}>Enquiry route</label>
        <Select
          id={`${fieldId}-service`}
          name="service_id"
          aria-label="Enquiry route"
          required
          value={serviceId}
          onChange={setServiceId}
          options={services.map((service) => ({
            value: service.id,
            label: service.name,
          }))}
        />
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor={`${fieldId}-name`}>Name</label>
          <input
            id={`${fieldId}-name`}
            name="name"
            autoComplete="name"
            maxLength={160}
            value={draft.name}
            onChange={(event) => set("name", event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? `${fieldId}-name-error` : undefined}
          />
          {errors.name ? (
            <p className={styles.fieldError} id={`${fieldId}-name-error`}>
              {errors.name}
            </p>
          ) : null}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${fieldId}-email`}>Email</label>
          <input
            id={`${fieldId}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            value={draft.email}
            onChange={(event) => set("email", event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={
              errors.email ? `${fieldId}-email-error` : undefined
            }
          />
          {errors.email ? (
            <p className={styles.fieldError} id={`${fieldId}-email-error`}>
              {errors.email}
            </p>
          ) : null}
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor={`${fieldId}-organization`}>
            Organization <span className={styles.optional}>(optional)</span>
          </label>
          <input
            id={`${fieldId}-organization`}
            name="organization"
            autoComplete="organization"
            maxLength={160}
            value={draft.organization}
            onChange={(event) => set("organization", event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor={`${fieldId}-phone`}>
            Phone <span className={styles.optional}>(optional)</span>
          </label>
          <input
            id={`${fieldId}-phone`}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={40}
            value={draft.phone}
            onChange={(event) => set("phone", event.target.value)}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor={`${fieldId}-message`}>Message</label>
        <textarea
          id={`${fieldId}-message`}
          name="message"
          maxLength={MESSAGE_MAX}
          value={draft.message}
          onChange={(event) => set("message", event.target.value)}
          placeholder="Share the date, the room, the audience and anything else that helps route this."
          aria-invalid={Boolean(errors.message)}
          aria-describedby={`${fieldId}-message-hint`}
        />
        <p
          className={errors.message ? styles.fieldError : styles.hint}
          id={`${fieldId}-message-hint`}
        >
          {errors.message
            ? errors.message
            : remaining > 0
              ? `${remaining} more character${remaining === 1 ? "" : "s"} needed.`
              : `${draft.message.length} of ${MESSAGE_MAX.toLocaleString()} characters.`}
        </p>
      </div>

      <label className={styles.honeypot} aria-hidden="true">
        Website
        <input ref={website} name="website" tabIndex={-1} autoComplete="off" />
      </label>

      <div className={styles.field}>
        <label className={styles.consent} htmlFor={`${fieldId}-consent`}>
          <input
            id={`${fieldId}-consent`}
            name="consent"
            type="checkbox"
            value="yes"
            checked={draft.consent}
            onChange={(event) => set("consent", event.target.checked)}
            aria-invalid={Boolean(errors.consent)}
            aria-describedby={
              errors.consent ? `${fieldId}-consent-error` : undefined
            }
          />
          <span>{approvedSettings.consent.privacy_label}</span>
        </label>
        {errors.consent ? (
          <p className={styles.fieldError} id={`${fieldId}-consent-error`}>
            {errors.consent}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      ) : null}

      <button className={styles.submit} disabled={pending} type="submit">
        {pending ? "Sending…" : "Send enquiry"}
      </button>
    </form>
  );
}
