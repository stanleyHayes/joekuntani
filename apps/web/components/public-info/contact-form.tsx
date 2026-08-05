"use client";

import { FormEvent, useState } from "react";
import type { PublicService } from "../services/types";
import type { PublicSettings } from "../../lib/settings";
import styles from "./public-info.module.css";

export function ContactForm({
  services,
  settings,
}: {
  services: PublicService[];
  settings: PublicSettings | null;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!settings || services.length === 0)
    return (
      <p role="status" className={styles.notice}>
        Approved contact routing and consent are not available yet. Use the
        enquiry route once an approved service is published.
      </p>
    );
  const approvedSettings = settings;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (form.get("consent") !== "yes")
      return setError("Accept the approved privacy consent before submitting.");
    setPending(true);
    try {
      const response = await fetch("/api/public/enquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          service_id: String(form.get("service_id") ?? ""),
          contact: {
            name: String(form.get("name") ?? ""),
            email: String(form.get("email") ?? ""),
            phone: "",
            organization: String(form.get("organization") ?? ""),
          },
          answers: {},
          project_brief: String(form.get("message") ?? ""),
          budget: "",
          timeline: "",
          consent: true,
          consent_text: approvedSettings.consent.privacy_label,
          consent_version: approvedSettings.consent.version,
          website: String(form.get("website") ?? ""),
          captcha_token: "",
        }),
      });
      if (!response.ok) throw new Error();
      const receipt = (await response.json()) as { reference?: string };
      setMessage(
        receipt.reference
          ? `Enquiry received. Reference: ${receipt.reference}`
          : "Enquiry received.",
      );
      formElement.reset();
    } catch {
      setError("The enquiry could not be submitted. Please try again later.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label>
        Enquiry route
        <select name="service_id" required>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Name
        <input name="name" minLength={2} maxLength={160} required />
      </label>
      <label>
        Email
        <input name="email" type="email" maxLength={254} required />
      </label>
      <label>
        Organization <span>(optional)</span>
        <input name="organization" maxLength={160} />
      </label>
      <label>
        Message
        <textarea name="message" minLength={20} maxLength={8000} required />
      </label>
      <label className={styles.honeypot} aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <label className={styles.consent}>
        <input name="consent" type="checkbox" value="yes" required />
        {approvedSettings.consent.privacy_label}
      </label>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <button disabled={pending} type="submit">
        {pending ? "Submitting…" : "Send enquiry"}
      </button>
    </form>
  );
}
