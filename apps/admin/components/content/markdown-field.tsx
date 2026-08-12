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
import { Select } from "@joe-kuntani/shared/ui/select";
import styles from "./markdown-field.module.css";

/** "Normal text" is the placeholder rather than an entry: it names the resting
    state, and applyHeading ignores the empty value choosing it sends. */
const HEADINGS = [
  { value: "2", label: "Heading 2" },
  { value: "3", label: "Heading 3" },
  { value: "4", label: "Heading 4" },
] as const;

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
            {/* A command, not a stored value: it applies a style and returns to
                reading "Normal text". Holding the value at "" is what makes the
                control snap back, exactly as the old select's own reset did. */}
            <div className={styles.styleSelect}>
              <Select
                aria-label="Text style"
                variant="bare"
                value=""
                options={HEADINGS}
                placeholder="Normal text"
                disabled={tab === "preview"}
                onChange={applyHeading}
              />
            </div>
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
        <AiAssist
          field={assist}
          label={label}
          value={value}
          onApply={onChange}
        />
      ) : null}
    </div>
  );
}
