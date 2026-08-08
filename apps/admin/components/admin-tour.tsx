"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import styles from "./admin-tour.module.css";

export type TourStep = {
  selector?: string;
  title: string;
  body: string;
  side?: "right" | "bottom" | "top" | "left";
};

const PAD = 8;
const CARD_W = 340;
const TOUR_KEY = "jk.admin.tour.done";

export const ADMIN_TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to staff command",
    body: "This is Joe Kuntani’s back office — publish the brand, run live shows, keep the pipeline clean, and manage who has access.",
  },
  {
    selector: 'aside[aria-label="Administration"]',
    side: "right",
    title: "Your sections",
    body: "Groups collapse and the rail can close. Publish, Live, Pipeline, Team, Account, and Governance stay in one place on every page.",
  },
  {
    selector: '[data-tour="user-menu"]',
    side: "bottom",
    title: "Your account menu",
    body: "Profile, password, preferences, team access, and a replay of this tour live here — plus sign out.",
  },
  {
    selector: 'a[href="/team"]',
    side: "right",
    title: "Users & roles",
    body: "Administrators invite staff, change roles, and disable accounts. Permissions are fixed to the four server roles.",
  },
  {
    selector: 'a[href="/newsletter"]',
    side: "right",
    title: "Newsletter signups",
    body: "Review consent-backed subscribers from the public site and unsubscribe when asked.",
  },
];

export function markTourDone() {
  try {
    localStorage.setItem(TOUR_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function shouldAutoStartTour() {
  try {
    return localStorage.getItem(TOUR_KEY) !== "1";
  } catch {
    return false;
  }
}

export function AdminTour({
  steps = ADMIN_TOUR_STEPS,
  onDone,
}: {
  steps?: TourStep[];
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  useLayoutEffect(() => {
    let raf = 0;
    if (!step?.selector) {
      raf = requestAnimationFrame(() => setRect(null));
      return () => cancelAnimationFrame(raf);
    }
    const el = document.querySelector(step.selector);
    if (!el) {
      raf = requestAnimationFrame(() => setRect(null));
      return () => cancelAnimationFrame(raf);
    }
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    const update = () => setRect(el.getBoundingClientRect());
    raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
    };
  }, [index, step?.selector]);

  const done = useCallback(() => {
    markTourDone();
    onDone();
  }, [onDone]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") done();
      if (event.key === "ArrowRight" && !last)
        setIndex((value) => Math.min(value + 1, steps.length - 1));
      if (event.key === "ArrowLeft")
        setIndex((value) => Math.max(value - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [done, last, steps.length]);

  if (!step) return null;

  const pop = (() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!rect)
      return {
        top: Math.max(80, vh / 2 - 120),
        left: Math.max(16, vw / 2 - CARD_W / 2),
      };
    const box = {
      t: rect.top - PAD,
      l: rect.left - PAD,
      b: rect.bottom + PAD,
      r: rect.right + PAD,
    };
    let top = box.b + 14;
    let left = Math.min(Math.max(16, box.l), vw - CARD_W - 16);
    if (step.side === "right") {
      top = Math.min(Math.max(16, box.t), vh - 240);
      left = box.r + 14;
      if (left + CARD_W > vw - 8)
        left = Math.min(Math.max(16, box.l), vw - CARD_W - 16);
    } else if (step.side === "top" || top + 220 > vh) {
      top = Math.max(16, box.t - 220);
    }
    return { top, left };
  })();

  return (
    <div
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label="Admin tour"
    >
      {rect ? (
        <>
          <div
            className={styles.shade}
            style={{
              inset: `0 ${window.innerWidth - rect.right - PAD}px ${window.innerHeight - rect.top + PAD}px 0`,
            }}
          />
          <div
            className={styles.shade}
            style={{ inset: `${rect.bottom + PAD}px 0 0 0` }}
          />
          <div
            className={styles.shade}
            style={{
              inset: `0 0 ${window.innerHeight - rect.bottom - PAD}px ${rect.right + PAD}px`,
            }}
          />
          <div
            className={styles.shade}
            style={{
              inset: `${rect.top - PAD}px ${window.innerWidth - rect.left + PAD}px 0 0`,
            }}
          />
          <div
            className={styles.ring}
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
            }}
          />
        </>
      ) : (
        <div className={styles.dim} />
      )}
      <div
        className={styles.card}
        style={{ top: pop.top, left: pop.left, width: CARD_W }}
      >
        <p className={styles.step}>
          Step {index + 1} of {steps.length}
        </p>
        <h2 className={styles.title}>{step.title}</h2>
        <p className={styles.body}>{step.body}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={done}>
            Skip
          </button>
          <div className={styles.nav}>
            <button
              type="button"
              className={styles.ghost}
              disabled={index === 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
            >
              Back
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                if (last) done();
                else setIndex((value) => value + 1);
              }}
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
