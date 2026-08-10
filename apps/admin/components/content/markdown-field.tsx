"use client";

import {
  Code,
  Eye,
  LinkSimple,
  ListBullets,
  ListNumbers,
  Minus,
  PencilSimple,
  Quotes,
  TextB,
  TextItalic,
} from "@phosphor-icons/react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { AiAssist, type AiAssistField } from "@joe-kuntani/shared/ui/ai-assist";
import { Markdown } from "@joe-kuntani/shared/ui/markdown";
import styles from "./markdown-field.module.css";

type Wrap = { before: string; after: string; placeholder: string };

const ACTIONS = [
  {
    key: "bold",
    title: "Bold",
    wrap: { before: "**", after: "**", placeholder: "bold text" },
    icon: TextB,
  },
  {
    key: "italic",
    title: "Italic",
    wrap: { before: "_", after: "_", placeholder: "italic text" },
    icon: TextItalic,
  },
  {
    key: "link",
    title: "Link",
    wrap: { before: "[", after: "](https://)", placeholder: "link text" },
    icon: LinkSimple,
  },
  {
    key: "list",
    title: "Bulleted list",
    wrap: { before: "- ", after: "", placeholder: "list item" },
    icon: ListBullets,
  },
  {
    key: "numbered-list",
    title: "Numbered list",
    wrap: { before: "1. ", after: "", placeholder: "list item" },
    icon: ListNumbers,
  },
  {
    key: "quote",
    title: "Block quote",
    wrap: { before: "> ", after: "", placeholder: "quoted line" },
    icon: Quotes,
  },
  {
    key: "code",
    title: "Inline code",
    wrap: { before: "`", after: "`", placeholder: "code" },
    icon: Code,
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
  const fieldID = useId();
  const labelID = `${fieldID}-label`;
  const previewID = `${fieldID}-preview`;

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
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(
        start + wrap.before.length,
        start + wrap.before.length + selected.length,
      );
    });
  }

  function applyHeading(level: string) {
    if (!level) return;
    apply({
      before: `${"#".repeat(Number(level))} `,
      after: "",
      placeholder: "Heading",
    });
  }

  function handleShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    const action = ACTIONS.find(
      (item) =>
        item.key === (key === "b" ? "bold" : key === "i" ? "italic" : ""),
    );
    if (!action) return;
    event.preventDefault();
    apply(action.wrap);
  }

  return (
    <div className={styles.field}>
      <div className={styles.head}>
        <span className={styles.label} id={labelID}>
          {label}
        </span>
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}

      <div className={styles.editor}>
        <div className={styles.toolbar} aria-label={`${label} formatting`}>
          <div className={styles.formatting} aria-hidden={tab === "preview"}>
            <label className={styles.styleSelect}>
              <span className={styles.visuallyHidden}>Text style</span>
              <select
                aria-label="Text style"
                defaultValue=""
                disabled={tab === "preview"}
                onChange={(event) => {
                  applyHeading(event.target.value);
                  event.target.value = "";
                }}
              >
                <option value="">Normal text</option>
                <option value="2">Heading 2</option>
                <option value="3">Heading 3</option>
                <option value="4">Heading 4</option>
              </select>
            </label>
            <span className={styles.divider} aria-hidden="true" />
            {ACTIONS.map((action, index) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  className={styles.tool}
                  title={action.title}
                  aria-label={action.title}
                  disabled={tab === "preview"}
                  onClick={() => apply(action.wrap)}
                >
                  <Icon size={17} weight={index < 2 ? "bold" : "regular"} />
                </button>
              );
            })}
            <button
              type="button"
              className={styles.tool}
              title="Horizontal divider"
              aria-label="Horizontal divider"
              disabled={tab === "preview"}
              onClick={() =>
                apply({ before: "\n\n---\n\n", after: "", placeholder: "" })
              }
            >
              <Minus size={17} weight="bold" />
            </button>
          </div>

          <div
            className={styles.tabs}
            role="tablist"
            aria-label={`${label} view`}
          >
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
                {name === "write" ? (
                  <PencilSimple size={15} aria-hidden="true" />
                ) : (
                  <Eye size={15} aria-hidden="true" />
                )}
                {name === "write" ? "Write" : "Preview"}
              </button>
            ))}
          </div>
        </div>

        {tab === "write" ? (
          <textarea
            ref={areaRef}
            aria-labelledby={labelID}
            className={styles.area}
            rows={rows}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleShortcut}
            spellCheck
          />
        ) : (
          <div className={styles.preview} id={previewID} role="tabpanel">
            {value.trim() ? (
              <Markdown>{value}</Markdown>
            ) : (
              <p className={styles.empty}>Nothing written yet.</p>
            )}
          </div>
        )}
      </div>

      {assist ? (
        <AiAssist field={assist} label={label} value={value} onApply={onChange} />
      ) : null}
    </div>
  );
}
