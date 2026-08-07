"use client";

import {
  ArrowsOutSimpleIcon,
  CheckIcon,
  MagicWandIcon,
  SpinnerGapIcon,
  TextAaIcon,
  TextAlignLeftIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";
import styles from "./ai-assist.module.css";

/**
 * Copy assistant for admin long-text fields.
 *
 * The suggestion streams into a preview panel rather than into the field, so a
 * rewrite never destroys what the operator typed until they accept it. Their
 * draft is restorable for one step after applying.
 */

export type AiAssistAction =
  | "rewrite"
  | "expand"
  | "shorten"
  | "formalize"
  | "proofread";

/** Field kinds the route knows length and audience guidance for. */
export type AiAssistField =
  | "summary"
  | "description"
  | "body"
  | "requirements"
  | "notes";

type AiAssistProps = {
  /** Current field text. Nothing is sent when this is blank. */
  value: string;
  /** Called only when the operator accepts a suggestion. */
  onApply: (next: string) => void;
  /** Tells the model what kind of field this is, so length guidance fits. */
  field?: "summary" | "description" | "body" | "requirements" | "notes";
  /** Accessible name of the field being assisted, e.g. "Summary". */
  label?: string;
  disabled?: boolean;
};

const ACTIONS: {
  id: AiAssistAction;
  label: string;
  Icon: typeof MagicWandIcon;
}[] = [
  { id: "rewrite", label: "Rewrite", Icon: MagicWandIcon },
  { id: "expand", label: "Expand", Icon: ArrowsOutSimpleIcon },
  { id: "shorten", label: "Shorten", Icon: TextAlignLeftIcon },
  { id: "formalize", label: "Formalize", Icon: TextAaIcon },
  { id: "proofread", label: "Proofread", Icon: CheckIcon },
];

function csrfCookie() {
  const prefix = "jk_admin_csrf=";
  return (
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) ?? ""
  );
}

export function AiAssist({
  value,
  onApply,
  field = "description",
  label = "this field",
  disabled = false,
}: AiAssistProps) {
  const [busy, setBusy] = useState<AiAssistAction | null>(null);
  const [suggestion, setSuggestion] = useState("");
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const empty = value.trim().length === 0;

  const run = useCallback(
    async (action: AiAssistAction) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setBusy(action);
      setError("");
      setSuggestion("");
      setUndo(null);
      try {
        const response = await fetch("/api/admin/ai/assist", {
          method: "POST",
          credentials: "same-origin",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": decodeURIComponent(csrfCookie()),
          },
          body: JSON.stringify({ action, field, text: value }),
        });
        if (!response.ok || !response.body) {
          const title = await response
            .json()
            .then((body: { title?: string }) => body.title)
            .catch(() => "");
          throw new Error(title || "The writing assistant is unavailable.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let text = "";
        for (;;) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          text += decoder.decode(chunk, { stream: true });
          setSuggestion(text);
        }
        text += decoder.decode();
        setSuggestion(text);
        if (!text.trim()) setError("No suggestion came back. Try again.");
      } catch (cause) {
        if ((cause as Error)?.name === "AbortError") return;
        setError(
          cause instanceof Error
            ? cause.message
            : "The writing assistant is unavailable.",
        );
        setSuggestion("");
      } finally {
        if (abort.current === controller) {
          abort.current = null;
          setBusy(null);
        }
      }
    },
    [field, value],
  );

  function accept() {
    setUndo(value);
    onApply(suggestion.trim());
    setSuggestion("");
  }

  function discard() {
    abort.current?.abort();
    abort.current = null;
    setBusy(null);
    setSuggestion("");
    setError("");
  }

  function revert() {
    if (undo === null) return;
    onApply(undo);
    setUndo(null);
  }

  return (
    <div className={styles.assist}>
      <div
        className={styles.bar}
        role="group"
        aria-label={`AI writing help for ${label}`}
      >
        <span className={styles.badge} aria-hidden="true">
          <MagicWandIcon size={13} weight="fill" />
          AI
        </span>
        {ACTIONS.map(({ id, label: actionLabel, Icon }) => (
          <button
            key={id}
            type="button"
            className={styles.action}
            disabled={disabled || empty || busy !== null}
            aria-busy={busy === id}
            onClick={() => void run(id)}
          >
            {busy === id ? (
              <SpinnerGapIcon size={13} className={styles.spinner} />
            ) : (
              <Icon size={13} />
            )}
            {actionLabel}
          </button>
        ))}
        {undo !== null && !suggestion ? (
          <button type="button" className={styles.undo} onClick={revert}>
            Undo AI edit
          </button>
        ) : null}
      </div>

      {empty ? (
        <p className={styles.hint}>
          Write a rough draft first — the assistant edits what is there and
          never invents facts.
        </p>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {suggestion ? (
        <div className={styles.preview}>
          <div className={styles.previewHead}>
            <p className={styles.previewTitle}>
              Suggestion{busy ? " · writing…" : ""}
            </p>
            <div className={styles.previewActions}>
              <button
                type="button"
                className={styles.accept}
                disabled={busy !== null}
                onClick={accept}
              >
                <CheckIcon size={14} weight="bold" />
                Use this
              </button>
              <button
                type="button"
                className={styles.discard}
                onClick={discard}
              >
                <XIcon size={14} weight="bold" />
                {busy ? "Stop" : "Discard"}
              </button>
            </div>
          </div>
          <p className={styles.previewBody} aria-live="polite">
            {suggestion}
          </p>
        </div>
      ) : null}
    </div>
  );
}
