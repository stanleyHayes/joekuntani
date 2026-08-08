"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "../../layout/brand-mark";
import { ButtonPending } from "../admin-feedback";
import { AuthHero } from "./auth-hero";
import styles from "./auth-form.module.css";

type Invitation = { name: string; email: string; role: string };

const ROLE_LABELS: Record<string, string> = {
  administrator: "Administrator",
  booking_manager: "Booking manager",
  content_editor: "Content editor",
  analyst: "Analyst",
};

export function AcceptInviteForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  // Derived rather than set from the effect: with no token there is nothing to
  // look up, so the "no longer valid" copy is correct on the first paint.
  const [checking, setChecking] = useState(Boolean(token));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!token) return;
    let current = true;
    void (async () => {
      try {
        const response = await fetch(
          `/api/admin/auth/invitations/${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        if (!current) return;
        if (response.ok) setInvitation((await response.json()) as Invitation);
      } catch {
        /* Falls through to the expired-invitation copy below. */
      } finally {
        if (current) setChecking(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) {
      setError("Those passwords do not match.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/auth/invitations/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        },
      );
      if (!response.ok) {
        setError(
          response.status === 400
            ? "Choose a password of at least 12 characters."
            : "This invitation is no longer valid. Ask an administrator to send a new one.",
        );
        return;
      }
      router.replace("/admin/login");
      router.refresh();
    } catch {
      setError("That could not be completed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.split}>
      <AuthHero
        tag="Staff console"
        lead="Set your "
        accent="own"
        trail=" password."
        copy="Nobody else has ever held it — not the administrator who invited you, and not this system before now."
        facts={[
          { term: "Link", detail: "Single use, expires 15 minutes after issue" },
          { term: "Password", detail: "At least 12 characters" },
          { term: "Changes", detail: "Audited server-side" },
        ]}
      />

      <section className={styles.panel} aria-labelledby="accept-invite-title">
        <div className={styles.brandRow}>
          <BrandMark className={styles.brandMark} />
          <p className={styles.brandMeta}>Staff console</p>
        </div>
        <p className={styles.eyebrow}>Staff invitation</p>
        <h1 id="accept-invite-title" className={styles.title}>
          {invitation ? `Welcome, ${invitation.name}` : "Activate your account"}
        </h1>

        {checking ? (
          <p className={styles.intro}>Checking this invitation…</p>
        ) : invitation ? (
          <>
            <p className={styles.intro}>
              Set a password for <strong>{invitation.email}</strong> as{" "}
              {ROLE_LABELS[invitation.role] ?? invitation.role}. You will sign in
              with it straight afterwards.
            </p>
            <form className={styles.form} onSubmit={submit}>
              <label className={styles.label}>
                New password
                <span className={styles.passwordField}>
                  <input
                    className={styles.input}
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="At least 12 characters"
                    minLength={12}
                    required
                  />
                  <button
                    type="button"
                    className={styles.reveal}
                    aria-pressed={showPassword}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
              <label className={styles.label}>
                Confirm password
                <input
                  className={styles.input}
                  name="confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Repeat the password"
                  minLength={12}
                  required
                />
              </label>
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
              <button
                className={styles.button}
                disabled={pending}
                type="submit"
              >
                <span>
                  {pending ? (
                    <ButtonPending label="Activating your account" />
                  ) : (
                    "Set password and continue"
                  )}
                </span>
                <span className={styles.buttonArrow} aria-hidden="true">
                  →
                </span>
              </button>
            </form>
          </>
        ) : (
          <>
            <p className={styles.intro}>
              This invitation link is not valid. It may have expired, or it may
              already have been used to set a password.
            </p>
            <p className={styles.error} role="alert">
              Ask an administrator to send you a new invitation.
            </p>
          </>
        )}

        <p className={styles.help}>
          Administrators continue with a second factor on their first sign-in.
          Security-relevant activity is audited.
        </p>
      </section>
    </main>
  );
}
