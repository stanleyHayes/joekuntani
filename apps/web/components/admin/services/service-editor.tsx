"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";

import type { PublicService, ServiceQuestion } from "../../services/types";
import { AiAssist, type AiAssistField } from "../../ui/ai-assist";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import { type Draft, emptyDraft, mutationHeaders } from "./services-api";
import styles from "./service-editor.module.css";

/**
 * The service editor, as a page.
 *
 * It used to be a dialog. A service carries seven controls, two of them long
 * prose fields and one a JSON schema an operator has to read back line by line.
 * That does not fit a modal without the modal scrolling, and a modal that
 * scrolls hides its own save button.
 */
export function ServiceEditor({ serviceID }: { serviceID: string }) {
  const router = useRouter();
  const creating = serviceID === "new";
  const [service, setService] = useState<PublicService | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [questionsJSON, setQuestionsJSON] = useState("[]");
  const [questionsValid, setQuestionsValid] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  // The list is read even when creating, because a new service takes its
  // display order from the end of the existing list.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/admin/services", {
            cache: "no-store",
            credentials: "include",
          });
          if (!response.ok) throw new Error();
          const body = (await response.json()) as { items: PublicService[] };
          const items = body.items ?? [];
          if (creating) {
            setDraft({ ...emptyDraft, sort_order: items.length });
            return;
          }
          const found = items.find((item) => item.id === serviceID);
          if (!found) {
            setLoadFailed(true);
            return;
          }
          setService(found);
          setDraft({
            name: found.name,
            summary: found.summary,
            description: found.description,
            category: found.category,
            active: found.active,
            sort_order: found.sort_order,
            form_schema: found.form_schema,
            cta: found.cta,
          });
          setQuestionsJSON(
            JSON.stringify(found.form_schema.questions, null, 2),
          );
        } catch {
          setLoadFailed(true);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [creating, serviceID]);

  function updateQuestions(value: string) {
    setQuestionsJSON(value);
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) throw new Error();
      setDraft((current) =>
        current
          ? {
              ...current,
              form_schema: {
                version: 1,
                questions: parsed as ServiceQuestion[],
              },
            }
          : current,
      );
      setQuestionsValid(true);
    } catch {
      setQuestionsValid(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !questionsValid) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        creating ? "/api/admin/services" : `/api/admin/services/${serviceID}`,
        {
          method: creating ? "POST" : "PUT",
          credentials: "include",
          headers: mutationHeaders(),
          body: JSON.stringify(
            service ? { ...draft, version: service.version } : draft,
          ),
        },
      );
      if (!response.ok) {
        setError(
          response.status === 409
            ? "That service name conflicts with an existing immutable slug."
            : "The service was not accepted. Review every field and question.",
        );
        return;
      }
      // Back to the list, which reloads and shows the saved service. Staying
      // here would leave an operator wondering whether the save took.
      router.push("/admin/services");
      router.refresh();
    } catch {
      setError("The service could not be saved.");
    } finally {
      setPending(false);
    }
  }

  if (loadFailed)
    return (
      <AdminErrorState
        title="That service could not be opened"
        message="It may have been retired or removed. Return to the services list and try again."
      />
    );
  if (!draft) return <AdminSkeleton label="Loading service" variant="table" />;

  return (
    <section className={styles.editor} aria-labelledby="service-editor-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Public offering</p>
          <h2 id="service-editor-heading">
            {creating ? "Add a service" : `Edit ${draft.name || "service"}`}
          </h2>
          <p className="stage-head__lede">
            Changes are saved only when you submit this form. The slug is set
            from the name when the service is first created and never changes.
          </p>
        </div>
        <div className="stage-head__actions">
          <Link className={styles.back} href="/admin/services">
            Back to services
          </Link>
        </div>
      </header>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <form className={styles.form} onSubmit={save}>
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Identity</legend>
          <div className={styles.fieldGrid}>
            <Field
              label="Service name"
              maxLength={120}
              required
              value={draft.name}
              onChange={(name) =>
                setDraft((current) => current && { ...current, name })
              }
            />
            <Field
              label="Category"
              maxLength={80}
              value={draft.category}
              onChange={(category) =>
                setDraft((current) => current && { ...current, category })
              }
            />
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Public copy</legend>
          <div className={styles.stack}>
            <Field
              assist="summary"
              label="Summary"
              maxLength={280}
              multiline
              value={draft.summary}
              onChange={(summary) =>
                setDraft((current) => current && { ...current, summary })
              }
            />
            <Field
              assist="description"
              label="Description"
              maxLength={8000}
              multiline
              value={draft.description}
              onChange={(description) =>
                setDraft((current) => current && { ...current, description })
              }
            />
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Enquiry form</legend>
          <div className={styles.stack}>
            <Field
              label="Call-to-action label"
              maxLength={80}
              required
              value={draft.cta.label}
              onChange={(label) =>
                setDraft(
                  (current) =>
                    current && { ...current, cta: { ...current.cta, label } },
                )
              }
            />
            <label className={styles.field}>
              <span>Service-specific questions (JSON)</span>
              <textarea
                aria-invalid={!questionsValid}
                aria-describedby="questions-help"
                className={styles.schema}
                onChange={(event) => updateQuestions(event.target.value)}
                spellCheck={false}
                value={questionsJSON}
              />
              <small id="questions-help">
                Use unique keys and supported types: text, textarea, select,
                multi_select, date, number or checkbox.
              </small>
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Visibility</legend>
          <label className={styles.checkbox}>
            <input
              checked={draft.active}
              onChange={(event) =>
                setDraft(
                  (current) =>
                    current && { ...current, active: event.target.checked },
                )
              }
              type="checkbox"
            />
            Publish immediately after save
          </label>
          <p className={styles.note}>
            Only active services appear on the public services page.
          </p>
        </fieldset>

        <div className={styles.actions}>
          <button
            className="primary"
            disabled={pending || !questionsValid}
            type="submit"
          >
            {creating ? "Create service" : "Save service"}
          </button>
          <Link className={styles.cancel} href="/admin/services">
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}

function Field({
  assist,
  label,
  maxLength,
  multiline = false,
  onChange,
  required = false,
  value,
}: {
  /** Attaches the AI copy bar. Multiline fields only — prose, not identifiers. */
  assist?: AiAssistField;
  label: string;
  maxLength: number;
  multiline?: boolean;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  const control = {
    maxLength,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
    required,
    value,
  };
  const field = (
    <label className={styles.field}>
      <span>{label}</span>
      {multiline ? <textarea {...control} /> : <input {...control} />}
    </label>
  );
  // Outside the <label>: a label's accessible name comes from its text
  // content, so an AI bar nested inside would rename the control to
  // "Summary AI Rewrite Expand Shorten…".
  if (!assist || !multiline) return field;
  return (
    <div className={styles.fieldGroup}>
      {field}
      <AiAssist field={assist} label={label} value={value} onApply={onChange} />
    </div>
  );
}
