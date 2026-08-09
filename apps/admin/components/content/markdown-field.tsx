"use client";

import { useRef, useState } from "react";
import { AiAssist, type AiAssistField } from "@joe-kuntani/shared/ui/ai-assist";
import { Markdown } from "@joe-kuntani/shared/ui/markdown";
import styles from "./markdown-field.module.css";

/**
 * The body editor: Markdown source, a formatting toolbar, and a live preview.
 *
 * Bodies were always Markdown — the public pages just never parsed them, so an
 * editor typing `**bold**` published the asterisks and had no way to find out
 * before it was live. The preview renders through the same `<Markdown>`
 * component the public page uses, so this is the published output rather than a
 * lookalike that can drift from it.
 */

type Wrap = { before: string; after: string; placeholder: string };

const ACTIONS: { key: string; label: string; title: string; wrap: Wrap }[] = [
  {
    key: "bold",
    label: "B",
    title: "Bold",
    wrap: { before: "**", after: "**", placeholder: "bold text" },
  },
  {
    key: "italic",
    label: "I",
    title: "Italic",
    wrap: { before: "_", after: "_", placeholder: "italic text" },
  },
  {
    key: "h2",
    label: "H2",
    title: "Heading",
    wrap: { before: "## ", after: "", placeholder: "Heading" },
  },
  {
    key: "link",
    label: "Link",
    title: "Link",
    wrap: { before: "[", after: "](https://)", placeholder: "link text" },
  },
  {
    key: "list",
    label: "List",
    title: "Bulleted list",
    wrap: { before: "- ", after: "", placeholder: "list item" },
  },
  {
    key: "quote",
    label: "Quote",
    title: "Block quote",
    wrap: { before: "> ", after: "", placeholder: "quoted line" },
  },
];

export function MarkdownField({
  label,
  value,
  onChange,
  assist,
  hint,
  rows = 16,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  assist?: AiAssistField;
  hint?: string;
  rows?: number;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  /** Wraps the selection, or inserts a placeholder when nothing is selected. */
  function apply(wrap: Wrap) {
    const area = areaRef.current;
    if (!area) return;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const selected = value.slice(start, end) || wrap.placeholder;
    const next =
      value.slice(0, start) +
      wrap.before +
      selected +
      wrap.after +
      value.slice(end);
    onChange(next);
    // Re-select the text that was just wrapped so a second click toggles around
    // the same words rather than the caret jumping to the end.
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(
        start + wrap.before.length,
        start + wrap.before.length + selected.length,
      );
    });
  }

  const previewID = "markdown-preview";

  return (
    <div className={styles.field}>
      <div className={styles.head}>
        <span className={styles.label} id="markdown-label">
          {label}
        </span>
        <div className={styles.tabs} role="tablist" aria-label={`${label} view`}>
          {(["write", "preview"] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              aria-controls={name === "preview" ? previewID : undefined}
              className={styles.tab}
              onClick={() => setTab(name)}
            >
              {name === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}

      {tab === "write" ? (
        <>
          <div className={styles.toolbar}>
            {ACTIONS.map((action) => (
              <button
                key={action.key}
                type="button"
                className={styles.tool}
                data-key={action.key}
                title={action.title}
                aria-label={action.title}
                onClick={() => apply(action.wrap)}
              >
                {action.label}
              </button>
            ))}
          </div>
          <textarea
            ref={areaRef}
            aria-labelledby="markdown-label"
            className={styles.area}
            rows={rows}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            spellCheck
          />
        </>
      ) : (
        <div className={styles.preview} id={previewID} role="tabpanel">
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className={styles.empty}>Nothing written yet.</p>
          )}
        </div>
      )}

      {assist ? (
        <AiAssist field={assist} label={label} value={value} onApply={onChange} />
      ) : null}
    </div>
  );
}
