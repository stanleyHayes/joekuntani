"use client";

import {
  useId,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import styles from "./otp-input.module.css";

type OTPInputProps = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  "aria-label"?: string;
  autoFocus?: boolean;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function OTPInput({
  length = 6,
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel = "Verification code",
  autoFocus,
}: OTPInputProps) {
  const baseId = useId();
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? "");

  function updateAt(index: number, nextDigit: string) {
    const chars = digits.slice();
    chars[index] = nextDigit;
    const next = chars.join("").slice(0, length);
    onChange(next);
  }

  function focusIndex(index: number) {
    const node = refs.current[Math.max(0, Math.min(length - 1, index))];
    node?.focus();
    node?.select();
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = onlyDigits(event.clipboardData.getData("text")).slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    focusIndex(Math.min(length - 1, pasted.length));
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) {
        updateAt(index, "");
        return;
      }
      if (index > 0) {
        updateAt(index - 1, "");
        focusIndex(index - 1);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusIndex(index - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusIndex(index + 1);
    }
  }

  return (
    <div
      className={styles.root}
      role="group"
      aria-label={ariaLabel}
      data-complete={value.length === length ? "true" : "false"}
    >
      {digits.map((digit, index) => (
        <input
          key={`${baseId}-${index}`}
          ref={(node) => {
            refs.current[index] = node;
          }}
          id={`${baseId}-${index}`}
          className={styles.cell}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && index === 0}
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${length}`}
          onPaste={onPaste}
          onKeyDown={(event) => onKeyDown(index, event)}
          onChange={(event) => {
            const next = onlyDigits(event.target.value).slice(-1);
            updateAt(index, next);
            if (next) focusIndex(index + 1);
          }}
          onFocus={(event) => event.currentTarget.select()}
        />
      ))}
      <input type="hidden" name="code" value={value} />
    </div>
  );
}
