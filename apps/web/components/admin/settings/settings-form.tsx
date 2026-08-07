"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { requestUpload } from "../media/media-admin";
import type {
  PublicSettings,
  SettingsCTA,
  SettingsLink,
} from "../../../lib/settings";
import {
  AdminErrorState,
  AdminSkeleton,
  ButtonPending,
} from "../admin-feedback";
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
  const [pendingAction, setPendingAction] = useState<"save" | "publish" | "">(
    "",
  );
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
    setPendingAction("save");
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
      setPendingAction("");
    }
  }
  async function publish() {
    if (!state?.can_manage) return;
    setPending(true);
    setPendingAction("publish");
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
      setPendingAction("");
    }
  }
  if (!state && error)
    return (
      <AdminErrorState message={error} title="Site settings are unavailable" />
    );
  if (!state)
    return <AdminSkeleton label="Loading site settings" variant="form" />;
  const draft = state.draft;
  const secretFlags = Object.values(state.secret_status);
  const secretsTotal = secretFlags.length;
  const secretsSet = secretFlags.filter(Boolean).length;
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
            {pendingAction === "save" ? (
              <ButtonPending label="Saving settings draft" />
            ) : (
              "Save draft"
            )}
          </button>
          {state.can_manage && (
            <button
              className={styles.publish}
              disabled={pending || !state.content_complete}
              onClick={publish}
              type="button"
            >
              {pendingAction === "publish" ? (
                <ButtonPending label="Publishing settings" />
              ) : (
                "Publish approved settings"
              )}
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
          <AssetField
            label="Logo image"
            hint="upload from your device, or paste a media library ID"
            folder="brand"
            value={draft.brand.logo_asset_id}
            onChange={(value) =>
              patch("brand", { ...draft.brand, logo_asset_id: value })
            }
          />
          <AssetField
            label="Browser tab icon"
            hint="upload from your device, or paste a media library ID"
            folder="brand"
            value={draft.brand.favicon_asset_id}
            onChange={(value) =>
              patch("brand", { ...draft.brand, favicon_asset_id: value })
            }
          />
          <Field
            label="Fallback page title" hint="used when a page has no title of its own"
            value={draft.seo.default_title}
            onChange={(value) =>
              patch("seo", { ...draft.seo, default_title: value })
            }
          />
          <Field
            label="Browser tab title pattern" hint="use %s where the page name goes"
            value={draft.seo.title_template}
            onChange={(value) =>
              patch("seo", { ...draft.seo, title_template: value })
            }
          />
          <Field
            label="Search result description" hint="one sentence shown by Google"
            value={draft.seo.description}
            onChange={(value) =>
              patch("seo", { ...draft.seo, description: value })
            }
          />
          <Field
            label="Website address" hint="e.g. https://joekuntani.com"
            value={draft.seo.canonical_base}
            onChange={(value) =>
              patch("seo", { ...draft.seo, canonical_base: value })
            }
          />
          <Field
            label="Default sharing image" hint="asset ID used when a page is shared"
            value={draft.seo.social_image_asset_id}
            onChange={(value) =>
              patch("seo", { ...draft.seo, social_image_asset_id: value })
            }
          />
        </div>
      </section>
      <section>
        <h2>Navigation, footer and CTAs</h2>
        <ListField<SettingsLink>
          title="Primary navigation"
          description="The links in the main site menu, in the order visitors see them."
          addLabel="Add menu link"
          emptyLabel="No menu links yet. Add the first one to build the site menu."
          items={draft.navigation}
          blank={() => ({ label: "", href: "" })}
          onChange={(value) => patch("navigation", value)}
        >
          {(row, update) => (
            <>
              <RowField
                label="Menu text"
                hint="what visitors read"
                value={row.label}
                onChange={(label) => update({ label })}
              />
              <RowField
                label="Goes to"
                hint="e.g. /events"
                value={row.href}
                onChange={(href) => update({ href })}
              />
            </>
          )}
        </ListField>
        <ListField<SettingsLink>
          title="Footer links"
          description="Secondary links shown at the bottom of every public page."
          addLabel="Add footer link"
          emptyLabel="No footer links yet."
          items={draft.footer}
          blank={() => ({ label: "", href: "" })}
          onChange={(value) => patch("footer", value)}
        >
          {(row, update) => (
            <>
              <RowField
                label="Link text"
                value={row.label}
                onChange={(label) => update({ label })}
              />
              <RowField
                label="Goes to"
                hint="e.g. /privacy"
                value={row.href}
                onChange={(href) => update({ href })}
              />
            </>
          )}
        </ListField>
        <ListField<SettingsCTA>
          title="Calls to action"
          description="Promo blocks that invite visitors to book, buy or get in touch."
          addLabel="Add call to action"
          emptyLabel="No calls to action yet."
          items={draft.ctas}
          blank={() => ({
            key: "",
            title: "",
            description: "",
            label: "",
            href: "",
          })}
          onChange={(value) => patch("ctas", value)}
        >
          {(row, update) => (
            <>
              <RowField
                label="Heading"
                value={row.title}
                onChange={(title) => update({ title })}
              />
              <RowField
                label="Button text"
                value={row.label}
                onChange={(label) => update({ label })}
              />
              <RowField
                label="Button goes to"
                hint="e.g. /book"
                value={row.href}
                onChange={(href) => update({ href })}
              />
              <RowField
                label="Reference name"
                hint="internal only, e.g. home-hero"
                value={row.key}
                onChange={(key) => update({ key })}
              />
              <RowField
                label="Supporting sentence"
                wide
                value={row.description}
                onChange={(description) => update({ description })}
              />
            </>
          )}
        </ListField>
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
            label="Location shown publicly"
            value={draft.contact.location}
            onChange={(value) =>
              patch("contact", { ...draft.contact, location: value })
            }
          />
        </div>
        <ListField<Values["social"][number]>
          title="Approved social links"
          description="Profiles linked from the site. Only add accounts you control."
          addLabel="Add social profile"
          emptyLabel="No social profiles yet."
          items={draft.social}
          blank={() => ({ platform: "", url: "" })}
          onChange={(value) => patch("social", value)}
        >
          {(row, update) => (
            <>
              <RowField
                label="Platform"
                hint="e.g. Instagram"
                value={row.platform}
                onChange={(platform) => update({ platform })}
              />
              <RowField
                label="Profile address"
                hint="full https:// link"
                value={row.url}
                onChange={(url) => update({ url })}
              />
            </>
          )}
        </ListField>
      </section>
      <section>
        <h2>Consent copy</h2>
        <div className={styles.grid}>
          <Field
            label="Consent version" hint="bump this when the wording changes"
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
            label="Privacy page address" hint="e.g. /privacy"
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
          <ListField<{ email: string }>
            title="Internal notification recipients"
            description="Staff addresses that receive internal alerts. Not shown publicly."
            addLabel="Add recipient"
            emptyLabel="No recipients yet. Internal alerts will not be delivered."
            items={(draft.team.notification_recipients ?? []).map((email) => ({
              email,
            }))}
            blank={() => ({ email: "" })}
            onChange={(value) =>
              patch("team", {
                ...draft.team,
                notification_recipients: value.map((row) => row.email),
              })
            }
          >
            {(row, update) => (
              <RowField
                label="Email address"
                wide
                value={row.email}
                onChange={(email) => update({ email })}
              />
            )}
          </ListField>
          <div className={styles.secrets}>
            <div className={styles.secretsHead}>
              <h3 className={styles.secretsTitle}>Environment keys</h3>
              <p className={styles.secretsCount}>
                <strong>{secretsSet}</strong> of {secretsTotal} set
              </p>
            </div>
            <dl className={styles.statusList}>
              {Object.entries(state.secret_status).map(([name, configured]) => (
                <div
                  key={name}
                  className={`${styles.statusItem} ${
                    configured ? styles.statusOn : styles.statusOff
                  }`}
                >
                  <dt>{serviceLabel(name)}</dt>
                  <dd>{configured ? "Set" : "Not set"}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}
      {state.can_manage && (
        <div
          className={`${styles.confirm} ${
            state.content_complete ? styles.confirmOn : ""
          }`}
        >
          <div className={styles.confirmHead}>
            <span className={styles.confirmStep}>Before publishing</span>
            <span className={styles.confirmState}>
              {state.content_complete ? "Confirmed" : "Not confirmed"}
            </span>
          </div>
          <label className={styles.checkbox}>
            <input
              checked={state.content_complete}
              onChange={(event) =>
                setState({ ...state, content_complete: event.target.checked })
              }
              type="checkbox"
            />
            <span>
              I confirm all public settings in this draft are approved and
              complete.
            </span>
          </label>
          {/* The publish endpoint reads the saved flag, not this checkbox, so a
              confirmation that has not been saved yet still fails server-side. */}
          <p className={styles.confirmHint}>
            {state.content_complete
              ? "Save draft to record this confirmation, then publish."
              : "Publish approved settings stays disabled until this is confirmed."}
          </p>
        </div>
      )}
    </form>
  );
}
/**
 * An asset slot. The ID stays a plain editable field so a known media-library
 * ID can still be pasted, and the picker beside it uploads a file straight from
 * the device through the same signed Cloudinary flow the media library uses.
 */
function AssetField({
  label,
  hint,
  folder,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  folder: string;
  value: string;
  onChange(value: string): void;
}) {
  const [state, setState] = useState<"" | "uploading" | "pending" | "failed">(
    "",
  );
  const [preview, setPreview] = useState("");

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setState("uploading");
    try {
      const asset = await requestUpload({
        file,
        folder,
        altText: label,
        tags: ["brand"],
      });
      onChange(asset.id);
      setPreview(asset.publicUrl);
      // A draft asset means the media provider is not configured yet; the
      // record exists but nothing has reached Cloudinary.
      setState(asset.status === "ready" ? "" : "pending");
    } catch {
      setState("failed");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className={styles.assetField}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{label}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
      </label>
      <div className={styles.assetTools}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.assetPreview} src={preview} alt="" />
        ) : null}
        <label className={styles.assetUpload}>
          {state === "uploading" ? "Uploading…" : "Upload from device"}
          <input
            type="file"
            accept="image/*"
            aria-label={`Upload ${label} from device`}
            disabled={state === "uploading"}
            onChange={pick}
          />
        </label>
        {value ? (
          <button
            type="button"
            className={styles.assetClear}
            onClick={() => {
              onChange("");
              setPreview("");
              setState("");
            }}
          >
            Clear
          </button>
        ) : null}
        {state === "failed" ? (
          <span className={styles.assetFailed} role="alert">
            Upload did not complete. Try again.
          </span>
        ) : null}
        {state === "pending" ? (
          <span className={styles.assetNote}>
            Saved. The media provider is still finishing the transfer.
          </span>
        ) : null}
      </div>
    </div>
  );
}
/**
 * Turns a secret_status key into a service name. The heading already says these
 * are keys, so "email_configured" reads as "Email" and the state is left to the
 * value beside it.
 */
