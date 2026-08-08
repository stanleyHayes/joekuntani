"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "../../layout/brand-mark";
import { ButtonPending } from "../admin-feedback";
import { AuthHero } from "./auth-hero";
import styles from "./auth-form.module.css";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
          email: String(form.get("email") ?? "").trim(),
          password: String(form.get("password") ?? "").trim(),
        }),
      });
      if (!response.ok) {
        if (response.status === 403) {
          setError(
            "This browser origin was rejected. Open the site at http://localhost:3000 (not 127.0.0.1) and try again.",
          );
        } else if (response.status === 429) {
          setError("Too many attempts. Wait a minute, then try again.");
        } else if (response.status >= 500) {
          setError(
            "Sign-in service is unavailable. Confirm the API is running on port 8080.",
          );
        } else {
          setError(
            "Sign-in was not accepted. Check your details and try again.",
          );
        }
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
    <main className={styles.split}>
      <AuthHero
        tag="Staff console"
        lead="Run the "
        accent="whole"
        trail=" show."
        copy="Publishing, bookings, CRM and live ticketing — one console, one audited trail."
        facts={[
          { term: "Access", detail: "Second factor enforced" },
          { term: "Sessions", detail: "Expire after 12 hours" },
          { term: "Changes", detail: "Audited server-side" },
        ]}
      />

      <section className={styles.panel} aria-labelledby="sign-in-title">
        <div className={styles.brandRow}>
          <BrandMark className={styles.brandMark} />
          <p className={styles.brandMeta}>Staff console</p>
        </div>
        <p className={styles.eyebrow}>Authorized staff only</p>
        <h1 id="sign-in-title" className={styles.title}>
          Sign in
        </h1>
        <p className={styles.intro}>
          Use your staff account. Administrator sessions always continue with a
          second factor.
        </p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.label}>
            Email address
            <input
              className={styles.input}
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="you@example.com"
              required
            />
          </label>
          <label className={styles.label}>
            Password
            <span className={styles.passwordField}>
              <input
                className={styles.input}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Enter your password"
                minLength={12}
                required
              />
              <button
                type="button"
                className={styles.reveal}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
          </label>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <button className={styles.button} disabled={pending} type="submit">
            <span>
              {pending ? (
                <ButtonPending label="Signing in" />
              ) : (
                "Continue securely"
              )}
            </span>
            <span className={styles.buttonArrow} aria-hidden="true">
              →
            </span>
          </button>
        </form>
        <p className={styles.help}>
          Repeated attempts are rate-limited. Security-relevant activity is
          audited. Use{" "}
          <code className={styles.code}>http://localhost:3000</code> for local
          sign-in.
        </p>
      </section>
    </main>
  );
}
