"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark, BRAND_LOGO_SRC } from "../../layout/brand-mark";
import { OTPInput } from "../../ui/otp-input";
import { ButtonPending } from "../admin-feedback";
import { MFAQR } from "./mfa-qr";
import styles from "./auth-form.module.css";

type MFASetup = {
  email: string;
  secret: string;
  otpauth_uri: string;
};

export function MFAForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<MFASetup | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [copied, setCopied] = useState<"secret" | "uri" | "">("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/auth/mfa/setup", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          if (!cancelled && response.status === 401) {
            setSetupError(
              "Your sign-in session expired. Return to sign in, then open this page again.",
            );
          }
          return;
        }
        const payload = (await response.json()) as MFASetup;
        if (!cancelled && payload.otpauth_uri && payload.secret) {
          setSetup(payload);
          setSetupOpen(true);
        }
      } catch {
        /* setup panel is optional when verify works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy(value: string, kind: "secret" | "uri") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      setError("Could not copy to clipboard. Select the value manually.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6) {
      setError("Enter all six digits from your authenticator app.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/auth/mfa/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        setError("That verification code was not accepted.");
        setCode("");
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
    <main className={styles.split}>
      <aside className={styles.hero} aria-hidden="true">
        <div className={styles.heroInner}>
          <div className={styles.heroTop}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              className={styles.heroLogo}
              height={160}
              src={BRAND_LOGO_SRC}
              width={160}
            />
            <div>
              <p className={styles.heroBrand}>Joe Kuntani</p>
              <p className={styles.heroTag}>Second factor</p>
            </div>
          </div>
          <div className={styles.heroStatement}>
            <p className={styles.heroDisplay}>
              One more <em>step</em>.
            </p>
            <p className={styles.heroCopy}>
              Scan the QR once, then enter the rotating six-digit code to finish
              sign-in.
            </p>
          </div>
          <dl className={styles.heroRail}>
            <div className={styles.heroRailItem}>
              <dt>Code</dt>
              <dd>Rotates every 30s</dd>
            </div>
            <div className={styles.heroRailItem}>
              <dt>Setup</dt>
              <dd>Scanned once per device</dd>
            </div>
            <div className={styles.heroRailItem}>
              <dt>Attempts</dt>
              <dd>Rate-limited and logged</dd>
            </div>
          </dl>
        </div>
      </aside>

      <section className={styles.panel} aria-labelledby="mfa-title">
        <div className={styles.brandRow}>
          <BrandMark className={styles.brandMark} />
          <p className={styles.brandMeta}>Staff console</p>
        </div>
        <p className={styles.eyebrow}>Second factor</p>
        <h1 id="mfa-title" className={styles.title}>
          Verify access
        </h1>
        <p className={styles.intro}>
          Administrators always need an authenticator code. If you have not
          scanned a QR yet, open setup below, add the account, then enter the
          six digits.
        </p>

        {setupError ? (
          <p className={styles.error} role="alert">
            {setupError}
          </p>
        ) : null}

        {setup ? (
          <details
            className={styles.setup}
            open={setupOpen}
            onToggle={(event) =>
              setSetupOpen((event.currentTarget as HTMLDetailsElement).open)
            }
          >
            <summary>Set up authenticator first</summary>
            <div className={styles.setupBody}>
              <ol className={styles.setupSteps}>
                <li>
                  Install an authenticator app (Google Authenticator, 1Password,
                  Authy).
                </li>
                <li>Scan the QR code below, or enter the secret manually.</li>
                <li>Enter the rotating six-digit code in the boxes.</li>
              </ol>
              <MFAQR otpauthUri={setup.otpauth_uri} />
              <p className={styles.setupLabel}>Account</p>
              <p className={styles.setupValue}>{setup.email}</p>
              <p className={styles.setupLabel}>Manual secret</p>
              <div className={styles.setupRow}>
                <code className={styles.secret}>{setup.secret}</code>
                <button
                  type="button"
                  className={styles.copy}
                  onClick={() => void copy(setup.secret, "secret")}
                >
                  {copied === "secret" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className={styles.setupLabel}>Authenticator link</p>
              <div className={styles.setupRow}>
                <a className={styles.otpauth} href={setup.otpauth_uri}>
                  Open in authenticator
                </a>
                <button
                  type="button"
                  className={styles.copy}
                  onClick={() => void copy(setup.otpauth_uri, "uri")}
                >
                  {copied === "uri" ? "Copied" : "Copy URI"}
                </button>
              </div>
            </div>
          </details>
        ) : null}

        <form className={styles.form} onSubmit={submit}>
          <div className={styles.label}>
            Verification code
            <OTPInput
              value={code}
              onChange={setCode}
              disabled={pending}
              autoFocus
            />
          </div>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <button
            className={styles.button}
            disabled={pending || code.length !== 6}
            type="submit"
          >
            <span>
              {pending ? (
                <ButtonPending label="Verifying access" />
              ) : (
                "Verify and continue"
              )}
            </span>
            <span className={styles.buttonArrow} aria-hidden="true">
              →
            </span>
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
