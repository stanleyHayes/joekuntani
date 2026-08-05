"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./auth-form.module.css";

export function MFAForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/auth/mfa/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: form.get("code") }),
      });
      if (!response.ok) {
        setError("That verification code was not accepted.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Verification is temporarily unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-labelledby="mfa-title">
        <p className={styles.eyebrow}>Second factor</p>
        <h1 id="mfa-title" className={styles.title}>
          Verify access
        </h1>
        <p className={styles.intro}>
          Enter the current six-digit code from your authenticator app.
        </p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.label}>
            Verification code
            <input
              className={styles.input}
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
            />
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button className={styles.button} disabled={pending} type="submit">
            {pending ? "Verifying…" : "Verify and continue"}
          </button>
        </form>
        <p className={styles.help}>
          <a className={styles.link} href="/admin/login">
            Return to sign in
          </a>
        </p>
      </section>
    </main>
  );
}
