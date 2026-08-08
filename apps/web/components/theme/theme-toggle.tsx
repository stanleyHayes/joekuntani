"use client";

import { LightbulbFilament } from "@phosphor-icons/react";
import { useId, useRef } from "react";

import styles from "./theme-toggle.module.css";
import { useTheme } from "./theme-provider";

type ThemeToggleProps = {
  className?: string;
};

type WebkitAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

let switchAudioContext: AudioContext | null = null;

function playPullSwitchSound(turningOn: boolean) {
  const AudioContextClass =
    window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const context = switchAudioContext ?? new AudioContextClass();
    switchAudioContext = context;
    if (context.state === "suspended") void context.resume();

    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.16, now + 0.004);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    master.connect(context.destination);

    // A short square-wave snap provides the chain/plug mechanism's click.
    const click = context.createOscillator();
    click.type = "square";
    click.frequency.setValueAtTime(150, now);
    click.frequency.exponentialRampToValueAtTime(58, now + 0.045);
    click.connect(master);
    click.start(now);
    click.stop(now + 0.05);

    // The quieter second transient differentiates power-on from power-off.
    const power = context.createOscillator();
    const powerGain = context.createGain();
    power.type = "sine";
    power.frequency.setValueAtTime(turningOn ? 520 : 390, now + 0.035);
    power.frequency.exponentialRampToValueAtTime(
      turningOn ? 920 : 150,
      now + 0.11,
    );
    powerGain.gain.setValueAtTime(0.0001, now + 0.03);
    powerGain.gain.exponentialRampToValueAtTime(0.055, now + 0.045);
    powerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    power.connect(powerGain);
    powerGain.connect(context.destination);
    power.start(now + 0.03);
    power.stop(now + 0.12);
  } catch {
    // Theme switching must remain reliable when browser audio is unavailable.
  }
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const tooltipId = useId();
  const next = theme === "dark" ? "light" : "dark";
  const pullRef = useRef<HTMLSpanElement>(null);
  const dragStart = useRef<number | null>(null);
  const suppressClick = useRef(false);

  function switchTheme(target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    playPullSwitchSound(next === "light");
    toggleTheme({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }

  function resetPull() {
    pullRef.current?.style.setProperty("--cord-pull", "0px");
    dragStart.current = null;
  }

  return (
    <button
      type="button"
      className={[styles.toggle, className].filter(Boolean).join(" ")}
      aria-label={`Switch to ${next} theme`}
      aria-describedby={tooltipId}
      aria-pressed={theme === "dark"}
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        switchTheme(event.currentTarget);
      }}
    >
      <span className={styles.fixture} aria-hidden="true">
        <span
          ref={pullRef}
          className={styles.pull}
          onPointerDown={(event) => {
            dragStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragStart.current === null) return;
            const distance = Math.max(
              0,
              Math.min(30, event.clientY - dragStart.current),
            );
            event.currentTarget.style.setProperty(
              "--cord-pull",
              `${distance}px`,
            );
            if (distance > 5) suppressClick.current = true;
          }}
          onPointerUp={(event) => {
            if (dragStart.current === null) return;
            const distance = Math.max(0, event.clientY - dragStart.current);
            if (distance >= 14) switchTheme(event.currentTarget);
            resetPull();
          }}
          onPointerCancel={resetPull}
        >
          <span className={styles.cord} />
          <span className={styles.bulb} data-theme={theme}>
            <LightbulbFilament
              weight={theme === "light" ? "fill" : "regular"}
            />
          </span>
        </span>
      </span>
      <span className={styles.label}>
        {theme === "dark" ? "Dark" : "Light"}
      </span>
      <span className={styles.tooltip} id={tooltipId} role="tooltip">
        Pull to toggle theme
      </span>
    </button>
  );
}
