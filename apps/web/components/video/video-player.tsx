"use client";

import { useEffect, useState } from "react";
import { Play } from "@phosphor-icons/react";

import type { PublicVideo } from "./video-data";
import styles from "./video-player.module.css";

export function VideoPlayer({ video }: { video: PublicVideo }) {
  const [state, setState] = useState<"poster" | "loading" | "playing" | "error">(
    "poster",
  );
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    if (state !== "loading") return;
    const timeout = window.setTimeout(() => setState("error"), 12_000);
    return () => window.clearTimeout(timeout);
  }, [state]);

  if (state === "error") {
    return (
      <div className={styles.unavailable} role="alert">
        <p>This video could not be loaded.</p>
        <button type="button" onClick={() => setState("poster")}>
          Try again
        </button>
      </div>
    );
  }

  if (state === "loading" || state === "playing") {
    return (
      <div className={styles.player} data-state={state}>
        <iframe
          className={styles.frame}
          src={`${video.playback.embed_url}?autoplay=true`}
          title={video.title}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          onLoad={() => setState("playing")}
          onError={() => setState("error")}
        />
        {state === "loading" ? (
          <span className={styles.loading} role="status">
            Loading video…
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <button
      className={styles.poster}
      type="button"
      onClick={() => setState("loading")}
      aria-label={`Play ${video.title}`}
    >
      {/* Bunny's poster loads without preloading the player. */}
      {posterFailed ? (
        <span className={styles.posterFallback} aria-hidden="true">
          JK
        </span>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={video.thumbnail_url || video.playback.thumbnail_url}
            alt=""
            width={1280}
            height={720}
            loading="lazy"
            onError={() => setPosterFailed(true)}
          />
        </>
      )}
      <span>
        <Play weight="fill" size={22} aria-hidden="true" /> Play
      </span>
    </button>
  );
}
