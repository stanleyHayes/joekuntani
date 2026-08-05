"use client";

import { FormEvent, useEffect, useState } from "react";
import type {
  PublicSettings,
  SettingsCTA,
  SettingsLink,
} from "../../../lib/settings";
import styles from "./settings-form.module.css";

type Values = PublicSettings & {
  integrations: {
    email_provider: string;
    media_provider: string;
    analytics_provider: string;
    payment_provider: string;
  };
  team: { notification_recipients: string[]; business_timezone: string };
};
type SettingsResponse = {
  version: number;
  draft: Values;
  content_complete: boolean;
  can_manage: boolean;
  secret_status: Record<string, boolean>;
};

export function SettingsForm() {
  const [state, setState] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    void (async () => {
      setError("");
      try {
        const response = await fetch("/api/admin/settings", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) throw new Error();
        setState((await response.json()) as SettingsResponse);
      } catch {
        setError("Settings could not be loaded. Try again.");
      }
    })();
  }, []);
  function patch<K extends keyof Values>(key: K, value: Values[K]) {
    setState((current) =>
      current
        ? { ...current, draft: { ...current.draft, [key]: value } }
        : current,
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!state) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfCookie(),
        },
        body: JSON.stringify({
          version: state.version,
          values: state.draft,
          content_complete: state.content_complete,
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 409
            ? "Another editor saved changes. Reload before trying again."
            : "The settings were not accepted. Review every field.",
        );
        return;
      }
      const updated = (await response.json()) as SettingsResponse;
      setState((current) => (current ? { ...current, ...updated } : current));
      setNotice("Draft settings saved and audited.");
    } catch {
      setError("Settings could not be saved.");
    } finally {
      setPending(false);
    }
  }
  async function publish() {
    if (!state?.can_manage) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/settings/publish", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfCookie(),
        },
        body: JSON.stringify({ version: state.version }),
      });
      if (!response.ok) {
        setError(
          response.status === 409
            ? "The draft changed. Reload before publishing."
            : "Publishing is blocked until content is complete and valid.",
        );
        return;
      }
      const updated = (await response.json()) as SettingsResponse;
      setState((current) => (current ? { ...current, ...updated } : current));
      setNotice("Approved settings published.");
    } catch {
      setError("Settings could not be published.");
    } finally {
      setPending(false);
    }
  }
  if (!state)
    return (
      <div className={styles.state} role="status">
        {error || "Loading settings…"}
      </div>
    );
  const draft = state.draft;
  return (
    <form className={styles.form} onSubmit={save}>
      <div className={styles.toolbar}>
        <div>
          <strong>Draft version {state.version}</strong>
          <span
            className={
              state.content_complete ? styles.complete : styles.incomplete
            }
          >
            {state.content_complete ? "Marked complete" : "Content incomplete"}
          </span>
        </div>
        <div className={styles.actions}>
          <button disabled={pending} type="submit">
            Save draft
          </button>
          {state.can_manage && (
            <button
              className={styles.publish}
              disabled={pending || !state.content_complete}
              onClick={publish}
              type="button"
            >
              Publish approved settings
            </button>
          )}
        </div>
      </div>
      {(error || notice) && (
        <p
          className={error ? styles.error : styles.notice}
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </p>
      )}
      <section>
        <h2>Brand and SEO defaults</h2>
        <div className={styles.grid}>
          <Field
            label="Public brand name"
            value={draft.brand.name}
            onChange={(value) =>
              patch("brand", { ...draft.brand, name: value })
            }
          />
          <Field
            label="Approved tagline"
            value={draft.brand.tagline}
            onChange={(value) =>
              patch("brand", { ...draft.brand, tagline: value })
            }
          />
          <Field
            label="Logo asset UUID"
            value={draft.brand.logo_asset_id}
            onChange={(value) =>
              patch("brand", { ...draft.brand, logo_asset_id: value })
            }
          />
          <Field
            label="Favicon asset UUID"
            value={draft.brand.favicon_asset_id}
            onChange={(value) =>
              patch("brand", { ...draft.brand, favicon_asset_id: value })
            }
          />
          <Field
            label="Default page title"
            value={draft.seo.default_title}
            onChange={(value) =>
              patch("seo", { ...draft.seo, default_title: value })
            }
          />
          <Field
            label="Title template"
            value={draft.seo.title_template}
            onChange={(value) =>
              patch("seo", { ...draft.seo, title_template: value })
            }
          />
          <Field
            label="SEO description"
            value={draft.seo.description}
            onChange={(value) =>
              patch("seo", { ...draft.seo, description: value })
            }
          />
          <Field
            label="Canonical HTTPS base"
            value={draft.seo.canonical_base}
            onChange={(value) =>
              patch("seo", { ...draft.seo, canonical_base: value })
            }
          />
          <Field
            label="Default social image asset UUID"
            value={draft.seo.social_image_asset_id}
            onChange={(value) =>
              patch("seo", { ...draft.seo, social_image_asset_id: value })
            }
          />
        </div>
      </section>
      <section>
        <h2>Navigation, footer and CTAs</h2>
        <JSONField
          label="Primary navigation"
          value={draft.navigation}
          onChange={(value) => patch("navigation", value as SettingsLink[])}
        />
        <JSONField
          label="Footer links"
          value={draft.footer}
          onChange={(value) => patch("footer", value as SettingsLink[])}
        />
        <JSONField
          label="Calls to action"
          value={draft.ctas}
          onChange={(value) => patch("ctas", value as SettingsCTA[])}
        />
      </section>
      <section>
        <h2>Contact and social</h2>
        <div className={styles.grid}>
          <Field
            label="Public email"
            value={draft.contact.public_email}
            onChange={(value) =>
              patch("contact", { ...draft.contact, public_email: value })
            }
          />
          <Field
            label="Public phone"
            value={draft.contact.phone}
            onChange={(value) =>
              patch("contact", { ...draft.contact, phone: value })
            }
          />
          <Field
            label="Location label"
            value={draft.contact.location}
            onChange={(value) =>
              patch("contact", { ...draft.contact, location: value })
            }
          />
        </div>
        <JSONField
          label="Approved social links"
          value={draft.social}
          onChange={(value) => patch("social", value as Values["social"])}
        />
      </section>
      <section>
        <h2>Consent copy</h2>
        <div className={styles.grid}>
          <Field
            label="Consent version"
            value={draft.consent.version}
            onChange={(value) =>
              patch("consent", { ...draft.consent, version: value })
            }
          />
          <Field
            label="Privacy consent label"
            value={draft.consent.privacy_label}
            onChange={(value) =>
              patch("consent", { ...draft.consent, privacy_label: value })
            }
          />
          <Field
            label="Optional marketing label"
            value={draft.consent.marketing_label}
            onChange={(value) =>
              patch("consent", { ...draft.consent, marketing_label: value })
            }
          />
          <Field
            label="Privacy notice path"
            value={draft.consent.privacy_url}
            onChange={(value) =>
              patch("consent", { ...draft.consent, privacy_url: value })
            }
          />
        </div>
      </section>
      {state.can_manage && (
        <section>
          <h2>Integrations and team controls</h2>
          <p className={styles.help}>
            Secrets are environment-managed and are never displayed or returned
            by this screen.
          </p>
          <div className={styles.grid}>
            <Field
              label="Email provider"
              value={draft.integrations.email_provider}
              onChange={(value) =>
                patch("integrations", {
                  ...draft.integrations,
                  email_provider: value,
                })
              }
            />
            <Field
              label="Media provider"
              value={draft.integrations.media_provider}
              onChange={(value) =>
                patch("integrations", {
                  ...draft.integrations,
                  media_provider: value,
                })
              }
            />
            <Field
              label="Analytics provider"
              value={draft.integrations.analytics_provider}
              onChange={(value) =>
                patch("integrations", {
                  ...draft.integrations,
                  analytics_provider: value,
                })
              }
            />
            <Field
              label="Payment provider"
              value={draft.integrations.payment_provider}
              onChange={(value) =>
                patch("integrations", {
                  ...draft.integrations,
                  payment_provider: value,
                })
              }
            />
            <Field
              label="Business timezone"
              value={draft.team.business_timezone}
              onChange={(value) =>
                patch("team", { ...draft.team, business_timezone: value })
              }
            />
          </div>
          <JSONField
            label="Internal notification recipients"
            value={draft.team.notification_recipients}
            onChange={(value) =>
              patch("team", {
                ...draft.team,
                notification_recipients: value as string[],
              })
            }
          />
          <dl className={styles.statusList}>
            {Object.entries(state.secret_status).map(([name, configured]) => (
              <div key={name}>
                <dt>{name.replaceAll("_", " ")}</dt>
                <dd>{configured ? "Configured" : "Not configured"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {state.can_manage && (
        <label className={styles.checkbox}>
          <input
            checked={state.content_complete}
            onChange={(event) =>
              setState({ ...state, content_complete: event.target.checked })
            }
            type="checkbox"
          />
          I confirm all public settings in this draft are approved and complete.
        </label>
      )}
    </form>
  );
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
function JSONField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange(value: unknown): void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [invalid, setInvalid] = useState(false);
  return (
    <label className={styles.json}>
      <span>{label}</span>
      <textarea
        aria-invalid={invalid}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          try {
            onChange(JSON.parse(next) as unknown);
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
      />
      <small>
        {invalid
          ? "Enter valid JSON before saving."
          : "Structured list; URLs and limits are validated by the server."}
      </small>
    </label>
  );
}
function csrfCookie() {
  return (
    document.cookie
      .split("; ")
      .find((item) => item.startsWith("jk_admin_csrf="))
      ?.split("=")
      .slice(1)
      .join("=") || ""
  );
}
