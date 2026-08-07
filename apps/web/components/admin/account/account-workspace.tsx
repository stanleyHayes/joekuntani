"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import styles from "./account-workspace.module.css";

function csrfCookie() {
  const prefix = "jk_admin_csrf=";
  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length) ?? ""
  );
}

type Profile = {
  id: string;
  name: string;
  email: string;
  role: string;
  mfa_enabled?: boolean;
};

export function ProfileWorkspace() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/admin/auth/me", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = (await response.json()) as Profile;
        setProfile(body);
        setName(body.name);
      })
      .catch(() => setError("Could not load your profile."));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("");
    setError("");
    const response = await fetch("/api/admin/auth/me/profile", {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfCookie(),
      },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      setError("Profile could not be saved.");
      return;
    }
    setStatus("Profile updated.");
    setProfile((current) => (current ? { ...current, name } : current));
  }

  if (error && !profile)
    return (
      <AdminErrorState message={error} title="Your profile is unavailable" />
    );
  if (!profile) return <AdminSkeleton label="Loading profile" variant="form" />;

  return (
    <section className={styles.workspace} aria-labelledby="profile-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Your account</p>
          <h2 id="profile-heading">Profile</h2>
          <p className="stage-head__lede">
            Update how your name appears across staff workspaces. Your email and
            role are set by an administrator.
          </p>
        </div>
      </header>
      <div className={styles.layout}>
        <form className={styles.formCard} onSubmit={onSubmit}>
          <p className={styles.blockTitle}>Your details</p>
          <div className={styles.fieldGrid}>
            <label>
              Display name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={120}
              />
            </label>
            <label className={styles.readOnly}>
              Email <span className={styles.hint}>— managed by an admin</span>
              <input value={profile.email} readOnly />
            </label>
            <label className={styles.readOnly}>
              Role <span className={styles.hint}>— managed by an admin</span>
              <input value={profile.role} readOnly />
            </label>
          </div>
          {error ? <p role="alert">{error}</p> : null}
          <div className={styles.formFoot}>
            {status ? (
              <p className={styles.saved} role="status">
                {status}
              </p>
            ) : (
              <p className={styles.muted}>Changes are audited.</p>
            )}
            <button className="primary" type="submit">
              Save profile
            </button>
          </div>
        </form>
        <aside className={styles.identity}>
          <span className={styles.avatar} aria-hidden="true">
            {initials(profile.name)}
          </span>
          <p className={styles.identityName}>{profile.name}</p>
          <dl className={styles.identityFacts}>
            <div>
              <dt>Email</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{profile.role.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Second factor</dt>
              <dd>
                <span className={styles.pill} data-on={!!profile.mfa_enabled}>
                  {profile.mfa_enabled
                    ? "Enabled"
                    : "Not required for this role"}
                </span>
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}

export function SecurityWorkspace() {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/auth/me/password", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfCookie(),
      },
      body: JSON.stringify({
        current_password: form.get("current_password"),
        new_password: form.get("new_password"),
      }),
    });
    if (!response.ok) {
      setError(
        "Password could not be changed. Check the current password and use at least 12 characters.",
      );
      return;
    }
    setStatus("Password updated. Other sessions were signed out.");
    event.currentTarget.reset();
  }

  return (
    <section className={styles.workspace} aria-labelledby="security-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Your account</p>
          <h2 id="security-heading">Security</h2>
          <p className="stage-head__lede">
            Change your password. Every other open session is signed out
            immediately.
          </p>
        </div>
      </header>
      <div className={styles.layout}>
        <form className={styles.formCard} onSubmit={onSubmit}>
          <p className={styles.blockTitle}>Change password</p>
          <div className={styles.fieldGrid}>
            <label>
              Current password
              <input
                name="current_password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              New password{" "}
              <span className={styles.hint}>— at least 12 characters</span>
              <input
                name="new_password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
              />
            </label>
          </div>
          {error ? <p role="alert">{error}</p> : null}
          <div className={styles.formFoot}>
            {status ? (
              <p className={styles.saved} role="status">
                {status}
              </p>
            ) : (
              <p className={styles.muted}>
                You will stay signed in on this device.
              </p>
            )}
            <button className="primary" type="submit">
              Update password
            </button>
          </div>
        </form>
        <aside className={styles.identity}>
          <p className={styles.blockTitle}>What happens next</p>
          <dl className={styles.identityFacts}>
            <div>
              <dt>Other sessions</dt>
              <dd>Signed out the moment the change succeeds</dd>
            </div>
            <div>
              <dt>Audit</dt>
              <dd>The change is recorded without storing the password</dd>
            </div>
            <div>
              <dt>Second factor</dt>
              <dd>Unchanged — your authenticator keeps working</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}

type Prefs = {
  email_product_updates: boolean;
  email_security_alerts: boolean;
  dense_ui: boolean;
  timezone: string;
};

