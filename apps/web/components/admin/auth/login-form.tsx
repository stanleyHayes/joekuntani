"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./auth-form.module.css";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      if (!response.ok) {
        setError("Sign-in was not accepted. Check your details and try again.");
        return;
      }
      const result = (await response.json()) as { mfa_required: boolean };
      router.replace(result.mfa_required ? "/admin/login/mfa" : "/admin");
      router.refresh();
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-labelledby="sign-in-title">
        <p className={styles.eyebrow}>Authorized staff only</p>
        <h1 id="sign-in-title" className={styles.title}>
          Administration
        </h1>
        <p className={styles.intro}>
          Sign in with your staff account. Administrator access always requires
          a second factor.
        </p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.label}>
            Email address
            <input
              className={styles.input}
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </label>
          <label className={styles.label}>
            Password
            <input
              className={styles.input}
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={12}
              required
            />
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button className={styles.button} disabled={pending} type="submit">
            {pending ? "Signing in…" : "Continue securely"}
          </button>
        </form>
        <p className={styles.help}>
          Repeated attempts are rate-limited and security-relevant activity is
          audited.
        </p>
      </section>
    </main>
  );
}