function serviceLabel(name: string) {
  const words = name.replace(/_configured$/, "").replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange(value: string): void;
}) {
  // The hint sits under the input rather than trailing the label. Inline hints
  // wrapped to a second line on some fields and not others, which pushed the
  // inputs in a row to different heights.
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
      {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
    </label>
  );
}
/**
 * Repeatable row editor. Replaces the raw JSON textareas so a non-technical
 * editor can add, reorder and remove entries without writing brackets.
 */
function ListField<T>({
  title,
  description,
  addLabel,
  emptyLabel,
  items,
  blank,
  onChange,
  children,
}: {
  title: string;
  description: string;
  addLabel: string;
  emptyLabel: string;
  items: T[];
  blank: () => T;
  onChange(next: T[]): void;
  children(item: T, update: (patch: Partial<T>) => void): React.ReactNode;
}) {
  const rows = Array.isArray(items) ? items : [];
  function replace(index: number, patch: Partial<T>) {
    onChange(
      rows.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    );
  }
  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  return (
    <div className={styles.listField}>
      <div className={styles.listHead}>
        <div className={styles.listTitle}>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <span className={styles.listIndex}>
          {rows.length} {rows.length === 1 ? "entry" : "entries"}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className={styles.listEmpty}>{emptyLabel}</p>
      ) : (
        <ul className={styles.listRows}>
          {rows.map((row, index) => (
            <li className={styles.listRow} key={index}>
              <div className={styles.listRowTop}>
                <span className={styles.listIndex}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.listRowTools}>
                  <button
                    type="button"
                    aria-label={`Move ${title} entry ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${title} entry ${index + 1} down`}
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={styles.removeRow}
                    aria-label={`Remove ${title} entry ${index + 1}`}
                    onClick={() =>
                      onChange(rows.filter((_, position) => position !== index))
                    }
                  >
                    Remove
                  </button>
                </span>
              </div>
              <div className={styles.listFields}>
                {children(row, (patch) => replace(index, patch))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className={styles.addRow}
        onClick={() => onChange([...rows, blank()])}
      >
        {addLabel}
      </button>
    </div>
  );
}

function RowField({
  label,
  hint,
  value,
  wide,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  wide?: boolean;
  onChange(value: string): void;
}) {
  return (
    <label className={wide ? styles.listWide : undefined}>
      <span>
        {label}
        {hint ? <span> — {hint}</span> : null}
      </span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
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