export function PreferencesWorkspace() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  // What the server last confirmed, kept apart from the edited draft so the
  // summary panel can report what is actually in effect rather than mirroring
  // unsaved keystrokes back at the reader.
  const [saved, setSaved] = useState<Prefs | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/admin/auth/me/preferences", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const loaded = (await response.json()) as Prefs;
        setPrefs(loaded);
        setSaved(loaded);
      })
      .catch(() => setError("Could not load preferences."));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!prefs) return;
    setStatus("");
    setError("");
    const response = await fetch("/api/admin/auth/me/preferences", {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfCookie(),
      },
      body: JSON.stringify(prefs),
    });
    if (!response.ok) {
      setError("Preferences could not be saved.");
      return;
    }
    setSaved(prefs);
    setStatus("Preferences saved.");
  }

  if (error && !prefs)
    return (
      <AdminErrorState message={error} title="Preferences are unavailable" />
    );
  if (!prefs)
    return <AdminSkeleton label="Loading preferences" variant="form" />;

  // The summary reports the server's copy, and flags each row the draft has
  // moved away from, so the panel stays a statement of fact rather than an
  // echo of the form beside it.
  const inEffect = saved ?? prefs;
  const facts: {
    label: string;
    value: string;
    on?: boolean;
    pending: boolean;
  }[] = [
    {
      label: "Security alerts",
      value: inEffect.email_security_alerts ? "On" : "Off",
      on: inEffect.email_security_alerts,
      pending: prefs.email_security_alerts !== inEffect.email_security_alerts,
    },
    {
      label: "Product updates",
      value: inEffect.email_product_updates ? "On" : "Off",
      on: inEffect.email_product_updates,
      pending: prefs.email_product_updates !== inEffect.email_product_updates,
    },
    {
      label: "Layout",
      value: inEffect.dense_ui ? "Compact" : "Comfortable",
      pending: prefs.dense_ui !== inEffect.dense_ui,
    },
    {
      label: "Timezone",
      value: inEffect.timezone || "Not set",
      pending: prefs.timezone !== inEffect.timezone,
    },
  ];

  return (
    <section className={styles.workspace} aria-labelledby="prefs-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Your account</p>
          <h2 id="prefs-heading">Preferences</h2>
          <p className="stage-head__lede">
            Choose how this workspace behaves for you. These settings apply to
            your account only.
          </p>
        </div>
      </header>
      <div className={styles.layout}>
        <form className={styles.formCard} onSubmit={onSubmit}>
          <p className={styles.blockTitle}>Email me about</p>
          <div className={styles.toggles}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={prefs.email_security_alerts}
                onChange={(event) =>
                  setPrefs({
                    ...prefs,
                    email_security_alerts: event.target.checked,
                  })
                }
              />
              <span className={styles.toggleCopy}>
                <span>Security alerts</span>
                <span>
                  New sign-ins, password changes and second-factor activity.
                </span>
              </span>
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={prefs.email_product_updates}
                onChange={(event) =>
                  setPrefs({
                    ...prefs,
                    email_product_updates: event.target.checked,
                  })
                }
              />
              <span className={styles.toggleCopy}>
                <span>Product updates</span>
                <span>Occasional notes about new admin features.</span>
              </span>
            </label>
          </div>

          <p className={styles.blockTitle}>Display</p>
          <div className={styles.toggles}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={prefs.dense_ui}
                onChange={(event) =>
                  setPrefs({ ...prefs, dense_ui: event.target.checked })
                }
              />
              <span className={styles.toggleCopy}>
                <span>Compact layouts</span>
                <span>Tighter spacing so more rows fit on screen.</span>
              </span>
            </label>
          </div>

          <div className={styles.fieldGrid}>
            <label>
              Timezone{" "}
              <span className={styles.hint}>— used for dates you see</span>
              <input
                value={prefs.timezone}
                onChange={(event) =>
                  setPrefs({ ...prefs, timezone: event.target.value })
                }
                placeholder="Africa/Accra"
                required
              />
            </label>
          </div>

          {error ? <p role="alert">{error}</p> : null}
          <div className={styles.formFoot}>
            {status ? (
              <p className={styles.saved} role="status">
                {status}
              </p>
            ) : (
              <p className={styles.muted}>
                Preferences apply the next time a page loads.
              </p>
            )}
            <button className="primary" type="submit">
              Save preferences
            </button>
          </div>
        </form>
        <aside className={styles.identity}>
          <p className={styles.blockTitle}>In effect now</p>
          <dl className={styles.identityFacts}>
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>
                  {typeof fact.on === "boolean" ? (
                    <span className={styles.pill} data-on={fact.on}>
                      {fact.value}
                    </span>
                  ) : (
                    fact.value
                  )}
                  {fact.pending ? (
                    <span className={styles.pending}>Unsaved</span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </section>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "JK";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
