"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import styles from "./select.module.css";
import { usePopoverPlacement } from "./use-popover-placement";

const subscribeToMount = () => () => {};

export type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function Select({
  id,
  name,
  value,
  defaultValue = "",
  onChange,
  options,
  placeholder = "Choose one",
  required,
  disabled,
  className,
  "aria-label": ariaLabel,
}: SelectProps) {
  const generatedId = useId();
  const listId = `${generatedId}-list`;
  const buttonId = id || `${generatedId}-button`;
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const selected = isControlled ? value : internal;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const mounted = useSyncExternalStore(
    subscribeToMount,
    () => true,
    () => false,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const placement = usePopoverPlacement(open, triggerRef, listRef);

  const selectedOption = options.find((item) => item.value === selected);
  const label = selectedOption?.label || placeholder;

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
  }, [open, placement]);

  function commit(next: string) {
    if (!isControlled) setInternal(next);
    onChange?.(next);
    setOpen(false);
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      setOpen(true);
      const index = Math.max(
        0,
        options.findIndex((item) => item.value === selected),
      );
      setActiveIndex(index);
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(options.length - 1, index + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) commit(option.value);
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    }
  }

  const listStyle: CSSProperties | undefined = placement
    ? {
        top: placement.top,
        left: placement.left,
        minWidth: placement.minWidth,
        maxWidth: placement.maxWidth,
        maxHeight: placement.maxHeight,
      }
    : undefined;

  const list =
    open && placement ? (
      <ul
        ref={listRef}
        id={listId}
        className={styles.list}
        role="listbox"
        tabIndex={-1}
        aria-labelledby={buttonId}
        style={listStyle}
        onKeyDown={onListKeyDown}
      >
        {placeholder && !required ? (
          <li
            role="option"
            aria-selected={selected === ""}
            className={styles.option}
            data-active={activeIndex === -1 ? "true" : "false"}
            onMouseEnter={() => setActiveIndex(-1)}
            onClick={() => commit("")}
          >
            {placeholder}
          </li>
        ) : null}
        {options.map((option, index) => (
          <li
            key={option.value || `opt-${index}`}
            role="option"
            aria-selected={selected === option.value}
            className={styles.option}
            data-active={activeIndex === index ? "true" : "false"}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => commit(option.value)}
          >
            {option.label}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div
      ref={rootRef}
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-open={open ? "true" : "false"}
    >
      {name ? (
        <input
          type="hidden"
          name={name}
          value={selected}
          required={required && !selected}
        />
      ) : null}
      <button
        ref={triggerRef}
        id={buttonId}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
          setActiveIndex(
            Math.max(
              0,
              options.findIndex((item) => item.value === selected),
            ),
          );
        }}
        onKeyDown={onButtonKeyDown}
      >
        <span data-empty={!selectedOption ? "true" : "false"}>{label}</span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>
      {mounted && list ? createPortal(list, document.body) : null}
    </div>
  );
}
